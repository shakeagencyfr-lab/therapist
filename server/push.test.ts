import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clePubliqueDe,
  clesVapid,
  contenuDuRappel,
  lireReponse,
  pousserLesRappels,
  serviceDePushConnu,
  statutDeLEnvoi,
  type Appareil,
  type CleVapid,
  type Envoyeur,
} from './push.js'

describe('la clé VAPID', () => {
  /* Une seule variable à poser : la publique se déduit de la privée. Si la
     déduction divergeait de la paire que produit web-push lui-même, chaque
     service d'envoi refuserait tout — en silence. */
  it('déduit de la privée exactement la publique de la paire', () => {
    for (let i = 0; i < 5; i += 1) {
      const paire = webpush.generateVAPIDKeys()
      expect(clePubliqueDe(paire.privateKey)).toBe(paire.publicKey)
    }
  })

  it('refuse une clé mal collée plutôt que de signer faux', () => {
    for (const brut of ['', 'abc', `${'A'.repeat(43)}=`, 'A'.repeat(44), 'é'.repeat(43)]) {
      expect({ [brut]: clePubliqueDe(brut) }).toEqual({ [brut]: null })
    }
  })

  const avant = { ...process.env }
  afterEach(() => {
    process.env = { ...avant }
  })

  it('ne se prétend pas prête sans clé', () => {
    delete process.env.VAPID_PRIVATE_KEY
    expect(clesVapid()).toBeNull()
  })

  it('prend un contact posé exprès, et le site sinon', () => {
    process.env.VAPID_PRIVATE_KEY = webpush.generateVAPIDKeys().privateKey
    delete process.env.VAPID_SUBJECT
    expect(clesVapid()?.sujet).toBe('https://klaroweb.site')
    process.env.VAPID_SUBJECT = 'mailto:contact@exemple.fr'
    expect(clesVapid()?.sujet).toBe('mailto:contact@exemple.fr')
    process.env.VAPID_SUBJECT = 'pas un contact'
    expect(clesVapid()?.sujet).toBe('https://klaroweb.site')
  })
})

describe('les adresses où le serveur écrit', () => {
  it('accepte les quatre services qui livrent les notifications', () => {
    for (const ep of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QGx',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ]) {
      expect({ [ep]: serviceDePushConnu(ep) }).toEqual({ [ep]: true })
    }
  })

  /* Ce serveur poste à ces adresses : tout le reste ferait de lui un relais. */
  it("refuse tout le reste, y compris ce qui s'en déguise", () => {
    for (const ep of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com.exemple.test/x',
      'https://fcm.googleapis.com@exemple.test/x',
      'https://exemple.test/fcm.googleapis.com/',
      'https://169.254.169.254/latest',
      'https://notify.windows.com.exemple.test/x',
    ]) {
      expect({ [ep]: serviceDePushConnu(ep) }).toEqual({ [ep]: false })
    }
  })
})

describe('le message qui part', () => {
  it('porte le titre, le texte, le chemin à rouvrir et son étiquette', () => {
    const lu = JSON.parse(contenuDuRappel({ titre: 'Ce soir', corps: 'Respirez.' }, '/lohypnose/mon', 'p1'))
    expect(lu).toEqual({ titre: 'Ce soir', corps: 'Respirez.', url: '/lohypnose/mon', etiquette: 'p1' })
  })

  it('ne rouvre que l’espace patient, quoi qu’on ait glissé dans le chemin', () => {
    for (const chemin of ['https://exemple.test/', '//exemple.test/mon', '/admin', null, '/../mon']) {
      expect(JSON.parse(contenuDuRappel({ titre: 't', corps: 'c' }, chemin, 'p')).url).toBe('/mon')
    }
  })

  /* Un service refuse au-delà de 4 Ko chiffrés ; un écran verrouillé
     n'affiche que les premières lignes. */
  it('borne un texte trop long sans casser un mot', () => {
    const long = 'respirez lentement '.repeat(80)
    const lu = JSON.parse(contenuDuRappel({ titre: 'x'.repeat(200), corps: long }, '/mon', 'p'))
    expect(lu.corps.length).toBeLessThanOrEqual(600)
    expect(lu.corps.endsWith('…')).toBe(true)
    expect(lu.corps).not.toMatch(/respir…$/)
    expect(Array.from(lu.titre as string).length).toBeLessThanOrEqual(80)
    expect(Buffer.byteLength(contenuDuRappel({ titre: 'é'.repeat(500), corps: 'à'.repeat(5000) }, '/mon', 'p'))).toBeLessThan(3000)
  })
})

