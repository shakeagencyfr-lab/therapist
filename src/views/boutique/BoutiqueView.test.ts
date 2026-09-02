import { describe, expect, it } from 'vitest'
import { centimesDe } from './BoutiqueView'

describe('centimesDe — le prix tel qu’on le tape', () => {
  it('accepte la virgule française et le point', () => {
    expect(centimesDe('9,90')).toBe(990)
    expect(centimesDe('9.90')).toBe(990)
    expect(centimesDe('29')).toBe(2900)
  })
  it('tolère les espaces', () => {
    expect(centimesDe(' 1 200,50 ')).toBe(120050)
  })
  it('rend NaN sur une saisie illisible, jamais un prix inventé', () => {
    expect(Number.isNaN(centimesDe('gratuit'))).toBe(true)
    expect(Number.isNaN(centimesDe(''))).toBe(false) // vide → 0, refusé par le plancher
  })
})
