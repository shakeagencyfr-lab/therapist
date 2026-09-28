import { describe, expect, it } from 'vitest'
import { adresseDeRetour, etatDeSession, hoteDeLaRequete } from './shop.js'

/**
 * Où revient le patient après avoir payé.
 *
 * Le retour visait `/mon` sur notre domaine : un patient parti de l'adresse
 * de son cabinet revenait sous notre marque, juste après avoir donné sa
 * carte. Et un patient parti de chez nous, renvoyé sur le domaine du
 * cabinet, revenait déconnecté — la session vit domaine par domaine.
 */
describe('adresseDeRetour', () => {
  const site = 'https://klaroweb.site'

  it("ramène sur l'adresse du cabinet chez nous, jamais sur /mon tout court", () => {
    expect(adresseDeRetour({ site, slug: 'cabinet-fontaine', domaine: null, hote: 'klaroweb.site' })).toBe(
      'https://klaroweb.site/cabinet-fontaine/mon',
    )
  })

  it('ramène sur le domaine du cabinet quand le paiement est parti de là', () => {
    expect(
      adresseDeRetour({ site, slug: 'cabinet-fontaine', domaine: 'espace.fontaine.fr', hote: 'Espace.Fontaine.fr:443' }),
    ).toBe('https://espace.fontaine.fr/mon')
  })

  it('reste chez nous quand le patient est parti de chez nous, domaine vérifié ou pas', () => {
    expect(
      adresseDeRetour({ site, slug: 'cabinet-fontaine', domaine: 'espace.fontaine.fr', hote: 'klaroweb.site' }),
    ).toBe('https://klaroweb.site/cabinet-fontaine/mon')
  })

  it("ne fabrique jamais d'adresse à partir de l'hôte reçu", () => {
    // Un hôte inconnu ne choisit rien : on retombe sur l'adresse du serveur.
    expect(adresseDeRetour({ site, slug: 'cabinet-fontaine', domaine: null, hote: 'pirate.example' })).toBe(
      'https://klaroweb.site/cabinet-fontaine/mon',
    )
  })

  it('retombe sur /mon quand le cabinet n’a pas encore d’identifiant', () => {
    expect(adresseDeRetour({ site, slug: null, domaine: null, hote: null })).toBe('https://klaroweb.site/mon')
  })
})

describe('hoteDeLaRequete', () => {
  it("lit l'hôte d'origine posé par la plateforme, puis Host", () => {
    expect(hoteDeLaRequete({ 'x-forwarded-host': 'espace.fontaine.fr', host: 'interne' })).toBe('espace.fontaine.fr')
    expect(hoteDeLaRequete({ host: 'localhost:5173' })).toBe('localhost:5173')
    expect(hoteDeLaRequete({ 'x-forwarded-host': 'a.fr, b.fr' })).toBe('a.fr')
    expect(hoteDeLaRequete({})).toBeNull()
  })
})

/**
 * Ce que Stripe dit d'une session, et ce que la boutique en fait.
 *
 * Seul « paid » livre. Un prélèvement validé mais pas encore réglé attend ;
 * un prélèvement rejeté ou une page expirée annule — sans quoi la commande
 * restait « en attente » à jamais.
 */
describe('etatDeSession', () => {
  it('ne livre que sur un paiement confirmé', () => {
    expect(etatDeSession({ status: 'complete', payment_status: 'paid' })).toBe('payee')
    expect(etatDeSession({ status: 'complete', payment_status: 'unpaid', paiement: 'processing' })).toBe('reglement')
    expect(etatDeSession({ status: 'open', payment_status: 'unpaid' })).toBe('ouverte')
  })

  it('reconnaît le prélèvement rejeté par la banque', () => {
    expect(
      etatDeSession({ status: 'complete', payment_status: 'unpaid', paiement: 'requires_payment_method' }),
    ).toBe('echouee')
    expect(etatDeSession({ status: 'complete', payment_status: 'unpaid', paiement: 'canceled' })).toBe('echouee')
  })

  it('reconnaît la page de paiement abandonnée puis expirée', () => {
    expect(etatDeSession({ status: 'expired', payment_status: 'unpaid' })).toBe('expiree')
  })

  it('ne prend pas « rien à payer » pour un paiement', () => {
    // La boutique ne propose ni code promo ni gratuité : un « no_payment_required »
    // serait une anomalie, pas une vente à livrer.
    expect(etatDeSession({ status: 'complete', payment_status: 'no_payment_required' })).not.toBe('payee')
  })
})
