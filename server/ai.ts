/**
 * Le cœur des quatre fonctions IA, indépendant du transport.
 *
 * Deux enveloppes l'utilisent : server/index.ts (Express, pour `npm run dev`)
 * et les fonctions api/ai/*.ts (Vercel, en production). La logique, les
 * prompts et la gestion d'erreur ne vivent qu'ici : une seule vérité, quel que
 * soit l'endroit où le code tourne.
 *
 * Tout appel au modèle part d'ici : la clé n'atteint jamais le navigateur, et
 * les transcriptions de séance — des données de santé — ne transitent qu'entre
 * ce code et l'API. Le client (src/services/aiClient.ts) ne connaît que quatre
 * routes JSON.
 *
 * Voir server/README.md pour les variables d'environnement, le mode maquette
 * et ce qui reste à faire avant une mise en production.
 */
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { ZodType } from 'zod'

import {
  mockGeneratedAffirmations,
  mockGeneratedModule,
  mockGeneratedProfile,
  mockSessionDraft,
} from './mock.js'
import {
  AFFIRMATIONS_SYSTEM,
  MODULE_SYSTEM,
  PROFILE_SYSTEM,
  SESSION_DRAFT_SYSTEM,
  affirmationsPrompt,
  modulePrompt,
  profilePrompt,
  sessionDraftPrompt,
  sessionMaterial,
} from './prompts.js'
import {
  generatedAffirmationsSchema,
  generatedModuleSchema,
  generatedProfileSchema,
  sessionDraftSchema,
} from './schemas.js'
import type {
  AffirmationsBody,
  ModuleContext,
  PatientContext,
  ProfileBody,
  SessionDraftBody,
} from './schemas.js'
import type { ModuleKind } from '../src/types/domain.js'

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

/** Aucun suffixe de date : l'identifiant du modèle est complet tel quel. */
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-5'

/** Le mode maquette évite tout appel réseau : demandé, ou faute de clé. */
function mockMode(): boolean {
  const key = process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? ''
  return process.env.AI_MOCK === '1' || key.trim() === ''
}

let anthropic: Anthropic | null = null
function client(): Anthropic {
  // Instancié à la première requête réelle : le serveur démarre sans clé.
  if (!anthropic) anthropic = new Anthropic()
  return anthropic
}

/* ------------------------------------------------------------------ *
 * Erreurs
 * ------------------------------------------------------------------ */

/** Erreur portant son statut HTTP et son message, en français. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Chaîne d'exceptions du SDK, de la plus spécifique à la plus générale.
 * APIError est ici l'erreur de statut HTTP (l'équivalent de APIStatusError des
 * autres SDK). APIConnectionError en dérive : elle passe donc avant, sinon le
 * cas « service injoignable » serait avalé par le cas générique.
 */
export function describeError(err: unknown): { status: number; message: string } {
  if (err instanceof HttpError) return { status: err.status, message: err.message }

  if (err instanceof Anthropic.RateLimitError) {
    return {
      status: 429,
      message: "Le service d'analyse est momentanément saturé. Réessayez dans un instant.",
    }
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return {
      status: 502,
      message: "Le serveur n'est pas autorisé à appeler le service d'analyse. Vérifiez sa configuration.",
    }
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 504, message: "Le service d'analyse est injoignable depuis le serveur." }
  }
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === 'number' ? err.status : 502
    return {
      status: status >= 500 ? 502 : status,
      message: `Le service d'analyse a répondu ${status}. Réessayez.`,
    }
  }
  return { status: 500, message: 'Erreur interne du serveur.' }
}

/* ------------------------------------------------------------------ *
 * Appel au modèle
 * ------------------------------------------------------------------ */

interface CallOptions<T> {
  schema: ZodType<T>
  system: string
  prompt: string
  maxTokens: number
}

/**
 * Un appel, une sortie structurée.
 *
 * `output_config.format` contraint la réponse au schéma : le SDK rend l'objet
 * déjà analysé dans `parsed_output`. Plus besoin d'extraire le JSON à la main
 * comme le faisait le prototype avec une expression régulière sur la réponse.
 */
async function callClaude<T>({ schema, system, prompt, maxTokens }: CallOptions<T>): Promise<T> {
  const message = await client().messages.parse({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
    output_config: { format: zodOutputFormat(schema) },
  })

  // Un refus est un succès HTTP : il se lit sur stop_reason, avant le contenu.
  if (message.stop_reason === 'refusal') {
    throw new HttpError(
      502,
      "Le service d'analyse a refusé de traiter cette demande. Reprenez ce passage vous-même.",
    )
  }
  if (!message.parsed_output) {
    throw new HttpError(502, "La réponse du service d'analyse est inexploitable. Réessayez.")
  }
  return message.parsed_output
}

