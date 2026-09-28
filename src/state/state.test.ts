import { describe, expect, it } from 'vitest'
import { PATIENTS } from '@/data/patients'
import { DOSSIER_AVANT_LECTURE, initialState } from './state'

describe('le dossier d’un cabinet réel avant sa première lecture', () => {
  const reel = { ...initialState, space: 'cabinet' as const, ...DOSSIER_AVANT_LECTURE }

  /* Le défaut d'origine : Camille s'affichait le temps du chargement, et
     restait si ce chargement échouait — une séance réelle, facturée, pouvait
     alors se lancer sur un dossier fictif. */
  it('ne contient aucune fiche de démonstration', () => {
    expect(reel.patients).toEqual({})
    expect(reel.patientOrder).toEqual([])
    expect(reel.sel).toBe('')
    for (const id of Object.keys(PATIENTS)) {
      expect(reel.affs[id]).toBeUndefined()
      expect(reel.pages[id]).toBeUndefined()
      expect(reel.affAuto[id]).toBeUndefined()
    }
  })

  it('ne prête au cabinet ni la bibliothèque ni les programmes de démonstration', () => {
    expect(reel.lib).toEqual([])
    expect(reel.libSel).toBeNull()
    expect(reel.cats).toEqual([])
    expect(reel.programmes).toEqual([])
  })

  it('ne se dit pas réel avant d’avoir été lu', () => {
    expect(reel.patientsReels).toBe(false)
  })

  /* La démonstration publique et le banc de rendu partent de l'état initial,
     sans session : eux doivent continuer de montrer les fiches fictives. */
  it('laisse les fiches de démonstration à la démonstration', () => {
    expect(initialState.patientOrder.length).toBeGreaterThan(0)
    expect(initialState.patients[initialState.sel]).toBeDefined()
  })
})
