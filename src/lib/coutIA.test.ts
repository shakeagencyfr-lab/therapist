import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  JETONS_GABARIT,
  PLAFOND_SORTIE,
  estimationBrouillon,
  jetonsDe,
} from './coutIA'

describe("estimation du coût d'analyse", () => {
  it('ne facture rien tant que rien n’a été dit', () => {
    const e = estimationBrouillon('')
    expect(e.euros).toBe(0)
    expect(e.entree).toBe(0)
  })

  it('compte le gabarit du prompt en plus de la transcription', () => {
    const e = estimationBrouillon('bonjour')
    expect(e.entree).toBe(JETONS_GABARIT + jetonsDe('bonjour'))
  })

  it('ajoute les notes écrites à la matière envoyée', () => {
    const sans = estimationBrouillon('a'.repeat(400))
    const avec = estimationBrouillon('a'.repeat(400), 'b'.repeat(400))
    expect(avec.entree).toBeGreaterThan(sans.entree)
    expect(avec.euros).toBeGreaterThan(sans.euros)
  })

  it('la sortie bute sur le plafond du serveur, jamais au-delà', () => {
    // Une séance de deux heures : la sortie sature bien avant.
    const e = estimationBrouillon('mot '.repeat(20000))
    expect(e.sortie).toBe(PLAFOND_SORTIE)
    expect(e.euros).toBeCloseTo(e.eurosMax, 10)
  })

  it('reste dans l’ordre de grandeur annoncé pour une séance d’une heure', () => {
    // ~8 000 mots, ~45 000 caractères.
    const e = estimationBrouillon('a'.repeat(45000))
    expect(e.euros).toBeGreaterThan(0.05)
    expect(e.euros).toBeLessThan(0.3)
  })

  it('le coût ne dépasse jamais son propre maximum', () => {
    for (const n of [10, 500, 5000, 50000]) {
      const e = estimationBrouillon('a'.repeat(n))
      expect(e.euros).toBeLessThanOrEqual(e.eurosMax + 1e-12)
    }
  })
})

/**
 * Le plafond annoncé est CELUI DU SERVEUR, pas un souvenir.
 *
 * `eurosMax` est présenté à la thérapeute comme le maximum qu'elle engage.
 * Le chiffre était resté à 3 000 quand le serveur en accordait 4 000 : le
 * maximum promis valait un quart de moins que la dépense possible. Rien ne
 * reliait les deux — d'où cette relecture, sur le modèle de celle qui garde
 * le gabarit du prompt (server/prompts.test.ts).
 */
describe('plafond de sortie', () => {
  it("vaut le maxTokens du brouillon de séance, dans server/ai.ts", () => {
    const ai = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../server/ai.ts'), 'utf8')
    const appel = ai.slice(ai.indexOf("route: 'session-draft'"))
    const plafond = /maxTokens: (\d+)/.exec(appel)
    expect(plafond).not.toBeNull()
    expect(Number(plafond![1])).toBe(PLAFOND_SORTIE)
  })
})
