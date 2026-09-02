import { describe, expect, it } from 'vitest'
import {
  beneficePaquet,
  centimesEnEuros,
  coutMoyenEuros,
  margePaquet,
  nomDuGenre,
  pourcentage,
  prixConseilleCentimes,
  totalAppels,
} from './revente'

describe('coutMoyenEuros', () => {
  it('ne moyenne rien quand aucun appel n’a eu lieu', () => {
    expect(coutMoyenEuros([])).toBeNull()
    expect(coutMoyenEuros([{ kind: 'module', appels: 0, moyenneCentimes: 12 }])).toBeNull()
  })

  it('pondère par le nombre d’appels, pas par le nombre de genres', () => {
    // 99 appels à 1 ¢ et 1 appel à 100 ¢ : la moyenne pondérée vaut ~2 ¢,
    // là où la moyenne des moyennes annoncerait 50 ¢.
    const moyenne = coutMoyenEuros([
      { kind: 'affirmations', appels: 99, moyenneCentimes: 1 },
      { kind: 'brouillon_seance', appels: 1, moyenneCentimes: 100 },
    ])
    expect(moyenne).not.toBeNull()
    expect(centimesEnEuros(1.99)).toBeCloseTo(moyenne!, 10)
  })

  it('convertit en euros et non en dollars', () => {
    const moyenne = coutMoyenEuros([{ kind: 'module', appels: 4, moyenneCentimes: 10 }])
    expect(moyenne).toBeCloseTo(0.092, 6)
  })
})

describe('prixConseilleCentimes', () => {
  it('double le coût à 100 % de marge', () => {
    expect(prixConseilleCentimes(0.1, 100)).toBe(20)
  })

  it('arrondit vers le haut : jamais sous la marge annoncée', () => {
    // 0,047 € × 1,8 = 0,0846 € → 9 centimes, pas 8.
    expect(prixConseilleCentimes(0.047, 80)).toBe(9)
  })

  it('rend le coût lui-même à marge nulle', () => {
    expect(prixConseilleCentimes(0.05, 0)).toBe(5)
  })
})

describe('margePaquet', () => {
  it('se tait quand le coût n’est pas connu', () => {
    expect(margePaquet(2000, 100, null)).toBeNull()
  })

  it('mesure la marge sur le prix unitaire, pas sur le prix du paquet', () => {
    // 100 crédits à 20 € = 0,20 € l'unité, pour un coût de 0,10 € : +100 %.
    expect(margePaquet(2000, 100, 0.1)).toBeCloseTo(100, 6)
  })

  it('devient négative quand le paquet est vendu à perte', () => {
    expect(margePaquet(500, 100, 0.1)).toBeCloseTo(-50, 6)
  })
})

describe('beneficePaquet', () => {
  it('retranche le coût de tous les crédits vendus', () => {
    expect(beneficePaquet(2000, 100, 0.1)).toBeCloseTo(10, 6)
  })

  it('est négatif quand le prix ne couvre pas l’IA', () => {
    expect(beneficePaquet(500, 100, 0.1)).toBeCloseTo(-5, 6)
  })
})

describe('divers', () => {
  it('compte les appels sans se laisser piéger par un négatif', () => {
    expect(totalAppels([{ kind: 'module', appels: 3, moyenneCentimes: 1 }])).toBe(3)
  })

  it('nomme les genres connus et laisse passer les autres', () => {
    expect(nomDuGenre('brouillon_seance')).toBe('Brouillon de séance')
    expect(nomDuGenre('inconnu')).toBe('inconnu')
  })

  it('signe les pourcentages', () => {
    expect(pourcentage(80)).toBe('+80 %')
    expect(pourcentage(-12.4)).toBe('−12 %')
    expect(pourcentage(0)).toBe('0 %')
  })
})