describe('ce qui revient', () => {
  it('lit les codes des services', () => {
    expect(lireReponse(201)).toBe('livre')
    expect(lireReponse(404)).toBe('perime')
    expect(lireReponse(410)).toBe('perime')
    expect(lireReponse(403)).toBe('echec')
    expect(lireReponse(0)).toBe('echec')
  })

  /* « Aucun téléphone » n'est pas un échec : c'est une patiente qui n'a pas
     activé les rappels — et la thérapeute peut y remédier en séance. */
  it('distingue le rappel arrivé, l’absence de téléphone et l’échec', () => {
    expect(statutDeLEnvoi([])).toBe('sans_appareil')
    expect(statutDeLEnvoi(['echec', 'livre'])).toBe('envoyee')
    expect(statutDeLEnvoi(['echec', 'perime'])).toBe('echec')
  })
})

/* ------------------------------------------------------------------ *
 * Un passage entier, contre une base et des téléphones simulés
 * ------------------------------------------------------------------ */

interface Reclame {
  push_id: string
  patient_id: string
  titre: string
  corps: string
}

function fausseBase(lots: Reclame[][], appareils: Appareil[]) {
  const journal = {
    statuts: [] as Array<Record<string, unknown>>,
    effaces: [] as string[],
    livres: [] as string[],
    reclamations: 0,
  }
  const admin = {
    rpc: async () => {
      journal.reclamations += 1
      return { data: lots.shift() ?? [], error: null }
    },
    from: () => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => ({
          data: appareils.filter((a) => ids.includes(a.patient_id)),
          error: null,
        }),
      }),
      update: (valeurs: Record<string, unknown>) => {
        const filtres: Record<string, unknown> = {}
        const chaine = {
          eq(col: string, v: unknown): unknown {
            filtres[col] = v
            if ('push_id' in filtres && 'patient_id' in filtres) {
              journal.statuts.push({ ...filtres, ...valeurs })
              return Promise.resolve({ error: null })
            }
            return chaine
          },
          in: async (_col: string, ids: string[]) => {
            journal.livres.push(...ids)
            return { error: null }
          },
        }
        return chaine
      },
      delete: () => ({
        in: async (_col: string, ids: string[]) => {
          journal.effaces.push(...ids)
          return { error: null }
        },
      }),
    }),
  }
  return { admin: admin as unknown as SupabaseClient, journal }
}

const CLES: CleVapid = { publique: 'pub', privee: 'priv', sujet: 'https://klaroweb.site' }
const figee = () => 1_700_000_000_000

function appareil(id: string, patient: string, endpoint = `https://fcm.googleapis.com/fcm/send/${id}`): Appareil {
  return { id, patient_id: patient, endpoint, p256dh: 'k', auth: 'a', chemin: '/mon' }
}

