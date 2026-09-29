import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  adresseDeRetour,
  etatDeSession,
  hoteDeLaRequete,
  idDuPaiement,
  issueDeLErreurStripe,
  issueDuRemboursement,
} from './shop.js'

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

/**
 * Le remboursement (0058) : ce que Stripe répond, et ce que la boutique en
 * fait. Rien n'est noté remboursé sans que Stripe l'ait accepté — ou l'ait
 * déjà fait depuis son tableau de bord.
 */
describe('issueDeLErreurStripe', () => {
  it('reconnaît un paiement déjà remboursé : il n’y a plus qu’à le noter', () => {
    expect(issueDeLErreurStripe({ type: 'StripeInvalidRequestError', code: 'charge_already_refunded' })).toBe('deja')
  })

  it('distingue la clé qui n’a pas le droit de la clé qui ne vaut plus rien', () => {
    expect(issueDeLErreurStripe({ type: 'StripePermissionError', statusCode: 403 })).toBe('droits')
    expect(issueDeLErreurStripe({ type: 'StripeAuthenticationError', statusCode: 401 })).toBe('cle')
  })

  it('prend un refus de Stripe pour un refus, et le silence pour une panne', () => {
    expect(issueDeLErreurStripe({ type: 'StripeInvalidRequestError', code: 'charge_disputed' })).toBe('refus')
    expect(issueDeLErreurStripe({ type: 'StripeConnectionError' })).toBe('panne')
    expect(issueDeLErreurStripe(null)).toBe('panne')
  })
})

describe('issueDuRemboursement', () => {
  it('tient pour remboursée une vente que Stripe a acceptée, même avant le crédit de la banque', () => {
    expect(issueDuRemboursement('succeeded')).toBe('fait')
    expect(issueDuRemboursement('pending')).toBe('en_cours')
    expect(issueDuRemboursement(null)).toBe('en_cours')
  })

  it('ne note rien de ce que Stripe n’a pas rendu', () => {
    expect(issueDuRemboursement('requires_action')).toBe('action')
    expect(issueDuRemboursement('failed')).toBe('echec')
    expect(issueDuRemboursement('canceled')).toBe('echec')
  })
})

describe('idDuPaiement', () => {
  it('lit le paiement d’une session, déplié ou non', () => {
    expect(idDuPaiement('pi_3Nabc')).toBe('pi_3Nabc')
    expect(idDuPaiement({ id: 'pi_3Nabc' })).toBe('pi_3Nabc')
    expect(idDuPaiement(null)).toBeNull()
  })
  it('refuse ce qui n’a pas la forme d’un paiement (la base le refuserait aussi)', () => {
    expect(idDuPaiement('pi_x/../y')).toBeNull()
    expect(idDuPaiement('ch_3Nabc')).toBeNull()
  })
})

/* Des gardes sur le texte du geste : ce qu'il exige, et ce qu'il ne fait pas. */
describe('rembourserCommande — le geste', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'shop.ts'), 'utf8')
  const debut = source.indexOf('export async function rembourserCommande')
  const geste = source.slice(debut, source.indexOf('\n/* ----', debut))
  const noter = source.slice(source.indexOf('async function noterRemboursee'), source.indexOf('/* ----', source.indexOf('async function noterRemboursee')))

  it('exige le second facteur et la personne titulaire', () => {
    expect(geste).toContain('identifierPourGesteSensible(token)')
    expect(geste).toContain("rpc('est_titulaire_du_cabinet'")
  })

  it('rembourse le montant de la commande, une seule fois', () => {
    expect(geste).toContain('amount: commande.amount_cents')
    expect(geste).toContain('idempotencyKey: `remboursement-${commande.id}`')
  })

  it('ne retire rien au patient : ni audio, ni accès', () => {
    expect(geste).not.toContain('patient_audios')
    expect(noter).not.toContain('patient_audios')
  })

  it('note la vente conditionnellement, et ne met au journal ni montant, ni produit, ni patient', () => {
    expect(noter).toContain(".eq('status', 'payee')")
    const journal = noter.slice(noter.indexOf(".from('audit_log')"), noter.indexOf('})', noter.indexOf(".from('audit_log')")))
    expect(journal).not.toMatch(/meta|title|amount|patient|montant/)
  })
})
