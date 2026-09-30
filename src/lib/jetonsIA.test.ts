import { describe, expect, it } from 'vitest'
import {
  centimesCourts,
  coutsParAction,
  debitDit,
  devisJetons,
  entierSaisi,
  etatHypnoseDit,
  euroParJeton,
  jetonsDits,
  jourDit,
  libelleOptionHypnose,
  margeDe,
  phraseDuDevis,
  phraseDuForfait,
  prixDit,
  prixDuJetonCents,
  prixSaisi,
  resteDit,
  retourDit,
  BAREME_PAR_DEFAUT_ECRAN,
} from './jetonsIA'
import type { EtatJetons } from '../types/jetons'

const etat: Pick<EtatJetons, 'mode' | 'solde' | 'enRegle' | 'bareme'> = {
  mode: 'jetons',
  solde: 312,
  enRegle: true,
  bareme: BAREME_PAR_DEFAUT_ECRAN,
}

describe('les jetons, dits', () => {
  it('accorde le singulier et le pluriel comme on le dit', () => {
    expect(jetonsDits(0)).toBe('0 jeton')
    expect(jetonsDits(1)).toBe('1 jeton')
    expect(jetonsDits(12)).toBe('12 jetons')
    // L'espace des milliers est l'espace fine insécable du français.
    expect(jetonsDits(1000)).toBe(`${(1000).toLocaleString('fr-FR')} jetons`)
  })

  it('dit ce qui reste, et quand il ne reste rien', () => {
    expect(resteDit(312)).toBe('il vous en reste 312')
    expect(resteDit(0)).toBe('il ne vous en reste aucun')
  })
})

describe('le prix, avant le clic', () => {
  it('rien hors du mode jetons, ou tant que le mode est inconnu', () => {
    expect(devisJetons(null, 'seance')).toBeNull()
    expect(devisJetons({ ...etat, mode: 'cle_cabinet' }, 'seance')).toBeNull()
  })

  it('dit le prix et le solde', () => {
    const devis = devisJetons(etat, 'seance')
    expect(devis).toEqual({ cout: 12, solde: 312, manque: false, compris: false })
    expect(phraseDuDevis(devis!)).toBe('Cette analyse utilisera 12 jetons (il vous en reste 312).')
    expect(phraseDuDevis(devisJetons(etat, 'affirmations')!, 'Cette proposition')).toBe(
      'Cette proposition utilisera 1 jeton (il vous en reste 312).',
    )
  })

  it('constate le manque, sans reproche', () => {
    const devis = devisJetons({ ...etat, solde: 3 }, 'seance')!
    expect(devis.manque).toBe(true)
    expect(phraseDuDevis(devis)).toBe('Il vous reste 3 jetons, et cette analyse en demande 12.')
    expect(phraseDuDevis(devisJetons({ ...etat, solde: 0 }, 'hypnose')!, 'Cette hypnose')).toBe(
      'Il ne vous reste aucun jeton, et cette hypnose en demande 50.',
    )
  })

  it("ne parle pas de manque hors contrat : c'est le bandeau qui le dit", () => {
    expect(devisJetons({ ...etat, solde: 0, enRegle: false }, 'seance')!.manque).toBe(false)
  })

  it('une actualisation comprise dans la séance ne coûte rien, et le dit', () => {
    const devis = devisJetons({ ...etat, solde: 0 }, 'profil', true)!
    expect(devis).toMatchObject({ cout: 0, manque: false, compris: true })
    expect(phraseDuDevis(devis, 'Cette actualisation')).toBe(
      "Inclus dans la séance : cette actualisation n'utilise aucun jeton (une par séance).",
    )
  })
})