describe('un passage', () => {
  it('pousse, retire les téléphones périmés et dit ce qui est arrivé à chacune', async () => {
    const { admin, journal } = fausseBase(
      [[
        { push_id: 'n1', patient_id: 'anna', titre: 'Ce soir', corps: 'Respirez.' },
        { push_id: 'n1', patient_id: 'bea', titre: 'Ce soir', corps: 'Respirez.' },
      ]],
      [appareil('tel-anna', 'anna'), appareil('vieux-anna', 'anna')],
    )
    const envois: string[] = []
    const envoyer: Envoyeur = async (a) => {
      envois.push(a.id)
      return a.id === 'vieux-anna' ? 410 : 201
    }

    const bilan = await pousserLesRappels(admin, CLES, envoyer, figee)

    expect(bilan).toEqual({ reclames: 2, envoyes: 1, sansAppareil: 1, echecs: 0, appareilsRetires: 1 })
    expect(envois.sort()).toEqual(['tel-anna', 'vieux-anna'])
    expect(journal.effaces).toEqual(['vieux-anna'])
    expect(journal.livres).toEqual(['tel-anna'])
    // Les deux sont traitées de front : l'ordre d'écriture n'a pas de sens.
    expect(journal.statuts).toHaveLength(2)
    expect(journal.statuts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ push_id: 'n1', patient_id: 'anna', push_status: 'envoyee' }),
        expect.objectContaining({ push_id: 'n1', patient_id: 'bea', push_status: 'sans_appareil' }),
      ]),
    )
  })

  it('écrit un échec quand tous ses téléphones refusent', async () => {
    const { admin, journal } = fausseBase(
      [[{ push_id: 'n2', patient_id: 'anna', titre: 't', corps: 'c' }]],
      [appareil('a1', 'anna'), appareil('a2', 'anna')],
    )
    const bilan = await pousserLesRappels(admin, CLES, async () => 503, figee)
    expect(bilan.echecs).toBe(1)
    expect(journal.statuts[0]).toMatchObject({ push_status: 'echec' })
    expect(journal.effaces).toEqual([])
  })

  /* Une ligne glissée en base hors de la fonction d'inscription ne fait pas
     de ce serveur un relais : elle est ignorée, jamais contactée. */
  it("n'écrit jamais à une adresse hors des services connus", async () => {
    const { admin, journal } = fausseBase(
      [[{ push_id: 'n3', patient_id: 'anna', titre: 't', corps: 'c' }]],
      [appareil('piege', 'anna', 'https://interne.exemple.test/hook')],
    )
    const touches: string[] = []
    await pousserLesRappels(admin, CLES, async (a) => {
      touches.push(a.endpoint)
      return 201
    }, figee)
    expect(touches).toEqual([])
    expect(journal.statuts[0]).toMatchObject({ push_status: 'sans_appareil' })
  })

  it("s'arrête quand il n'y a plus rien à réclamer", async () => {
    const { admin, journal } = fausseBase([[]], [])
    const bilan = await pousserLesRappels(admin, CLES, async () => 201, figee)
    expect(bilan.reclames).toBe(0)
    expect(journal.reclamations).toBe(1)
  })

  it('reprend un lot plein, et seulement tant qu’il en reste', async () => {
    const plein = Array.from({ length: 50 }, (_, i) => ({
      push_id: `n${i}`, patient_id: 'bea', titre: 't', corps: 'c',
    }))
    const { admin, journal } = fausseBase([plein, [plein[0]]], [])
    const bilan = await pousserLesRappels(admin, CLES, async () => 201, figee)
    expect(bilan.reclames).toBe(51)
    expect(journal.reclamations).toBe(2)
  })
})

/* La liste des services est écrite deux fois : dans la contrainte de 0040,
   qui refuse l'inscription, et dans ce serveur, qui refuse l'envoi. Si
   elles divergeaient, l'une des deux gardes serait fausse sans que rien ne
   le montre. */
describe('les deux gardes disent la même chose', () => {
  it('la base et le serveur acceptent exactement les mêmes services', async () => {
    const { readFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const ici = dirname(fileURLToPath(import.meta.url))
    const groupe = (texte: string) => /\^https:(?:\/\/|\\\/\\\/)\((.+?)\)(?:\/|\\\/)/.exec(texte)?.[1]
    const sql = groupe(readFileSync(join(ici, '..', 'supabase', 'migrations', '0040_rappels_sur_le_telephone.sql'), 'utf8'))
    const serveur = groupe(readFileSync(join(ici, 'push.ts'), 'utf8'))
    expect(sql).toBeTruthy()
    expect(sql).toBe(serveur)
  })
})
