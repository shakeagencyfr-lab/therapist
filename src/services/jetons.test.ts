import { describe, expect, it } from 'vitest'
import { lireRetourDePaiement } from './jetons'

describe('le retour de la page de paiement', () => {
  it('lit la session à vérifier', () => {
    expect(lireRetourDePaiement('?jetons=cs_test_a1B2c3')).toEqual({ session: 'cs_test_a1B2c3' })
  })

  it('dit quand la praticienne a renoncé', () => {
    expect(lireRetourDePaiement('?jetons=annule')).toEqual({ annule: true })
  })

  it('ignore une adresse qui n’est pas un retour, ou une session mal formée', () => {
    expect(lireRetourDePaiement('')).toBeNull()
    expect(lireRetourDePaiement('?commande=cs_test_1')).toBeNull()
    expect(lireRetourDePaiement('?jetons=<script>')).toBeNull()
  })
})
