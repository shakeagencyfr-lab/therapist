import { describe, expect, it } from 'vitest'
import { ecartEchelle, jourDe, mesuresDatees, type NoteDuSoir } from './echelle'

/** Une note posée à midi (UTC) le jour `j` de septembre : le même jour sous tous les fuseaux d'Europe. */
const note = (j: number, valeur: number): NoteDuSoir => ({
  valeur,
  le: `2026-09-${String(j).padStart(2, '0')}T12:00:00Z`,
})

/**
 * L'écart de l'échelle du soir.
 *
 * `patients.scale_delta` n'était écrit par aucun code : l'en-tête de la
 * courbe restait vide et le prompt du profil écrivait « Envie () ». L'écart
 * se calcule désormais depuis les notes, et ce calcul se vérifie ici.
 */
describe("ecartEchelle — ce qui a bougé, en une ligne", () => {
  it('sans note, rien à dire', () => {
    expect(ecartEchelle([])).toBe('')
  })

  it('une seule note : la première, pas encore une évolution', () => {
    expect(ecartEchelle([note(1, 7)])).toBe('Première note : 7')
  })

  it('compare le début à la fin, avec la durée écoulée', () => {
    const serie = [note(1, 8), note(8, 6), note(15, 5), note(22, 3)]
    // Deux de chaque côté : (8 + 6) / 2 = 7, puis (5 + 3) / 2 = 4.
    expect(ecartEchelle(serie)).toBe('7 → 4 en 3 semaines')
  })

  it('moyenne trois notes de chaque côté : une mauvaise soirée ne fait pas le verdict', () => {
    // La dernière soirée est mauvaise (9), les précédentes disaient 2.
    const serie = [8, 8, 8, 5, 4, 2, 2, 9].map((v, i) => note(i + 1, v))
    // (8 + 8 + 8) / 3 = 8 ; (2 + 2 + 9) / 3 ≈ 4,3 → 4.
    expect(ecartEchelle(serie)).toBe('8 → 4 en 7 jours')
  })

  it('sur une série courte, les deux bouts ne se chevauchent pas', () => {
    // Trois notes : un de chaque côté, la note du milieu n'est comptée nulle part.
    expect(ecartEchelle([note(1, 9), note(2, 1), note(3, 5)])).toBe('9 → 5 en 2 jours')
  })

  it('range les notes dans le temps, quel que soit l’ordre reçu', () => {
    expect(ecartEchelle([note(22, 3), note(1, 8)])).toBe('8 → 3 en 3 semaines')
  })

  it('dit « stable » plutôt que « 5 → 5 »', () => {
    expect(ecartEchelle([note(1, 5), note(4, 6), note(9, 5)])).toBe('Stable autour de 5 sur 8 jours')
  })

  it('accorde le jour unique, et compte en mois au-delà de deux', () => {
    expect(ecartEchelle([note(1, 8), note(2, 6)])).toBe('8 → 6 en 1 jour')
    const longue = [
      { valeur: 9, le: '2026-06-01T12:00:00Z' },
      { valeur: 4, le: '2026-09-01T12:00:00Z' },
    ]
    expect(ecartEchelle(longue)).toBe('9 → 4 en 3 mois')
  })

  it('deux notes du même jour : l’écart, sans durée', () => {
    expect(ecartEchelle([note(3, 8), { valeur: 6, le: '2026-09-03T13:00:00Z' }])).toBe('8 → 6')
  })

  it('ne donne aucun sens au mouvement : une hausse se dit comme une baisse', () => {
    // « La confiance » qui monte, « l'envie de fumer » qui descend : la ligne
    // ne juge ni l'une ni l'autre, c'est la question du soir qui le fait.
    expect(ecartEchelle([note(1, 2), note(15, 7)])).toBe('2 → 7 en 2 semaines')
  })
})

describe('mesuresDatees — la série que l’IA relit', () => {
  it('le jour et la valeur, de la plus ancienne à la plus récente', () => {
    expect(mesuresDatees([note(10, 4), note(2, 7)])).toEqual([
      { date: '2026-09-02', valeur: 7 },
      { date: '2026-09-10', valeur: 4 },
    ])
  })

  it('écarte une valeur illisible plutôt que de la citer', () => {
    expect(mesuresDatees([note(2, Number.NaN), note(3, 5)])).toEqual([{ date: '2026-09-03', valeur: 5 }])
  })
})

describe('jourDe', () => {
  it('rend le jour à l’heure locale, pas la date UTC coupée', () => {
    const instant = new Date(2026, 8, 3, 0, 30) // 0 h 30, heure locale
    expect(jourDe(instant.toISOString())).toBe('2026-09-03')
  })

  it('vide sur un instant illisible', () => {
    expect(jourDe('pas une date')).toBe('')
  })
})
