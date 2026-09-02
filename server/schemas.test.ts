import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { describe, expect, it } from 'vitest'
import {
  generatedAffirmationsSchema,
  generatedModuleSchema,
  generatedProfileSchema,
  sessionDraftSchema,
} from './schemas.js'

/**
 * Les quatre schémas doivent se convertir en format de sortie structurée.
 *
 * Ce test existe pour une panne précise, restée invisible des semaines : le
 * SDK convertit par `z.toJSONSchema`, qui n'existe qu'à partir de Zod 4. Sous
 * Zod 3, chaque appel réel levait un TypeError — donc une 500 sans message —
 * pendant que le mode maquette, qui court-circuite l'appel, marchait
 * parfaitement. La panne n'apparaissait qu'en séance, avec une vraie clé.
 *
 * La conversion ne demande aucun réseau : elle se vérifie ici, à chaque
 * exécution des tests, pour un coût nul.
 */
const SCHEMAS = {
  'brouillon de séance': sessionDraftSchema,
  'module sur mesure': generatedModuleSchema,
  affirmations: generatedAffirmationsSchema,
  'profil psychologique': generatedProfileSchema,
}

describe('sorties structurées', () => {
  for (const [nom, schema] of Object.entries(SCHEMAS)) {
    it(`${nom} : le schéma se convertit pour le modèle`, () => {
      const format = zodOutputFormat(schema)
      expect(format.type).toBe('json_schema')
      expect(format.schema).toHaveProperty('properties')
    })
  }

  it('la sortie du modèle est relue par le schéma, pas seulement décrite', () => {
    const format = zodOutputFormat(generatedAffirmationsSchema)
    expect(format.parse(JSON.stringify({ affirmations: ['ça va aller'] }))).toEqual({
      affirmations: ['ça va aller'],
    })
    expect(() => format.parse(JSON.stringify({ affirmations: 'pas un tableau' }))).toThrow()
  })
})
