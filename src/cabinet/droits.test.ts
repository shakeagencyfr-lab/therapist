import { describe, expect, it } from 'vitest'
import { hypnoseOuverte, ouvert, type DroitsData } from './droits'
import type { Droits } from '@/services/cabinet'

const base: Droits = {
  maxPatients: 25,
  patientesActives: 3,
  shop: true,
  marqueBlanche: false,
  site: false,
  offre: 'Essentiel',
  offreCode: 'essentiel',
  enRegle: true,
  statut: 'actif',
  echeance: null,
}

const avec = (droits: Droits | null): DroitsData => ({ droits, chargement: false, recharger: async () => {} })

describe("l'hypnose, vue des droits (0065)", () => {
  it('se ferme quand la base la dit fermée', () => {
    expect(hypnoseOuverte(avec({ ...base, hypnose: false }))).toBe(false)
    expect(ouvert(avec({ ...base, hypnose: false }), 'hypnose')).toBe(false)
  })

  it("s'ouvre quand la base la dit ouverte", () => {
    expect(hypnoseOuverte(avec({ ...base, hypnose: true }))).toBe(true)
  })

  it('ne ferme rien sans droits lus, ni quand un serveur plus ancien ne la dit pas', () => {
    expect(hypnoseOuverte(null)).toBe(true)
    expect(hypnoseOuverte(avec(null))).toBe(true)
    expect(hypnoseOuverte(avec(base))).toBe(true)
  })
})
