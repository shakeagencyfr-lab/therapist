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
import { HttpError } from './errors.js'
import { baseConfiguree, clientAdmin, identifier, type Appelant } from './auth.js'
import { cleAnthropicDuCabinet } from './integrations.js'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { ZodType } from 'zod'

import {
  mockGeneratedAffirmations,
  mockGeneratedModule,
  mockGeneratedProfile,
  mockHypnoseMouvement,
  mockSessionDraft,
} from './mock.js'
import {
  AFFIRMATIONS_SYSTEM,
  HYPNOSE_SYSTEM,
  MODULE_SYSTEM,
  MOUVEMENTS,
  PROFILE_SYSTEM,
  SESSION_DRAFT_SYSTEM,
  type Mouvement,
  affirmationsPrompt,
  hypnosePrompt,
  modulePrompt,
  profilePrompt,
  hasSpeakerLabels,
  sessionDraftPrompt,
  sessionMaterial,
} from './prompts.js'
import {
  generatedAffirmationsSchema,
  generatedHypnoseSchema,
  generatedModuleSchema,
  generatedProfileSchema,
  sessionDraftSchema,
} from './schemas.js'
import type {
  AffirmationsBody,
  HypnoseBody,
  ModuleContext,
  PatientContext,
  ProfileBody,
  SessionDraftBody,
} from './schemas.js'
import type { ModuleKind } from '../src/types/domain.js'

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

/**
 * Le modèle et l'effort de RAISONNEMENT, par type d'action.
 *
 * Choix assumé : la qualité prime sur le coût. Ces textes sont lus par une
 * praticienne et, pour l'hypnose, lus À VOIX HAUTE à quelqu'un — ce n'est
 * pas l'endroit où économiser trois centimes.
 *
 * Les quatre actions n'ont pas la même exigence, et les faire toutes tourner
 * sur le modèle le plus cher au réglage le plus bavard revenait à prendre un
 * taxi pour traverser la rue. Mesuré sur les premiers appels réels : sur un
 * jeu d'affirmations, 533 jetons facturés en sortie pour environ 160 jetons
 * de JSON rendus — les 370 autres étaient du raisonnement que personne ne
 * lit, facturé au tarif de sortie. Quatre appels sur quatre montraient le
 * même motif, et la sortie pesait 80 % de la facture.
 *
 * Ce constat avait d'abord fait descendre le profil et le module sur Sonnet.
 * La consigne a changé depuis — la qualité prime — et ils sont remontés sur
 * Opus à l'effort « high ». Seules les affirmations restent sur Haiku :
 * écrire sept phrases ne demande ni le meilleur modèle ni la moindre
 * réflexion, et c'est la seule action du produit dont on puisse le dire.
 *
 * Aucun suffixe de date : l'identifiant d'un modèle est complet tel quel.
 */
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

interface Reglage {
  model: string
  effort?: Effort
}

const REGLAGES: Record<AiRoute, Reglage> = {
  'session-draft': { model: 'claude-opus-5', effort: 'high' },
  profile: { model: 'claude-opus-5', effort: 'high' },
  module: { model: 'claude-opus-5', effort: 'high' },
  hypnose: { model: 'claude-opus-5', effort: 'high' },
  // La seule exception. Écrire sept affirmations ne demande ni le meilleur
  // modèle ni la moindre réflexion : Haiku refuse output_config.effort (400)
  // et ne raisonne pas par défaut, ce qui est exactement ce qu'on veut.
  affirmations: { model: 'claude-haiku-4-5' },
}

/** Les modèles qui acceptent `output_config.effort`. Les autres répondent 400. */
const EFFORT_ACCEPTE = new Set([
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
])

/** Échappatoire d'exploitation : impose un modèle à toutes les actions. */
const MODELE_IMPOSE = (process.env.CLAUDE_MODEL ?? '').trim()

/**
 * Le réglage effectif d'une action.
 *
 * L'effort n'est transmis que si le modèle l'accepte : `CLAUDE_MODEL` peut
 * imposer n'importe quoi, et un effort envoyé à un modèle qui le refuse ferait
 * échouer l'appel au lieu de le rendre moins cher.
 */
export function reglageDe(route: AiRoute): Reglage {
  const base = REGLAGES[route]
  const model = MODELE_IMPOSE || base.model
  return base.effort && EFFORT_ACCEPTE.has(model) ? { model, effort: base.effort } : { model }
}

/**
 * Le mode maquette évite tout appel réseau. Il se DEMANDE explicitement.
 *
 * Il a longtemps suffi que la clé manque pour l'activer, et c'était le pire
 * défaut possible ici : un serveur mal configuré rendait un brouillon fictif —
 * toujours le même, pour n'importe quel patient — présenté comme l'analyse
 * de sa séance. Une clé absente est une panne de configuration, elle se dit ;
 * elle ne s'invente pas.
 */
