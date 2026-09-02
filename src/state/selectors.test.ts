import { describe, expect, it } from 'vitest'
import { initialState } from './state'
import {
  axisBand,
  moduleProgress,
  nouvelleSeance,
  profilePrecision,
  riskColor,
  sidebarPatients,
  slippingPatients,
} from './selectors'

describe('nouvelleSeance', () => {
  it('remet toute la captation à zéro et fixe la fiche', () => {
    const patch = nouvelleSeance('nadia')
    expect(patch.sessionPatient).toBe('nadia')
    expect(patch.consent).toBe(false)
    expect(patch.transcript).toBe('')
    expect(patch.draft).toBeNull()
    expect(patch.draftMaquette).toBe(false)
    expect(patch.sent).toBe(false)
  })
  it('sans argument, aucune fiche', () => {
    expect(nouvelleSeance().sessionPatient).toBe('')
  })
})

describe('profilePrecision — la règle du prototype', () => {
  it('marge = max(3, round(26 − séances × 3))', () => {
    const p = profilePrecision(initialState, 'camille')
    const sessions = initialState.patients['camille']!.sessions
    expect(p.margin).toBe(Math.max(3, Math.round(26 - sessions * 3)))
  })
  it('une actualisation compte une séance de plus', () => {
    const avant = profilePrecision(initialState, 'camille')
    const apres = profilePrecision(
      { ...initialState, profNew: { camille: initialState.patients['camille']!.profile } },
      'camille',
    )
    expect(apres.sessions).toBe(avant.sessions + 1)
    expect(apres.fresh).toBe(true)
  })
  it('tient sur une fiche absente', () => {
    expect(profilePrecision(initialState, 'personne').maturity).toBe('Ébauche')
  })
})

describe('axisBand borne 0–100', () => {
  it('ne déborde ni en bas ni en haut', () => {
    expect(axisBand(2, 10)).toEqual({ lo: 0, hi: 12 })
    expect(axisBand(97, 10)).toEqual({ lo: 87, hi: 100 })
  })
})

describe('riskColor', () => {
  it('trois paliers', () => {
    expect(riskColor(20)).toContain('high')
    expect(riskColor(60)).toContain('mid')
    expect(riskColor(90)).toContain('low')
  })
})

describe('barre latérale', () => {
  it('sans recherche, toutes les fiches, dans l’ordre', () => {
    expect(sidebarPatients(initialState).map((r) => r.id)).toEqual(initialState.patientOrder)
  })
  it('la recherche porte aussi sur le sous-titre', () => {
    const sub = initialState.patients[initialState.patientOrder[0]!]!.subtitle.split(' ')[0]!
    const rows = sidebarPatients({ ...initialState, q: sub.toLowerCase() })
    expect(rows.length).toBeGreaterThan(0)
  })
  it('une fiche décroche sous 50 % de modules faits', () => {
    for (const id of slippingPatients(initialState)) {
      const { done, total } = moduleProgress(initialState, id)
      expect(done / total).toBeLessThan(0.5)
    }
  })
})

describe('profilePrecision — le compteur de séances', () => {
  const fiche = (sessions: number, totalSessions: number) => ({
    ...initialState,
    patients: {
      ...initialState.patients,
      camille: { ...initialState.patients['camille']!, sessions, totalSessions },
    },
  })

  it('sans actualisation, compte les séances de la fiche et rien de plus', () => {
    expect(profilePrecision(fiche(1, 6), 'camille').sessions).toBe(1)
    expect(profilePrecision(fiche(1, 6), 'camille').label).toBe('Ébauche · 1 séance')
  })

  it('une actualisation compte la séance en cours, que la fiche ignore encore', () => {
    const etat = { ...fiche(1, 6), profNew: { camille: initialState.patients['camille']!.profile } }
    expect(profilePrecision(etat, 'camille').sessions).toBe(2)
  })

  it('ne dit jamais « stabilisé » sans nombre de séances prévu', () => {
    // C'était le cas d'une fiche neuve : 1 / 0 à l'écran, et un profil déclaré
    // stabilisé dès la quatrième séance parce que 4 dépasse 0.
    expect(profilePrecision(fiche(8, 0), 'camille').maturity).toBe('Consolidé')
    expect(profilePrecision(fiche(8, 8), 'camille').maturity).toBe('Stabilisé')
    expect(profilePrecision(fiche(5, 8), 'camille').maturity).toBe('Consolidé')
  })
})
