import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  COUT_HYPNOSE,
  COUT_HYPNOSE_MAX,
  JETONS_FIXES_BROUILLON,
  PLAFOND_MOUVEMENT,
  PLAFOND_SORTIE,
  TAUX_EURO,
  estimationBrouillon,
  jetonsDe,
} from './coutIA'

describe("estimation du coût d'analyse", () => {
  it('ne facture rien tant que rien n’a été dit', () => {
    const e = estimationBrouillon('')
    expect(e.euros).toBe(0)
    expect(e.entree).toBe(0)
  })

  it('compte ce que l’appel envoie avant la matière, en plus de la transcription', () => {
    const e = estimationBrouillon('bonjour')
    expect(e.entree).toBe(JETONS_FIXES_BROUILLON + jetonsDe('bonjour'))
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
  const ai = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../server/ai.ts'), 'utf8')
  const plafondDe = (route: string) => {
    const appel = ai.slice(ai.indexOf(`route: '${route}'`))
    const plafond = /maxTokens: (\d+)/.exec(appel)
    expect(plafond).not.toBeNull()
    return Number(plafond![1])
  }

  it("vaut le maxTokens du brouillon de séance, dans server/ai.ts", () => {
    expect(plafondDe('session-draft')).toBe(PLAFOND_SORTIE)
  })

  it("vaut le maxTokens d'un mouvement d'hypnose, dans server/ai.ts", () => {
    expect(plafondDe('hypnose')).toBe(PLAFOND_MOUVEMENT)
  })
})

/**
 * Les montants réellement facturés, relevés dans la table ai_usage
 * (septembre 2026), en centimes de dollar. L'estimation annonçait à peu près
 * la moitié du prix : ces cas la tiennent au-dessus de la réalité.
 */
describe('recalée sur les appels facturés', () => {
  /* Relevés sous Opus 5 (5 $ / 25 $ le million) ; l'analyse tourne depuis sur
     Opus 5.5 (4 $ / 20 $). À jetons égaux, le même appel coûte 0,8 fois :
     c'est ce prix-là que l'estimation doit tenir. À recaler sur les premiers
     appels facturés sous Opus 5.5, qui réfléchit un peu plus à effort égal. */
  const enEuros = (centimesDollar: number) => ((centimesDollar * 0.8) / 100) * TAUX_EURO

  it.each([
    { caracteres: 259, facture: 7.314 },
    { caracteres: 879, facture: 6.025 },
  ])('un brouillon de $caracteres caractères n’est plus annoncé en dessous de son prix', ({ caracteres, facture }) => {
    const e = estimationBrouillon('a'.repeat(caracteres))
    const reel = enEuros(facture)
    // Jamais nettement sous le prix réel : c'était le défaut.
    expect(e.euros).toBeGreaterThanOrEqual(reel * 0.9)
    // Ni absurdement au-dessus : une estimation qui fait peur n'aide pas non plus.
    expect(e.euros).toBeLessThanOrEqual(reel * 1.5)
    // Le « jusqu'à » affiché est une vraie borne.
    expect(e.eurosMax).toBeGreaterThanOrEqual(reel)
  })

  it('l’hypnose : autour des deux hypnoses facturées, et un plafond au-dessus', () => {
    const facturees = [enEuros(31.945), enEuros(32.103)]
    for (const reel of facturees) {
      expect(COUT_HYPNOSE).toBeGreaterThanOrEqual(reel * 0.9)
      expect(COUT_HYPNOSE).toBeLessThanOrEqual(reel * 1.2)
      expect(COUT_HYPNOSE_MAX).toBeGreaterThan(reel)
    }
  })
})
