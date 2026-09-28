import { readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AI_ROUTES } from './ai.js'
import { routeDeLAppel } from './vercel.js'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Chaque fichier .ts sous api/ est une fonction pour Vercel. */
function fonctions(dossier = join(racine, 'api')): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom)
    if (statSync(chemin).isDirectory()) return fonctions(chemin)
    return nom.endsWith('.ts') && !nom.endsWith('.test.ts') ? [relative(racine, chemin)] : []
  })
}

/**
 * DOUZE, PAS UNE DE PLUS.
 *
 * L'offre gratuite de Vercel refuse tout déploiement qui compte plus de
 * douze fonctions — et elle le refuse au moment de mettre en ligne, pas
 * avant. Les rappels sur le téléphone y ont buté : onze fonctions, deux de
 * plus, et la production est restée sur la version précédente. Cette
 * épreuve le dit avant le déploiement, là où l'on peut encore regrouper.
 */
describe('le nombre de fonctions', () => {
  it("reste dans ce que l'offre gratuite de Vercel accepte", () => {
    const liste = fonctions()
    expect(liste.length, `${liste.length} fonctions :\n${liste.join('\n')}`).toBeLessThanOrEqual(12)
  })
})

describe('la route des analyses', () => {
  it('lit le segment dynamique quand la plateforme le pose', () => {
    expect(routeDeLAppel('hypnose', '/api/ai/hypnose')).toBe('hypnose')
    expect(routeDeLAppel(['module', 'x'], '/api/ai/module')).toBe('module')
  })

  /* Si le segment venait à manquer, les cinq analyses tomberaient ensemble,
     en production, sur l'outil que les cabinets paient. */
  it("retombe sur l'adresse quand le segment manque", () => {
    expect(routeDeLAppel(undefined, '/api/ai/session-draft')).toBe('session-draft')
    expect(routeDeLAppel('', '/api/ai/profile?essai=1')).toBe('profile')
  })

  it('reconnaît chacune des cinq analyses depuis son adresse', () => {
    for (const route of AI_ROUTES) {
      expect(routeDeLAppel(undefined, `/api/ai/${route}`)).toBe(route)
    }
  })

  it('ne devine rien de ce qui n’est pas une adresse', () => {
    expect(routeDeLAppel(undefined, undefined)).toBe('')
    expect(routeDeLAppel(undefined, '/')).toBe('')
  })
})