function mockMode(): boolean {
  return process.env.AI_MOCK === '1'
}

/**
 * D'où vient la clé d'un appel.
 *
 * Deux provenances, dans cet ordre :
 *
 *   CABINET     la thérapeute a posé sa clé (onglet Intégrations) et paie
 *               directement Anthropic. C'est le modèle vendu : l'abonnement
 *               paie l'outil, la clé paie l'analyse.
 *   PLATEFORME  celle du serveur, en dernier recours — développement,
 *               démonstration, ou dépannage d'un cabinet.
 *
 * La résolution se fait une fois par requête, avant tout appel : aucune clé
 * nulle part, c'est un 503 qui le dit, jamais un texte inventé.
 */
export interface Cle {
  apiKey: string
  source: 'cabinet' | 'plateforme'
}

async function resoudreCle(cabinetId: string | null): Promise<Cle | null> {
  if (cabinetId) {
    const propre = await cleAnthropicDuCabinet(cabinetId)
    if (propre) return { apiKey: propre, source: 'cabinet' }
  }
  const plateforme = (process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '').trim()
  return plateforme ? { apiKey: plateforme, source: 'plateforme' } : null
}

function client(cle: Cle | null): Anthropic {
  if (!cle) {
    throw new HttpError(
      503,
      "L'analyse n'est pas configurée : aucune clé Anthropic, ni pour ce cabinet (onglet Intégrations), ni sur le serveur. Aucune note n'a été produite.",
    )
  }
  return new Anthropic({ apiKey: cle.apiKey })
}

/* ------------------------------------------------------------------ *
 * Erreurs
 * ------------------------------------------------------------------ */

export { HttpError }

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
  route: AiRoute
  maxTokens: number
  cle: Cle | null
}

/**
 * Un appel, une sortie structurée.
 *
 * `output_config.format` contraint la réponse au schéma : le SDK rend l'objet
 * déjà analysé dans `parsed_output`. Plus besoin d'extraire le JSON à la main
 * comme le faisait le prototype avec une expression régulière sur la réponse.
 */
/** Jetons consommés par un appel, pour la consommation du cabinet. */
export interface Usage {
  input: number
  output: number
}

/** Une sortie du modèle, et ce qu'elle a coûté. */
interface Produit<T> {
  data: T
  usage: Usage | null
}

