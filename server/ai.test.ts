import { describe, expect, it } from 'vitest'
import { AI_ROUTES, coutCentimes, currentMode, reglageDe } from './ai.js'

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

describe('reglageDe — le bon modèle et le bon effort par action', () => {
  it('le brouillon de séance garde Opus : c’est la pièce clinique', () => {
    expect(reglageDe('session-draft').model).toBe('claude-opus-5')
  })

  it('tout ce qui demande du jugement clinique reste sur Opus', () => {
    // La qualité prime sur le coût : ces textes sont lus par une praticienne
    // et, pour l'hypnose, lus à voix haute à quelqu'un.
    expect(reglageDe('profile').model).toBe('claude-opus-5')
    expect(reglageDe('module').model).toBe('claude-opus-5')
    expect(reglageDe('hypnose').model).toBe('claude-opus-5')
  })

  it('seules les affirmations descendent : sept phrases ne valent pas Opus', () => {
    expect(reglageDe('affirmations').model).toBe('claude-haiku-4-5')
  })

  it('aucun modèle n’est un identifiant fantaisiste', () => {
    // Un identifiant inconnu retomberait sur le tarif Opus sans rien dire, et
    // la facture du revendeur serait fausse dans le silence le plus complet.
    const TARIFS_PUBLIES: Record<string, number> = {
      'claude-opus-5': 3000,
      'claude-sonnet-5': 1200,
      'claude-haiku-4-5': 600,
      'claude-fable-5-1': 6000,
    }
    for (const route of AI_ROUTES) {
      const { model } = reglageDe(route)
      const attendu = TARIFS_PUBLIES[model]
      expect(attendu, `tarif inconnu pour ${model}`).toBeDefined()
      expect(coutCentimes(model, { input: 1_000_000, output: 1_000_000 })).toBeCloseTo(attendu as number)
    }
  })

  it('l’effort n’est envoyé qu’aux modèles qui l’acceptent', () => {
    // Haiku 4.5 répond 400 à output_config.effort. Un effort posé là ferait
    // échouer l'appel au lieu de le rendre moins cher.
    expect(reglageDe('affirmations').effort).toBeUndefined()
    expect(reglageDe('session-draft').effort).toBe('high')
    expect(reglageDe('profile').effort).toBe('high')
    expect(reglageDe('module').effort).toBe('high')
    expect(reglageDe('hypnose').effort).toBe('high')
  })

  it('le mode courant nomme chaque action, pour le journal de démarrage', () => {
    const mode = currentMode()
    for (const route of AI_ROUTES) expect(mode).toContain(route)
  })
})