describe('le prix, vu par le revendeur', () => {
  const recharges = [
    { jetons: 100, prixCents: 1200 },
    { jetons: 300, prixCents: 3000 },
    { jetons: 1000, prixCents: 8500 },
  ]

  it('prend le jeton le moins cher des recharges en vente', () => {
    expect(prixDuJetonCents(recharges)).toBe(8.5)
    expect(prixDuJetonCents([...recharges, { jetons: 10_000, prixCents: 10_000, actif: false }])).toBe(8.5)
    expect(prixDuJetonCents([])).toBeNull()
  })

  it('dit un coût minuscule sans déborder de sa cellule', () => {
    expect(centimesCourts(0.12)).toBe('< 0,01 €')
    expect(centimesCourts(102)).toBe('1,02 €')
  })

  it('dit le prix au jeton avec ses millimes', () => {
    expect(euroParJeton(8500, 1000)).toBe('0,085 €')
    expect(euroParJeton(1200, 100)).toBe('0,12 €')
    expect(euroParJeton(1200, 0)).toBe('—')
  })

  it('calcule la marge sur le prix payé, en alerte sous 60 %', () => {
    // Séance : 12 jetons × 8,5 c = 102 c ; coût 20 c → 80 %.
    expect(margeDe(12, 8.5, 20)).toEqual({ prixCents: 102, margePct: 80, faible: false })
    // Hypnose vendue 5 jetons à 8,5 c = 42,5 c pour un coût de 38 c → 11 %.
    expect(margeDe(5, 8.5, 38)).toEqual({ prixCents: 42.5, margePct: 11, faible: true })
    // Juste au seuil : 60 % n'est pas en alerte.
    expect(margeDe(10, 10, 40).faible).toBe(false)
    expect(margeDe(10, 10, 41).faible).toBe(true)
  })

  it('ne calcule rien sans prix ni mesure, et signale une action offerte qui coûte', () => {
    expect(margeDe(12, null, 20)).toEqual({ prixCents: null, margePct: null, faible: false })
    expect(margeDe(12, 8.5, undefined)).toEqual({ prixCents: 102, margePct: null, faible: false })
    expect(margeDe(0, 8.5, 5)).toEqual({ prixCents: 0, margePct: null, faible: true })
  })

  it('compte la séance avec son forfait : note, consignes et profil', () => {
    const couts = coutsParAction([
      { action: 'seance', appels: 10, parAppelCentimesUsd: 5.56, parActionCentimesEur: 5 },
      { action: 'module', appels: 10, parAppelCentimesUsd: 5.83, parActionCentimesEur: 5.5 },
      { action: 'profil', appels: 10, parAppelCentimesUsd: 8.53, parActionCentimesEur: 8 },
    ])
    expect(couts.seance).toBe(5 + 4 * 5.5 + 8)
    expect(couts.module).toBe(5.5)
    expect(couts.hypnose).toBeUndefined()
  })
})

describe('les saisies', () => {
  it('lit un prix en euros', () => {
    expect(prixSaisi('19')).toBe(1900)
    expect(prixSaisi('19,50')).toBe(1950)
    expect(prixSaisi('19.5')).toBe(1950)
    expect(prixSaisi('dix-neuf')).toBeNull()
    expect(prixDit(1900)).toBe('19 €')
    expect(prixDit(1950)).toBe('19,50 €')
  })

  it('lit un entier dans ses bornes', () => {
    expect(entierSaisi('300', 0, 1000)).toBe(300)
    expect(entierSaisi(' 1 000 ', 0, 10_000)).toBe(1000)
    expect(entierSaisi('12,5', 0, 100)).toBeNull()
    expect(entierSaisi('-1', 0, 100)).toBeNull()
    expect(entierSaisi('101', 0, 100)).toBeNull()
  })
})

describe('le forfait et l’option', () => {
  it('dit le premier du mois comme on le dit', () => {
    expect(jourDit('2026-11-01')).toBe('1er novembre')
    expect(jourDit('2026-10-12')).toBe('12 octobre')
  })

  it('dit que le forfait se renouvelle, et ne se reporte pas', () => {
    expect(phraseDuForfait({ total: 300, renouvellement: '2026-11-01' })).toBe(
      'Vos 300 jetons du mois se renouvellent le 1er novembre ; ceux qui restent ne se reportent pas.',
    )
  })

  it("annonce l'option avec son prix, sa durée et ses jetons", () => {
    expect(libelleOptionHypnose({ prixCents: 1900, jours: 30, jetons: 200 })).toBe(
      "Activer l'option — 19 € pour 30 jours, 200 jetons offerts",
    )
    expect(libelleOptionHypnose({ prixCents: 1900, jours: 30, jetons: 0 }, "Prolonger l'option")).toBe(
      "Prolonger l'option — 19 € pour 30 jours",
    )
  })

  it("dit où en est l'hypnose", () => {
    expect(etatHypnoseDit({ droit: true, incluse: true, jusquAu: null })).toBe('Comprise dans votre offre.')
    expect(etatHypnoseDit({ droit: true, incluse: false, jusquAu: '2026-10-30T10:00:00Z' })).toMatch(/^Active jusqu'au 30 octobre 2026\.$/)
    expect(etatHypnoseDit({ droit: false, incluse: false, jusquAu: null })).toMatch(/option/)
  })
})

describe("l'historique et le retour de paiement", () => {
  it('dit ce qu’une ligne a coûté', () => {
    expect(debitDit({ le: '', action: 'seance', jetons: 12, statut: 'confirme' })).toBe('−12')
    expect(debitDit({ le: '', action: 'module', jetons: 0, statut: 'confirme' })).toBe('compris')
    expect(debitDit({ le: '', action: 'seance', jetons: 12, statut: 'rembourse' })).toBe('rendu')
  })

  it("dit le retour de Stripe, et quand un nouvel essai a un sens", () => {
    expect(retourDit({ ok: true, message: 'Crédité.', solde: 400, objet: 'recharge', jetons: 100 })).toEqual({
      ton: 'ok',
      texte: 'Crédité.',
      attente: false,
    })
    expect(
      retourDit({ ok: false, message: 'Pas encore.', solde: null, objet: 'recharge', jetons: 100, attente: true }),
    ).toEqual({ ton: 'warn', texte: 'Pas encore.', attente: true })
  })
})