async function callClaude<T>({ route, schema, system, prompt, maxTokens, cle }: CallOptions<T>): Promise<Produit<T>> {
  const { model, effort } = reglageDe(route)
  const format = zodOutputFormat(schema)
  let message
  try {
    message = await client(cle).messages.parse({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
      output_config: effort ? { format, effort } : { format },
    })
  } catch (err) {
    /* Une clé refusée n'est pas la même panne selon À QUI elle appartient.
       Celle du cabinet se corrige dans l'onglet Intégrations, en trente
       secondes ; celle de la plateforme ne se corrige que par nous. Dire
       « vérifiez sa configuration » à une thérapeute dont la clé a expiré,
       c'est l'envoyer chercher chez le revendeur ce qui est chez elle. */
    if (
      cle?.source === 'cabinet' &&
      (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    ) {
      throw new HttpError(
        402,
        "Votre clé Anthropic a été refusée : elle a peut-être expiré, ou son crédit est épuisé. Reprenez-la dans Réglages › Intégrations. Rien n'a été analysé.",
      )
    }
    throw err
  }

  /*
   * Une SORTIE TRONQUÉE se lit avant tout le reste.
   *
   * Quand le modèle bute sur max_tokens, le JSON s'arrête au milieu d'une
   * chaîne et le lecteur du SDK lève « Unterminated string in JSON ». Cette
   * erreur remontait en 500 « erreur interne », puis en 502 « réponse
   * inexploitable » : deux messages qui ne disent ni la cause ni le remède,
   * et qui m'ont coûté un aller-retour dans les journaux de production pour
   * comprendre que j'avais enrichi les prompts sans lever les plafonds.
   *
   * On le dit donc en clair, avec le chiffre en cause.
   */
  if (message.stop_reason === 'max_tokens') {
    throw new HttpError(
      502,
      `La réponse a été coupée avant sa fin : elle dépasse le plafond de ${maxTokens} jetons prévu pour cette analyse. Rien n'a été produit. Prévenez votre revendeur, c'est un réglage du serveur.`,
    )
  }

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
  return {
    data: message.parsed_output,
    usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
  }
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
export type AiRoute = 'session-draft' | 'module' | 'affirmations' | 'profile' | 'hypnose'

export const AI_ROUTES: AiRoute[] = ['session-draft', 'module', 'affirmations', 'profile', 'hypnose']

/** Enveloppe de réponse : les données, et le drapeau du mode maquette. */
export interface AiResult {
  mock: boolean
  data: unknown
}

async function sessionDraft(body: Partial<SessionDraftBody>, cle: Cle | null): Promise<Produit<unknown>> {
  const context = asContext(body.context)
  const categories = asStrings(body.categories)
  const transcript = asText(body.transcript)
  const material = sessionMaterial(transcript, asText(body.notes))
  if (material.length < 80) {
    throw new HttpError(
      400,
      "Il faut un peu plus de matière. Dictez quelques phrases ou chargez la séance d'exemple.",
    )
  }
  if (mockMode()) return { data: mockSessionDraft(context, categories), usage: null }
  return callClaude({
    route: 'session-draft',
    schema: sessionDraftSchema,
    system: SESSION_DRAFT_SYSTEM,
    prompt: sessionDraftPrompt(material, categories, hasSpeakerLabels(transcript)),
    maxTokens: 4000,
    cle,
  })
}

async function customModule(body: Partial<ModuleContext>, cle: Cle | null): Promise<Produit<unknown>> {
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
  if (mockMode()) return { data: mockGeneratedModule(brief), usage: null }
  return callClaude({
    route: 'module',
    schema: generatedModuleSchema,
    system: MODULE_SYSTEM,
    prompt: modulePrompt(brief),
    maxTokens: 4000,
    cle,
  })
}

async function affirmations(body: Partial<AffirmationsBody>, cle: Cle | null): Promise<Produit<unknown>> {
  const context = asContext(body.context)
  if (mockMode()) return { data: mockGeneratedAffirmations(context), usage: null }
  return callClaude({
    route: 'affirmations',
    schema: generatedAffirmationsSchema,
    system: AFFIRMATIONS_SYSTEM,
    prompt: affirmationsPrompt(context),
    maxTokens: 800,
    cle,
  })
}

/**
 * Un mouvement d'hypnose.
 *
 * Un appel par mouvement, et non un pour toute la séance. Trente minutes de
 * lecture font près de cinq mille jetons : deux à trois minutes de
 * génération, quand l'hébergeur en accorde soixante secondes. Un mouvement
 * de sept minutes tient largement dans ce budget — et le modèle écrit mieux
 * sept minutes qu'il n'en écrit trente d'affilée.
 */
async function hypnose(body: Partial<HypnoseBody>, cle: Cle | null): Promise<Produit<unknown>> {
  const mouvement = asText(body.mouvement).trim() as Mouvement
  if (!MOUVEMENTS.includes(mouvement)) {
    throw new HttpError(400, "Ce mouvement d'hypnose n'existe pas.")
  }
  if (mockMode()) return { data: mockHypnoseMouvement(mouvement), usage: null }

  const context = asContext(body.context)
  const precedents = (Array.isArray(body.precedents) ? body.precedents : [])
    .filter((p): p is { mouvement: string; texte: string } => Boolean(p && typeof p === 'object'))
    .map((p) => ({ mouvement: asText(p.mouvement).trim() as Mouvement, texte: asText(p.texte) }))
    .filter((p) => MOUVEMENTS.includes(p.mouvement) && p.texte.trim().length > 0)

  return callClaude({
    route: 'hypnose',
    schema: generatedHypnoseSchema,
    system: HYPNOSE_SYSTEM,
    prompt: hypnosePrompt(mouvement, {
      context,
      mots: (Array.isArray(body.mots) ? body.mots : []).map(asText).filter(Boolean),
      themes: (Array.isArray(body.themes) ? body.themes : []).map(asText).filter(Boolean),
      synthese: asText(body.synthese).trim(),
      intention: asText(body.intention).trim(),
      precedents,
    }),
    // Un mouvement fait 500 à 900 mots. Le plafond laisse de la marge au
    // raisonnement sans jamais approcher les soixante secondes.
    maxTokens: 5000,
    cle,
  })
}

async function profile(body: Partial<ProfileBody>, cle: Cle | null): Promise<Produit<unknown>> {
  const context = asContext(body.context)
  if (mockMode()) return { data: mockGeneratedProfile(context), usage: null }
  const { data: generated, usage } = await callClaude({
    route: 'profile',
    schema: generatedProfileSchema,
    system: PROFILE_SYSTEM,
    prompt: profilePrompt({
      context,
      notes: asText(body.notes).trim(),
      synthese: asText(body.synthese).trim(),
      transcript: asText(body.transcript).trim(),
    }),
    maxTokens: 6000,
    cle,
  })
  // Les axes sont affichés sur une piste 0–100 : on borne avant de servir.
  return {
    data: {
      ...generated,
      axes: generated.axes.map((axis) => ({
        ...axis,
        value: Math.max(0, Math.min(100, Math.round(axis.value))),
      })),
    },
    usage,
  }
}

/* ------------------------------------------------------------------ *
 * Consommation
 * ------------------------------------------------------------------ */

/** Tarif du modèle, en dollars par million de jetons. */
const TARIFS: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}

/** Coût d'un appel en centimes, au tarif du modèle. Inconnu : tarif Opus. */
export function coutCentimes(model: string, usage: Usage): number {
  const tarif = TARIFS[model] ?? TARIFS['claude-opus-5']!
  return ((usage.input * tarif.input + usage.output * tarif.output) / 1_000_000) * 100
}

/** Le genre d'appel tel que la base le classe (enum ai_call_kind). */
const GENRES: Record<AiRoute, string> = {
  'session-draft': 'brouillon_seance',
  module: 'module',
  affirmations: 'affirmations',
  profile: 'profil',
  hypnose: 'hypnose',
}

/**
 * Inscrit la consommation au compte du cabinet. Réservé au serveur : la base
 * n'autorise le cabinet qu'à LIRE sa consommation, pas à l'écrire — c'est ce
 * qui empêche de la maquiller. Un échec d'inscription ne fait pas échouer
 * l'appel : la note est produite, le compteur rattrapera.
 */
async function compter(route: AiRoute, cabinetId: string, usage: Usage): Promise<void> {
  const admin = clientAdmin()
  if (!admin) return
  const { model: modele } = reglageDe(route)
  const { error } = await admin.from('ai_usage').insert({
    cabinet_id: cabinetId,
    kind: GENRES[route],
    model: modele,
    input_tokens: usage.input,
    output_tokens: usage.output,
    cost_cents: coutCentimes(modele, usage),
  })
  if (error) console.warn(`[ia] consommation non inscrite — ${error.message}`)
}

/**
 * Point d'entrée unique. Lève une HttpError portant son statut et son message
 * français ; l'enveloppe appelante la traduit avec describeError().
 *
 * Reliée à une base, la route n'agit que pour un compte reconnu, membre d'un
 * cabinet : c'est ce qui empêche n'importe qui de dépenser une clé depuis
 * l'URL. Sans base — développement local, maquette — il n'y a personne à
 * reconnaître, et la route tourne pour le poste.
 */
export async function handleAi(route: AiRoute, raw: unknown, token: string | null = null): Promise<AiResult> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const mock = mockMode()

  let appelant: Appelant | null = null
  if (baseConfiguree()) {
    appelant = await identifier(token)
    if (!appelant.cabinetId) {
      throw new HttpError(403, "Les fonctions d'analyse sont réservées à l'espace d'un cabinet.")
    }
  } else if (!mock) {
    /* Sans base, personne ne s'identifie — et une route d'analyse ouverte à
       qui atteint le port dépenserait la clé de la plateforme pour n'importe
       qui. On ne l'accepte qu'en maquette, où rien n'est appelé ni facturé. */
    throw new HttpError(
      503,
      "Le serveur n'est pas relié à sa base de données : il ne peut identifier personne, et n'analysera rien.",
    )
  }

  // Hors maquette, il faut une clé — celle du cabinet, sinon celle de la
  // plateforme. Sans aucune, le refus est dit avant tout travail.
  const cle = mock ? null : await resoudreCle(appelant?.cabinetId ?? null)
  if (!mock) client(cle)

  const produit = await produire(route, body, cle)

  if (appelant?.cabinetId && produit.usage) {
    await compter(route, appelant.cabinetId, produit.usage)
  }

  return { mock, data: produit.data }
}

function produire(route: AiRoute, body: Record<string, unknown>, cle: Cle | null): Promise<Produit<unknown>> {
  switch (route) {
    case 'session-draft':
      return sessionDraft(body as Partial<SessionDraftBody>, cle)
    case 'module':
      return customModule(body as Partial<ModuleContext>, cle)
    case 'affirmations':
      return affirmations(body as Partial<AffirmationsBody>, cle)
    case 'profile':
      return profile(body as Partial<ProfileBody>, cle)
    case 'hypnose':
      return hypnose(body as Partial<HypnoseBody>, cle)
  }
}

/** Le mode courant, pour les journaux de démarrage. */
export function currentMode(): string {
  if (mockMode()) return 'maquette'
  if (MODELE_IMPOSE) return `${MODELE_IMPOSE} (imposé)`
  return AI_ROUTES.map((r) => {
    const { model, effort } = reglageDe(r)
    return `${r}=${model.replace('claude-', '')}${effort ? `/${effort}` : ''}`
  }).join(' ')
}
