import { describe, expect, it } from 'vitest'
import {
  ANCIEN_REQUIS,
  appliquerChangementDeMotDePasse,
  appliquerSuppression,
  gesteDuCompte,
  lireDemandeMotDePasse,
  type PorteMotDePasse,
  type PorteSuppression,
} from './compte'
import { HttpError } from './errors'

const MAINTENANT = Date.UTC(2026, 8, 28, 12, 0, 0)

function jeton(amr: Array<{ method: string; timestamp: number }>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', amr })}.sig`
}
const PAR_LIEN_A_L_INSTANT = jeton([{ method: 'otp', timestamp: MAINTENANT / 1000 - 60 }])
const PAR_LIEN_IL_Y_A_3_JOURS = jeton([{ method: 'magiclink', timestamp: MAINTENANT / 1000 - 3 * 86400 }])
const PAR_MOT_DE_PASSE = jeton([{ method: 'password', timestamp: MAINTENANT / 1000 - 60 }])

/** Une porte qui note ce qu'on lui demande. */
function porte(verdict: 'ok' | 'faux' | 'trop' | 'inconnu' = 'ok', refus: string | null = null, fermes = true) {
  const appels: string[] = []
  const p: PorteMotDePasse = {
    async verifier(userId, mdp) {
      appels.push(`verifier:${userId}:${mdp}`)
      return verdict
    },
    async remplacer(userId, mdp) {
      appels.push(`remplacer:${userId}:${mdp}`)
      return refus
    },
    async fermerLesAutres(j) {
      appels.push(`fermer:${j === '' ? 'vide' : 'jeton'}`)
      return fermes
    },
  }
  return { p, appels }
}

async function refus(promesse: Promise<unknown>): Promise<HttpError> {
  try {
    await promesse
  } catch (err) {
    if (err instanceof HttpError) return err
    throw err
  }
  throw new Error('le changement est passé')
}

const QUI = (j: string) => ({ userId: 'u1', email: 'lea@exemple.fr', jeton: j })
const NOUVEAU = 'cheval agrafe batterie'

