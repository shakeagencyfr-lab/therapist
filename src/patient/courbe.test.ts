import { describe, expect, it } from 'vitest'
import { courbeDuSoir, dateCourte, resumeCourbe, SOIREES_MONTREES } from './courbe'

/**
 * La courbe de ses propres notes du soir.
 *
 * La thérapeute la voyait ; le patient qui la remplissait chaque soir,
 * jamais. Elle se dessine du plus ancien au plus récent, sans juger le sens
 * du mouvement.
 */
const soir = (jour: number, valeur: number) => ({
  valeur,
  // 20 h à Paris : le même jour quel que soit le fuseau du test.
  le: `2026-09-${String(jour).padStart(2, '0')}T18:00:00Z`,
})

describe('courbeDuSoir', () => {
  it('se tait sous deux notes : un point seul ne dit rien d’une évolution', () => {
    expect(courbeDuSoir([])).toEqual([])
    expect(courbeDuSoir([soir(3, 7)])).toEqual([])
  })

  it('range les notes du plus ancien au plus récent, quel que soit l’ordre reçu', () => {
    // La base les rend du plus récent au plus ancien.
    const points = courbeDuSoir([soir(5, 4), soir(4, 6), soir(3, 8)])
    expect(points.map((p) => p.valeur)).toEqual([8, 6, 4])
    expect(points[0]!.x).toBeLessThan(points[2]!.x)
  })

  it('trace une note haute en haut, et garde 0 et 10 dans le cadre', () => {
    const [haut, bas] = courbeDuSoir([soir(3, 10), soir(4, 0)], 300, 80)
    expect(haut!.y).toBeLessThan(bas!.y)
    expect(haut!.y).toBeGreaterThan(0)
    expect(bas!.y).toBeLessThan(80)
  })

  it('ne montre que les deux dernières semaines', () => {
    const mois = Array.from({ length: 25 }, (_, i) => soir(i + 1, i % 11))
    const points = courbeDuSoir(mois)
    expect(points).toHaveLength(SOIREES_MONTREES)
    expect(points[points.length - 1]!.date).toBe('2026-09-25')
  })
})

describe('resumeCourbe', () => {
  it('dit au lecteur d’écran ce que montre le dessin', () => {
    const points = courbeDuSoir([soir(14, 4), soir(3, 7)])
    expect(resumeCourbe(points)).toBe('Vos 2 dernières notes du soir, de 7 le 3 sept. à 4 le 14 sept.')
  })

  it('ne dit rien sans courbe', () => {
    expect(resumeCourbe([])).toBe('')
  })
})

describe('dateCourte', () => {
  it('ne décale pas le jour selon le fuseau', () => {
    expect(dateCourte('2026-09-01')).toBe('1 sept.')
    expect(dateCourte('')).toBe('')
  })
})
