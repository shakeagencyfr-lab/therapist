import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { describe, expect, it } from 'vitest'
import {
  contexteLuSchema,
  generatedAffirmationsSchema,
  generatedHypnoseSchema,
  generatedModuleSchema,
  generatedProfileSchema,
  generatedPropositionSchema,
  generatedTexteSchema,
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
  'mouvement d’hypnose': generatedHypnoseSchema,
  // La retouche (0066) : une synthèse ou un message seul, une proposition seule.
  'texte retouché': generatedTexteSchema,
  'proposition retouchée': generatedPropositionSchema,
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

describe('le brouillon de séance ne peut plus rendre un audio ni une échelle', () => {
  const brouillon = (type: string) =>
    JSON.stringify({
      synthese: 's',
      mots: [],
      themes: [],
      propositions: [{ titre: 't', pourquoi: 'p', type }],
      questions: [],
      vigilance: [],
      categories_audio: [],
      message: 'm',
    })

  it('le format de sortie n’offre que des tâches au modèle', () => {
    const format = zodOutputFormat(sessionDraftSchema)
    const texte = JSON.stringify(format.schema)
    expect(texte).toContain('Exercice')
    expect(texte).not.toContain('"Audio"')
    expect(texte).not.toContain('"Échelle"')
  })

  it('une proposition « Audio » ou « Échelle » est refusée à la lecture', () => {
    const format = zodOutputFormat(sessionDraftSchema)
    expect(() => format.parse(brouillon('Exercice'))).not.toThrow()
    expect(() => format.parse(brouillon('Audio'))).toThrow()
    expect(() => format.parse(brouillon('Échelle'))).toThrow()
  })
})

/**
 * Le dossier reçu est LU, pas cru sur parole.
 *
 * Un champ absent prend sa valeur vide ; un champ d'un mauvais type fait
 * refuser la requête ; ce qui grossit avec le suivi est borné sans refus.
 */
describe('contexteLuSchema — le dossier tel que le serveur accepte de le lire', () => {
  it('un dossier réduit au nom se complète de valeurs vides', () => {
    const lu = contexteLuSchema.parse({ name: 'Camille' })
    expect(lu.echelle).toEqual([])
    expect(lu.modules).toEqual([])
    expect(lu.scaleQuestion).toBe('')
    expect(lu.profile).toEqual({ updated: '', portrait: '', axes: [], levers: [], care: [] })
  })

  it('refuse un champ d’un mauvais type', () => {
    expect(contexteLuSchema.safeParse({ name: 'Camille', adherence: '67' }).success).toBe(false)
    expect(contexteLuSchema.safeParse({ name: 'Camille', journal: 'texte' }).success).toBe(false)
    expect(contexteLuSchema.safeParse({}).success).toBe(false)
  })

  it('une note du soir hors de 0 à 10 n’est pas une note', () => {
    expect(contexteLuSchema.safeParse({ name: 'C', echelle: [{ date: '', valeur: 12 }] }).success).toBe(false)
  })

  it('écarte les champs inconnus : rien ne part vers le modèle sans passer ici', () => {
    const lu = contexteLuSchema.parse({ name: 'C', email: 'c@exemple.fr' }) as Record<string, unknown>
    expect(lu).not.toHaveProperty('email')
  })

  it('borne ce qui grossit avec le suivi, en gardant le plus récent', () => {
    const journal = Array.from({ length: 100 }, (_, i) => ({ date: '', text: `j${i}` }))
    const echelle = Array.from({ length: 50 }, (_, i) => ({ date: '', valeur: i % 11 }))
    const lu = contexteLuSchema.parse({ name: 'C', journal, echelle, shared: 'x'.repeat(10_000) })
    // Le journal va du plus récent au plus ancien : on garde le début.
    expect(lu.journal[0]?.text).toBe('j0')
    expect(lu.journal.length).toBeLessThan(100)
    // L'échelle va du plus ancien au plus récent : on garde la fin.
    expect(lu.echelle.at(-1)).toEqual(echelle.at(-1))
    expect(lu.echelle.length).toBeLessThan(50)
    expect(lu.shared.length).toBeLessThan(10_000)
  })
})