describe('changer son mot de passe', () => {
  it("change avec l'ancien, puis ferme les autres appareils", async () => {
    const { p, appels } = porte('ok')
    const r = await appliquerChangementDeMotDePasse(QUI(PAR_MOT_DE_PASSE), { ancien: 'ancien mot de passe', nouveau: NOUVEAU }, p, MAINTENANT)
    expect(r.ok).toBe(true)
    expect(r.message).toMatch(/autres appareils ont été déconnectés/)
    expect(appels).toEqual(['verifier:u1:ancien mot de passe', `remplacer:u1:${NOUVEAU}`, 'fermer:jeton'])
  })

  it('refuse un ancien mot de passe faux, sans rien remplacer', async () => {
    const { p, appels } = porte('faux')
    const e = await refus(appliquerChangementDeMotDePasse(QUI(PAR_LIEN_A_L_INSTANT), { ancien: 'faux', nouveau: NOUVEAU }, p, MAINTENANT))
    expect(e.status).toBe(403)
    // Même entré par un lien à l'instant : un ancien SAISI et faux ne passe pas.
    expect(appels).toEqual(['verifier:u1:faux'])
  })

  it('arrête après trop d’essais, et le dit', async () => {
    const { p, appels } = porte('trop')
    const e = await refus(appliquerChangementDeMotDePasse(QUI(PAR_MOT_DE_PASSE), { ancien: 'x', nouveau: NOUVEAU }, p, MAINTENANT))
    expect(e.status).toBe(429)
    expect(appels.some((a) => a.startsWith('remplacer'))).toBe(false)
  })

  it('renvoie vers le lien quand l’empreinte ne se lit pas', async () => {
    const { p } = porte('inconnu')
    const e = await refus(appliquerChangementDeMotDePasse(QUI(PAR_MOT_DE_PASSE), { ancien: 'x', nouveau: NOUVEAU }, p, MAINTENANT))
    expect(e.status).toBe(409)
  })

  it("dispense de l'ancien qui vient d'entrer par un lien", async () => {
    const { p, appels } = porte()
    const r = await appliquerChangementDeMotDePasse(QUI(PAR_LIEN_A_L_INSTANT), { ancien: '', nouveau: NOUVEAU }, p, MAINTENANT)
    expect(r.ok).toBe(true)
    expect(appels).toEqual([`remplacer:u1:${NOUVEAU}`, 'fermer:jeton'])
  })

  /* Le cœur de la règle : un navigateur resté ouvert ne suffit pas. */
  it("exige l'ancien d'une session ouverte par mot de passe, ou par un lien trop vieux", async () => {
    for (const j of [PAR_MOT_DE_PASSE, PAR_LIEN_IL_Y_A_3_JOURS, 'jeton.illisible.x']) {
      const { p, appels } = porte()
      const e = await refus(appliquerChangementDeMotDePasse(QUI(j), { ancien: '', nouveau: NOUVEAU }, p, MAINTENANT))
      expect(e.status).toBe(403)
      expect(e.message).toBe(ANCIEN_REQUIS)
      expect(appels).toEqual([])
    }
  })

  it('refuse un nouveau mot de passe trop court, identique ou égal à l’adresse, avant toute vérification', async () => {
    for (const demande of [
      { ancien: 'ancien mot de passe', nouveau: 'court' },
      { ancien: NOUVEAU, nouveau: NOUVEAU },
      { ancien: '', nouveau: 'lea@exemple.fr' },
    ]) {
      const { p, appels } = porte()
      const e = await refus(appliquerChangementDeMotDePasse(QUI(PAR_LIEN_A_L_INSTANT), demande, p, MAINTENANT))
      expect(e.status).toBe(400)
      expect(appels).toEqual([])
    }
  })

  it('rend lisible le refus du service (mot de passe faible ou déjà fuité)', async () => {
    const { p, appels } = porte('ok', 'Ce mot de passe est trop faible.')
    const e = await refus(appliquerChangementDeMotDePasse(QUI(PAR_MOT_DE_PASSE), { ancien: 'ancien', nouveau: NOUVEAU }, p, MAINTENANT))
    expect(e.status).toBe(422)
    expect(appels).not.toContain('fermer:jeton')
  })

  it('dit la vérité quand les autres appareils restent ouverts', async () => {
    const { p } = porte('ok', null, false)
    const r = await appliquerChangementDeMotDePasse(QUI(PAR_MOT_DE_PASSE), { ancien: 'ancien', nouveau: NOUVEAU }, p, MAINTENANT)
    expect(r.message).toMatch(/n'ont pas pu être déconnectés/)
  })

  it('lit le corps sans lui faire confiance', () => {
    expect(lireDemandeMotDePasse({ ancien: 3, nouveau: ['x'] })).toEqual({ ancien: '', nouveau: '' })
    expect(lireDemandeMotDePasse(null)).toEqual({ ancien: '', nouveau: '' })
  })

  it('refuse un geste inconnu', async () => {
    const e = await refus(gesteDuCompte('jeton', { geste: 'effacer-tout' }))
    expect(e.status).toBe(400)
  })
})

/** Une base qui note ce qu'on lui demande, et échoue là où on le lui dit. */
function base(fiche: string | null, echecs: Partial<Record<'journal' | 'fiche' | 'compte' | 'recherche', string>> = {}) {
  const appels: string[] = []
  const p: PorteSuppression = {
    async ficheRattachee(userId) {
      appels.push(`chercher:${userId}`)
      if (echecs.recherche) throw new HttpError(502, echecs.recherche)
      return fiche
    },
    async effacerJournal(patientId) {
      appels.push(`journal:${patientId}`)
      return echecs.journal ?? null
    },
    async detacher(patientId) {
      appels.push(`detacher:${patientId}`)
      return echecs.fiche ?? null
    },
    async supprimerCompte(userId) {
      appels.push(`supprimer:${userId}`)
      return echecs.compte ?? null
    },
  }
  return { p, appels }
}

describe('supprimer son compte', () => {
  it('efface le journal, détache la fiche, puis supprime le compte — dans cet ordre', async () => {
    const { p, appels } = base(null)
    const r = await appliquerSuppression({ userId: 'u1', patientId: 'p1', autreRole: false }, p)
    expect(r.message).toMatch(/supprimé/)
    // La fiche active est connue : inutile de la chercher.
    expect(appels).toEqual(['journal:p1', 'detacher:p1', 'supprimer:u1'])
  })

  /* Le défaut d'origine : `my_context` ignore les fiches closes, le geste
     répondait 403, et le journal restait en base sans que personne puisse
     l'effacer. */
  it('retrouve la fiche d’un suivi clos, et l’efface comme une fiche active', async () => {
    const { p, appels } = base('p-close')
    const r = await appliquerSuppression({ userId: 'u1', patientId: null, autreRole: false }, p)
    expect(r.ok).toBe(true)
    expect(appels).toEqual(['chercher:u1', 'journal:p-close', 'detacher:p-close', 'supprimer:u1'])
  })

  it('ferme un compte resté sans fiche ni autre rôle', async () => {
    const { p, appels } = base(null)
    const r = await appliquerSuppression({ userId: 'u1', patientId: null, autreRole: false }, p)
    expect(r.message).toBe('Votre compte est supprimé.')
    expect(appels).toEqual(['chercher:u1', 'supprimer:u1'])
  })

  it('refuse un compte professionnel sans fiche, sans rien toucher', async () => {
    const { p, appels } = base(null)
    const e = await refus(appliquerSuppression({ userId: 'u1', patientId: null, autreRole: true }, p))
    expect(e.status).toBe(403)
    expect(appels).toEqual(['chercher:u1'])
  })

  it('garde le compte qui porte aussi un espace professionnel', async () => {
    const { p, appels } = base('p-close')
    const r = await appliquerSuppression({ userId: 'u1', patientId: null, autreRole: true }, p)
    expect(r.message).toMatch(/reste ouvert/)
    expect(appels).toEqual(['chercher:u1', 'journal:p-close', 'detacher:p-close'])
  })

  it('ne détache ni ne supprime rien quand le journal résiste', async () => {
    const { p, appels } = base(null, { journal: 'boom' })
    const e = await refus(appliquerSuppression({ userId: 'u1', patientId: 'p1', autreRole: false }, p))
    expect(e.status).toBe(502)
    expect(e.message).toMatch(/Rien n'a été supprimé/)
    expect(appels).toEqual(['journal:p1'])
  })

  it('ne supprime rien quand la fiche n’a pas pu être cherchée', async () => {
    const { p, appels } = base(null, { recherche: 'Votre fiche n’a pas pu être retrouvée.' })
    const e = await refus(appliquerSuppression({ userId: 'u1', patientId: null, autreRole: false }, p))
    expect(e.status).toBe(502)
    expect(appels).toEqual(['chercher:u1'])
  })

  it('dit la vérité quand seul le compte résiste', async () => {
    const { p } = base('p1', { compte: 'boom' })
    const e = await refus(appliquerSuppression({ userId: 'u1', patientId: null, autreRole: false }, p))
    expect(e.status).toBe(502)
    expect(e.message).toMatch(/journal effacé, mais votre compte n'a pas pu être supprimé/)
  })
})
