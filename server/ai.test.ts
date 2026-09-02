import { describe, expect, it } from 'vitest'
import { coutCentimes } from './ai.js'

describe('coutCentimes — au tarif du modèle', () => {
  it('Opus 5 : 5 $ / 25 $ le million', () => {
    // 1 M en entrée + 1 M en sortie = 30 $ = 3000 centimes
    expect(coutCentimes('claude-opus-5', { input: 1_000_000, output: 1_000_000 })).toBeCloseTo(3000)
  })
  it('un appel ordinaire coûte des fractions de centime', () => {
    expect(coutCentimes('claude-opus-5', { input: 3000, output: 900 })).toBeCloseTo(3.75, 2)
  })
  it('modèle inconnu : tarif Opus, jamais zéro', () => {
    expect(coutCentimes('claude-inconnu', { input: 1000, output: 0 })).toBeGreaterThan(0)
  })
})