/* ------------------------------------------------------------------ *
 * Lecture des corps de requête
 * ------------------------------------------------------------------ */

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asContext(value: unknown): PatientContext {
  if (!value || typeof value !== 'object') {
    throw new HttpError(400, 'Le dossier du patient est absent de la requête.')
  }
  return value as PatientContext
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/* ------------------------------------------------------------------ *
 * Les quatre fonctions
 * ------------------------------------------------------------------ */

/** Les quatre chemins exposés, tels que le client les appelle. */
export type AiRoute = 'session-draft' | 'module' | 'affirmations' | 'profile'

export const AI_ROUTES: AiRoute[] = ['session-draft', 'module', 'affirmations', 'profile']

/** Enveloppe de réponse : les données, et le drapeau du mode maquette. */
export interface AiResult {
  mock: boolean
  data: unknown
}

async function sessionDraft(body: Partial<SessionDraftBody>): Promise<unknown> {
  const context = asContext(body.context)
  const categories = asStrings(body.categories)
  const material = sessionMaterial(asText(body.transcript), asText(body.notes))
  if (material.length < 80) {
    throw new HttpError(
      400,
      "Il faut un peu plus de matière. Dictez quelques phrases ou chargez la séance d'exemple.",
    )
  }
  if (mockMode()) return mockSessionDraft(context, categories)
  return callClaude({
    schema: sessionDraftSchema,
    system: SESSION_DRAFT_SYSTEM,
    prompt: sessionDraftPrompt(material, categories),
    maxTokens: 3000,
  })
}

async function customModule(body: Partial<ModuleContext>): Promise<unknown> {
  const intent = asText(body.intent).trim()
  if (intent.length < 15) {
    throw new HttpError(
      400,
      'Décrivez en une phrase ou deux ce que le module doit faire travailler.',
    )
  }
  const brief: ModuleContext = {
    intent,
    type: (asText(body.type) || 'Exercice') as ModuleKind,
    quiz: body.quiz !== false,
  }
  if (mockMode()) return mockGeneratedModule(brief)
  return callClaude({
    schema: generatedModuleSchema,
    system: MODULE_SYSTEM,
    prompt: modulePrompt(brief),
    maxTokens: 1600,
  })
}

async function affirmations(body: Partial<AffirmationsBody>): Promise<unknown> {
  const context = asContext(body.context)
  if (mockMode()) return mockGeneratedAffirmations(context)
  return callClaude({
    schema: generatedAffirmationsSchema,
    system: AFFIRMATIONS_SYSTEM,
    prompt: affirmationsPrompt(context),
    maxTokens: 800,
  })
}

async function profile(body: Partial<ProfileBody>): Promise<unknown> {
  const context = asContext(body.context)
  if (mockMode()) return mockGeneratedProfile(context)
  const generated = await callClaude({
    schema: generatedProfileSchema,
    system: PROFILE_SYSTEM,
    prompt: profilePrompt({
      context,
      notes: asText(body.notes).trim(),
      synthese: asText(body.synthese).trim(),
      transcript: asText(body.transcript).trim(),
    }),
    maxTokens: 1400,
  })
  // Les axes sont affichés sur une piste 0–100 : on borne avant de servir.
  return {
    ...generated,
    axes: generated.axes.map((axis) => ({
      ...axis,
      value: Math.max(0, Math.min(100, Math.round(axis.value))),
    })),
  }
}

/**
 * Point d'entrée unique. Lève une HttpError portant son statut et son message
 * français ; l'enveloppe appelante la traduit avec describeError().
 */
export async function handleAi(route: AiRoute, raw: unknown): Promise<AiResult> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const mock = mockMode()

  switch (route) {
    case 'session-draft':
      return { mock, data: await sessionDraft(body as Partial<SessionDraftBody>) }
    case 'module':
      return { mock, data: await customModule(body as Partial<ModuleContext>) }
    case 'affirmations':
      return { mock, data: await affirmations(body as Partial<AffirmationsBody>) }
    case 'profile':
      return { mock, data: await profile(body as Partial<ProfileBody>) }
  }
}

/** Le mode courant, pour les journaux de démarrage. */
export function currentMode(): string {
  return mockMode() ? 'maquette' : MODEL
}
