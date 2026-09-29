import { describe, expect, it } from 'vitest'
import { centimesDe } from '@/views/boutique/BoutiqueView'
import {
  annonceDeLaReprise,
  annonceDeLaRepriseAuCabinet,
  annonceDuRetour,
  fusionner,
  listeDeTitres,
  phraseDeLecture,
  saisieDuPrix,
  totalDesVentes,
} from './boutique'

describe('annonceDuRetour — ce que le patient lit en revenant de Stripe', () => {
  it('remercie quand tout est arrivé', () => {
    const a = annonceDuRetour({ payee: true, title: 'Ancrage', livre: true, attente: null })
    expect(a.tone).toBe('ok')
    expect(a.text).toBe('Paiement confirmé : « Ancrage ». Merci.')
  })

  it('ne promet plus que la page « repartira toute seule »', () => {
    const a = annonceDuRetour({ payee: true, title: 'Ancrage', livre: false, attente: null })
    expect(a.tone).toBe('hot')
    expect(a.text).toContain("la livraison n'a pas abouti")
    expect(a.text).toContain('prochain passage dans la boutique')
    expect(a.text).not.toContain('toute seule')
  })

  it('dit qu’un prélèvement prend des jours, pas « un instant »', () => {
    const a = annonceDuRetour({ payee: false, title: 'Ancrage', livre: false, attente: 'reglement' })
    expect(a.text).toContain('quelques jours')
    expect(a.text).not.toContain('dans un instant')
  })

  it('distingue la page abandonnée du refus de la banque', () => {
    expect(annonceDuRetour({ payee: false, title: null, livre: false, attente: 'abandon' }).text).toContain(
      "n'a pas été mené à son terme",
    )
    expect(annonceDuRetour({ payee: false, title: 'A', livre: false, attente: 'rembourse' }).text).toMatch(
      /remboursé/,
    )
    expect(annonceDuRetour({ payee: false, title: 'A', livre: false, attente: 'rembourse' }).text).not.toMatch(
      /confirmé/,
    )
    expect(annonceDuRetour({ payee: false, title: 'A', livre: false, attente: 'echec' }).text).toContain(
      'Votre banque a refusé',
    )
  })
})

describe('annonceDeLaReprise — côté patient', () => {
  const vide = { confirmees: [], echouees: [] }

  it('se tait quand rien n’a bougé', () => {
    expect(annonceDeLaReprise(vide)).toBeNull()
  })

  it('n’annonce pas deux fois l’achat dont le retour vient de parler', () => {
    const r = { confirmees: [{ id: 'c1', title: 'Ancrage', livre: true, nouvelle: true }], echouees: [] }
    expect(annonceDeLaReprise(r, 'c1')).toBeNull()
    expect(annonceDeLaReprise(r, null)?.text).toBe('Paiement confirmé : « Ancrage ». Merci.')
  })

  it('dit « arrivé » d’un achat déjà payé dont la livraison vient d’aboutir', () => {
    const r = { confirmees: [{ id: 'c1', title: 'Ancrage', livre: true, nouvelle: false }], echouees: [] }
    expect(annonceDeLaReprise(r)?.text).toBe('« Ancrage » est arrivé dans votre espace.')
  })

  it('prend le ton le plus grave quand une livraison échoue encore', () => {
    const r = {
      confirmees: [
        { id: 'c1', title: 'Ancrage', livre: true, nouvelle: true },
        { id: 'c2', title: 'Sommeil', livre: false, nouvelle: true },
      ],
      echouees: [],
    }
    const a = annonceDeLaReprise(r)
    expect(a?.tone).toBe('hot')
    expect(a?.text).toContain('« Sommeil », mais la livraison')
  })

  it('dit qu’un prélèvement rejeté n’a rien débité', () => {
    const a = annonceDeLaReprise({ confirmees: [], echouees: [{ id: 'e1', title: 'Séance' }] })
    expect(a?.tone).toBe('hot')
    expect(a?.text).toContain("rien n'a été débité")
  })
})

describe('annonceDeLaRepriseAuCabinet — côté thérapeute', () => {
  it('compte les paiements confirmés depuis le dernier passage, au pluriel juste', () => {
    const a = annonceDeLaRepriseAuCabinet({
      confirmees: [
        { id: 'c1', title: 'A', livre: true, nouvelle: true },
        { id: 'c2', title: 'B', livre: true, nouvelle: true },
      ],
      echouees: [],
    })
    expect(a?.text).toContain('2 paiements confirmés')
    expect(a?.tone).toBe('ok')
  })

  it('ne compte pas comme « confirmée » une livraison seulement reprise', () => {
    const a = annonceDeLaRepriseAuCabinet({
      confirmees: [{ id: 'c1', title: 'A', livre: true, nouvelle: false }],
      echouees: [],
    })
    expect(a).toBeNull()
  })

  it('signale une livraison bloquée et un prélèvement rejeté', () => {
    const a = annonceDeLaRepriseAuCabinet({
      confirmees: [{ id: 'c1', title: 'A', livre: false, nouvelle: false }],
      echouees: [{ id: 'e1', title: 'B' }],
    })
    expect(a?.tone).toBe('warn')
    expect(a?.text).toContain('La livraison de « A »')
    expect(a?.text).toContain('1 paiement')
  })
})

describe('fusionner', () => {
  it('garde les deux textes et le ton le plus grave', () => {
    expect(fusionner({ tone: 'hot', text: 'Annulé.' }, { tone: 'ok', text: 'Confirmé.' })).toEqual({
      tone: 'hot',
      text: 'Annulé. Confirmé.',
    })
    expect(fusionner(null, { tone: 'ok', text: 'x' })).toEqual({ tone: 'ok', text: 'x' })
    expect(fusionner(null, null)).toBeNull()
  })
})

describe('listeDeTitres', () => {
  it('énumère à la française', () => {
    expect(listeDeTitres(['A'])).toBe('« A »')
    expect(listeDeTitres(['A', 'B'])).toBe('« A » et « B »')
    expect(listeDeTitres(['A', 'B', 'C'])).toBe('« A », « B » et « C »')
  })
})

describe('totalDesVentes — le total dit sur quoi il porte', () => {
  it('est complet quand toutes les ventes tiennent dans la lecture', () => {
    expect(totalDesVentes([{ amount_cents: 990 }, { amount_cents: 2900 }], 20)).toEqual({
      cents: 3890,
      complet: true,
    })
  })

  it('ne se dit plus complet dès que la lecture est pleine', () => {
    const vingt = Array.from({ length: 20 }, () => ({ amount_cents: 100 }))
    expect(totalDesVentes(vingt, 20)).toEqual({ cents: 2000, complet: false })
  })
})

describe('phraseDeLecture — une panne n’est pas une boutique vide', () => {
  it('se tait quand tout a été lu', () => {
    expect(phraseDeLecture(['', ''])).toBeNull()
  })

  it('nomme ce qui manque', () => {
    expect(phraseDeLecture(['vos produits', '', 'vos ventes'])).toContain('vos produits et vos ventes')
  })
})

describe('saisieDuPrix — rouvrir un prix pour le modifier', () => {
  it('écrit à la française, sans décimales inutiles', () => {
    expect(saisieDuPrix(990)).toBe('9,90')
    expect(saisieDuPrix(2900)).toBe('29')
    expect(saisieDuPrix(1205)).toBe('12,05')
  })

  it('se relit exactement par centimesDe', () => {
    for (const cents of [50, 990, 2900, 12050, 99999]) {
      expect(centimesDe(saisieDuPrix(cents))).toBe(cents)
    }
  })
})
