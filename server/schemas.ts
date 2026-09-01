/**
 * Schémas des quatre sorties IA, et types des corps de requête.
 *
 * Les schémas zod servent aux sorties structurées de l'API Claude
 * (`output_config.format`) : le modèle est contraint de répondre dans cette
 * forme et le SDK renvoie l'objet déjà analysé dans `parsed_output`. C'est le
 * gain par rapport au prototype, qui extrayait le JSON de la réponse avec une
 * expression régulière (`out.match(/\{[\s\S]*\}/)`) avant de l'analyser — une
 * étape qui pouvait échouer sur une phrase d'introduction ou une balise de code.
 *
 * Le contexte patient n'est PAS redéfini ici : client et serveur lisent la même
 * définition dans src/types/domain.ts, importée en « import type » — effacée à
 * la compilation, donc sans effet sur ce que le serveur charge à l'exécution.
 */
import { z } from 'zod'
import type {
  GeneratedAffirmations,
  GeneratedModule,
  GeneratedProfile,
  ModuleKind,
  PatientContext,
  SessionDraft,
} from '../src/types/domain.js'

export type { PatientContext }

/* ------------------------------------------------------------------ *
 * Corps de requête
 * ------------------------------------------------------------------ */

export interface SessionDraftBody {
  context: PatientContext
  transcript: string
  notes: string
  /** Les rayons de la bibliothèque d'audios du cabinet. */
  categories: string[]
}

/** Brief de l'atelier de modules. */
export interface ModuleContext {
  intent: string
  type: ModuleKind
  quiz: boolean
}

export interface AffirmationsBody {
  context: PatientContext
}

export interface ProfileBody {
  context: PatientContext
  notes: string
  synthese: string
  transcript: string
}

/* ------------------------------------------------------------------ *
 * Schémas de sortie
 * ------------------------------------------------------------------ */

/** Les cinq types de modules que le brouillon de séance peut proposer. */
const proposalKindSchema = z.enum(['Audio', 'Exercice', 'Journal', 'Échelle', 'Écriture'])

const quizSchema = z.object({
  question: z.string(),
  options: z.array(z.string()),
  correct: z.number().int(),
  feedback: z.string(),
})

export const sessionDraftSchema = z.object({
  synthese: z.string(),
  mots: z.array(z.string()),
  themes: z.array(z.string()),
  propositions: z.array(
    z.object({
      titre: z.string(),
      pourquoi: z.string(),
      type: proposalKindSchema,
    }),
  ),
  induction: z.string(),
  questions: z.array(z.string()),
  vigilance: z.array(z.object({ point: z.string(), conduite: z.string() })),
  categories_audio: z.array(z.object({ categorie: z.string(), pourquoi: z.string() })),
  message: z.string(),
})

export const generatedModuleSchema = z.object({
  titre: z.string(),
  duree: z.string(),
  quand: z.string(),
  steps: z.array(z.string()),
  pourquoi: z.string(),
  quiz: z.array(quizSchema),
})

export const generatedAffirmationsSchema = z.object({
  affirmations: z.array(z.string()),
})

export const generatedProfileSchema = z.object({
  portrait: z.string(),
  axes: z.array(
    z.object({
      label: z.string(),
      value: z.number().int(),
      note: z.string(),
    }),
  ),
  levers: z.array(z.object({ title: z.string(), body: z.string() })),
  care: z.array(z.string()),
  resume: z.string(),
})

/* ------------------------------------------------------------------ *
 * Alignement avec le modèle de domaine du client
 * ------------------------------------------------------------------ */

/**
 * Vérifie à la compilation que chaque schéma produit bien le type attendu par
 * l'interface. Si src/types/domain.ts change sans que le schéma suive, la
 * compilation du serveur échoue ici.
 */
type Aligned<Schema extends Domain, Domain> = Schema

export type SessionDraftOutput = Aligned<z.infer<typeof sessionDraftSchema>, SessionDraft>
export type GeneratedModuleOutput = Aligned<z.infer<typeof generatedModuleSchema>, GeneratedModule>
export type GeneratedAffirmationsOutput = Aligned<
  z.infer<typeof generatedAffirmationsSchema>,
  GeneratedAffirmations
>
export type GeneratedProfileOutput = Aligned<z.infer<typeof generatedProfileSchema>, GeneratedProfile>
