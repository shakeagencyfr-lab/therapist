import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { afterEach, describe, expect, it } from 'vitest'
import { MOT_MASQUE, SOIR_MASQUE } from '../src/lib/discretion.js'
import {
  clePubliqueDe,
  clesVapid,
  contenuDuRappel,
  fonctionAbsente,
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
  masque?: boolean | null
}

interface SoirReclame {
  patient_id: string
  jour: string
  titre: string
  corps: string
  masque?: boolean | null
}

type ErreurBase = { code?: string; message: string }

function fausseBase(
  lots: Reclame[][],
  appareils: Appareil[],
  soirs: Array<SoirReclame[] | ErreurBase> = [],
  { statutEnPanne = false } = {},
) {
  const journal = {
    statuts: [] as Array<Record<string, unknown>>,
    soirs: [] as Array<Record<string, unknown>>,
    effaces: [] as string[],
    livres: [] as string[],
    reclamations: 0,
    reclamationsDuSoir: 0,
  }
  const admin = {
    rpc: async (nom: string) => {
      if (nom === 'rappels_du_soir_a_pousser') {
        journal.reclamationsDuSoir += 1
        const suivant = soirs.shift() ?? []
        return Array.isArray(suivant) ? { data: suivant, error: null } : { data: null, error: suivant }
      }
      journal.reclamations += 1
      return { data: lots.shift() ?? [], error: null }
    },
    from: (table: string) => ({
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
            if (table === 'preferences_rappels' && 'patient_id' in filtres) {
              journal.soirs.push({ ...filtres, ...valeurs })
              return Promise.resolve({ error: null })
            }
            if ('push_id' in filtres && 'patient_id' in filtres) {
              journal.statuts.push({ ...filtres, ...valeurs })
              return Promise.resolve({ error: statutEnPanne ? { message: 'panne de la base' } : null })
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

/** Un envoyeur qui garde ce qu'il aurait posé sur chaque téléphone. */
function envoyeurQuiNote(code = 201) {
  const poses: Array<{ appareil: string; titre: string; corps: string; etiquette: string }> = []
  const envoyer: Envoyeur = async (a, contenu) => {
    const lu = JSON.parse(contenu) as { titre: string; corps: string; etiquette: string }
    poses.push({ appareil: a.id, titre: lu.titre, corps: lu.corps, etiquette: lu.etiquette })
    return code
  }
  return { poses, envoyer }
}

const BILAN_VIDE = { reclames: 0, envoyes: 0, sansAppareil: 0, echecs: 0, appareilsRetires: 0, soirs: 0, soirsArrives: 0 }

describe('un passage', () => {
  it('pousse, retire les téléphones périmés et dit ce qui est arrivé à chacune', async () => {
    const { admin, journal } = fausseBase(
      [[
        { push_id: 'n1', patient_id: 'anna', titre: 'Ce soir', corps: 'Respirez.', masque: false },
        { push_id: 'n1', patient_id: 'bea', titre: 'Ce soir', corps: 'Respirez.', masque: false },
      ]],
      [appareil('tel-anna', 'anna'), appareil('vieux-anna', 'anna')],
    )
    const envois: string[] = []
    const envoyer: Envoyeur = async (a) => {
      envois.push(a.id)
      return a.id === 'vieux-anna' ? 410 : 201
    }

    const bilan = await pousserLesRappels(admin, CLES, envoyer, figee)

    expect(bilan).toEqual({ ...BILAN_VIDE, reclames: 2, envoyes: 1, sansAppareil: 1, appareilsRetires: 1 })
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
    expect(journal.reclamationsDuSoir).toBe(1)
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

/* LA DISCRÉTION SUR L'ÉCRAN VERROUILLÉ (0055). La base rend déjà le texte
   neutre ; le serveur le reprend quand même, et c'est ce qui part. */
describe('le contenu masqué', () => {
  it('part neutre quand la personne n’a pas choisi de le lire', async () => {
    const { admin } = fausseBase(
      [[{ push_id: 'n1', patient_id: 'anna', titre: MOT_MASQUE.titre, corps: MOT_MASQUE.corps, masque: true }]],
      [appareil('tel', 'anna')],
    )
    const { poses, envoyer } = envoyeurQuiNote()
    await pousserLesRappels(admin, CLES, envoyer, figee)
    expect(poses).toEqual([{ appareil: 'tel', titre: MOT_MASQUE.titre, corps: MOT_MASQUE.corps, etiquette: 'n1' }])
  })

  /* Une base qui dirait « masqué » en laissant passer le contenu : le
     serveur ne l'écrit pas pour autant. */
  it('ne pose jamais le contenu d’un mot marqué masqué', async () => {
    const { admin } = fausseBase(
      [[{ push_id: 'n1', patient_id: 'anna', titre: 'Crises du soir', corps: 'Votre exercice anti-panique.', masque: true }]],
      [appareil('tel', 'anna')],
    )
    const { poses, envoyer } = envoyeurQuiNote()
    await pousserLesRappels(admin, CLES, envoyer, figee)
    expect(JSON.stringify(poses)).not.toMatch(/Crises|panique/)
    expect(poses[0]).toMatchObject({ titre: MOT_MASQUE.titre, corps: MOT_MASQUE.corps })
  })

  /* Serveur mis en ligne avant 0055 : la base ne dit rien de la discrétion.
     Le défaut vaut aussi là — masqué. */
  it('masque quand la base ne dit rien', async () => {
    const { admin } = fausseBase(
      [[{ push_id: 'n1', patient_id: 'anna', titre: 'Crises du soir', corps: 'Votre exercice.' }]],
      [appareil('tel', 'anna')],
      [{ code: 'PGRST202', message: 'Could not find the function public.rappels_du_soir_a_pousser' }],
    )
    const { poses, envoyer } = envoyeurQuiNote()
    await pousserLesRappels(admin, CLES, envoyer, figee)
    expect(poses[0]).toMatchObject({ titre: MOT_MASQUE.titre, corps: MOT_MASQUE.corps })
  })

  it('montre le mot à qui a choisi de le lire', async () => {
    const { admin } = fausseBase(
      [[{ push_id: 'n1', patient_id: 'anna', titre: 'Ce soir', corps: 'Respirez.', masque: false }]],
      [appareil('tel', 'anna')],
    )
    const { poses, envoyer } = envoyeurQuiNote()
    await pousserLesRappels(admin, CLES, envoyer, figee)
    expect(poses[0]).toMatchObject({ titre: 'Ce soir', corps: 'Respirez.' })
  })
})

describe('le rappel du soir', () => {
  const JOUR = '2026-09-29'

  it('pousse le rappel du soir, et note le jour traité pour chacune', async () => {
    const { admin, journal } = fausseBase(
      [[]],
      [appareil('tel-anna', 'anna')],
      [[
        { patient_id: 'anna', jour: JOUR, titre: 'Votre note du soir', corps: 'Votre sommeil, de 0 à 10 ?', masque: false },
        { patient_id: 'bea', jour: JOUR, titre: SOIR_MASQUE.titre, corps: SOIR_MASQUE.corps, masque: true },
      ]],
    )
    const { poses, envoyer } = envoyeurQuiNote()
    const bilan = await pousserLesRappels(admin, CLES, envoyer, figee)

    expect(bilan).toMatchObject({ reclames: 0, soirs: 2, soirsArrives: 1 })
    // Une étiquette par soir : le même rappel reçu deux fois ne s'empile pas.
    expect(poses).toEqual([
      { appareil: 'tel-anna', titre: 'Votre note du soir', corps: 'Votre sommeil, de 0 à 10 ?', etiquette: `soir-${JOUR}` },
    ])
    // Un seul par soir : le jour est noté, que le téléphone ait reçu ou non.
    expect(journal.soirs).toEqual(
      expect.arrayContaining([
        { patient_id: 'anna', soir_envoye_le: JOUR, soir_statut: 'envoyee', soir_reclame_le: null },
        { patient_id: 'bea', soir_envoye_le: JOUR, soir_statut: 'sans_appareil', soir_reclame_le: null },
      ]),
    )
    expect(journal.livres).toEqual(['tel-anna'])
  })

  it('arrive masqué quand la personne n’a rien choisi', async () => {
    const { admin } = fausseBase(
      [[]],
      [appareil('tel-bea', 'bea')],
      [[{ patient_id: 'bea', jour: JOUR, titre: 'Votre note du soir', corps: 'Vos crises de panique ?' }]],
    )
    const { poses, envoyer } = envoyeurQuiNote()
    await pousserLesRappels(admin, CLES, envoyer, figee)
    expect(poses[0]).toMatchObject({ titre: SOIR_MASQUE.titre, corps: SOIR_MASQUE.corps })
    expect(JSON.stringify(poses)).not.toMatch(/panique/)
  })

  /* Le serveur peut précéder 0055 : les mots partent, le soir se tait, et
     le journal n'en est pas encombré chaque minute. */
  it('laisse partir les mots quand la base ne connaît pas encore le rappel du soir', async () => {
    const erreurs: unknown[] = []
    const avant = console.error
    console.error = (...args: unknown[]) => void erreurs.push(args)
    try {
      const { admin, journal } = fausseBase(
        [[{ push_id: 'n1', patient_id: 'anna', titre: 't', corps: 'c', masque: false }]],
        [appareil('tel', 'anna')],
        [{ code: 'PGRST202', message: 'Could not find the function public.rappels_du_soir_a_pousser' }],
      )
      const bilan = await pousserLesRappels(admin, CLES, async () => 201, figee)
      expect(bilan).toMatchObject({ reclames: 1, envoyes: 1, soirs: 0 })
      expect(journal.statuts).toHaveLength(1)
      expect(erreurs).toEqual([])
    } finally {
      console.error = avant
    }
    expect(fonctionAbsente({ code: '42883', message: 'function does not exist' })).toBe(true)
    expect(fonctionAbsente({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false)
  })
})

/* DONNÉES DE SANTÉ : RIEN AU JOURNAL DU SERVEUR. Une base en panne au moment
   d'écrire le statut fait parler le serveur ; il ne doit dire que la panne. */
describe('le journal du serveur', () => {
  it('ne contient ni titre ni texte, même quand quelque chose échoue', async () => {
    const lignes: string[] = []
    const avant = { error: console.error, log: console.log, warn: console.warn }
    const noter = (...args: unknown[]) => void lignes.push(args.map(String).join(' '))
    console.error = noter
    console.log = noter
    console.warn = noter
    try {
      const { admin } = fausseBase(
        [[{ push_id: 'n1', patient_id: 'anna', titre: 'Crises du soir', corps: 'Votre exercice anti-panique.', masque: false }]],
        [appareil('tel', 'anna')],
        [[{ patient_id: 'anna', jour: '2026-09-29', titre: 'Votre note du soir', corps: 'Vos crises de panique ?', masque: false }]],
        { statutEnPanne: true },
      )
      await pousserLesRappels(admin, CLES, async () => 201, figee)
    } finally {
      Object.assign(console, avant)
    }
    expect(lignes.length).toBeGreaterThan(0)
    expect(lignes.join('\n')).not.toMatch(/Crises|panique|exercice|sommeil/i)
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
