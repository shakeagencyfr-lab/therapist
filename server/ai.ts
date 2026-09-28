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
import { abonnementEnRegle } from './droits.js'
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
  contexteLuSchema,
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
import { seFaitParLePatient, typeDeModule } from '../src/lib/typesDeModules.js'

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
 * D'où vient la clé d'un appel : DU CABINET, et de nulle part ailleurs.
 *
 * C'est le modèle vendu — l'abonnement paie l'outil, la clé paie l'analyse —
 * et c'était aussi, jusqu'ici, une simple préférence : faute de clé propre,
 * l'appel retombait sur celle de la plateforme. Autrement dit, n'importe quel
 * cabinet pouvait dépenser notre clé sans plafond, sans le savoir et sans
 * qu'aucun écran ne le dise. Une analyse de séance coûte quelques centimes ;
 * une bibliothèque d'hypnoses en coûte mille fois plus, et la facture
 * arrivait chez nous.
 *
 * Le repli est donc retiré. Sans clé au cabinet, il n'y a pas d'analyse — et
 * un 503 le dit avant tout travail, en nommant l'endroit où la poser.
 */
export interface Cle {
  apiKey: string
  source: 'cabinet'
}

async function resoudreCle(cabinetId: string | null): Promise<Cle | null> {
  if (!cabinetId) return null
  const propre = await cleAnthropicDuCabinet(cabinetId)
  return propre ? { apiKey: propre, source: 'cabinet' } : null
}

function client(cle: Cle | null): Anthropic {
  if (!cle) {
    throw new HttpError(
      503,
      "Ce cabinet n'a pas encore sa clé Anthropic : posez-la dans l'onglet Intégrations, et l'analyse repartira. Rien n'a été produit.",
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
    /* Une panne du service (5xx) passe : réessayer a un sens. Un refus de
       la demande (4xx) ne passe pas — la même demande échouera pareil, et
       « Réessayez » envoyait la thérapeute tourner en rond. */
    if (status >= 500) {
      return {
        status: 502,
        message:
          status === 529
            ? "Le service d'analyse est momentanément saturé. Réessayez dans un instant."
            : `Le service d'analyse a répondu ${status}. Réessayez dans un instant.`,
      }
    }
    return {
      status,
      message: `Le service d'analyse a refusé la demande (${status}). Rien n'a été produit. Si cela se répète, prévenez votre revendeur : c'est un réglage du serveur.`,
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

/**
 * Le dossier du patient, LU et non plus cru sur parole (server/schemas.ts).
 *
 * Un champ d'un mauvais type levait un TypeError au milieu d'un prompt, et
 * l'écran disait « Erreur interne du serveur » : un message qui n'apprend
 * rien à personne. Le refus se dit maintenant, avec le remède — un onglet
 * resté sur une ancienne version de l'application se corrige en rechargeant.
 */
function asContext(value: unknown): PatientContext {
  if (!value || typeof value !== 'object') {
    throw new HttpError(400, 'Le dossier du patient est absent de la requête.')
  }
  const lu = contexteLuSchema.safeParse(value)
  if (!lu.success) {
    // Les chemins seulement — des noms de champs, jamais leur contenu.
    const champs = lu.error.issues.map((i) => i.path.join('.') || '(racine)').join(', ')
    console.warn(`[ia] dossier illisible — ${champs}`)
    throw new HttpError(
      400,
      "Le dossier du patient est arrivé incomplet. Rechargez la page, puis relancez : rien n'a été produit.",
    )
  }
  return lu.data
}

/** Au plus `combien` chaînes, de `longueur` caractères au plus : le reste est ignoré. */
function asStrings(value: unknown, combien: number, longueur: number): string[] {
  return Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.slice(0, longueur))
        .slice(0, combien)
    : []
}

/**
 * Ce que la thérapeute écrit elle-même, borné AVEC REFUS.
 *
 * À l'inverse du dossier, qu'on coupe sans rien dire (server/schemas.ts) :
 * couper en silence la fin d'une séance ferait analyser une séance qui n'a
 * pas eu lieu, couper un brief ferait écrire un module sur la moitié d'une
 * intention. Au-delà, la requête est refusée en disant quoi raccourcir. Les
 * bornes sont larges — trois heures de parole, des pages de notes — : elles
 * n'arrêtent qu'un corps qui n'a plus rien d'une séance, avant qu'il ne
 * devienne une facture.
 */
const BORNES = {
  /** Transcription et notes d'une séance : environ trois heures de parole. */
  matiere: 200_000,
  brief: 4_000,
  notes: 50_000,
  intention: 2_000,
}

const nombre = (n: number) => n.toLocaleString('fr-FR')

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
  // Les rayons de la bibliothèque : une vingtaine d'ordinaire.
  const categories = asStrings(body.categories, 50, 100)
  const transcript = asText(body.transcript)
  const material = sessionMaterial(transcript, asText(body.notes))
  if (material.length < 80) {
    throw new HttpError(
      400,
      'Il faut un peu plus de matière. Dictez quelques phrases, ou écrivez vos notes dans le champ prévu : elles suffisent.',
    )
  }
  if (material.length > BORNES.matiere) {
    throw new HttpError(
      400,
      `La séance dépasse ce qu'une analyse peut lire d'un bloc : ${nombre(material.length)} caractères, pour ${nombre(BORNES.matiere)} au plus. Rien n'a été produit. Raccourcissez la transcription ; vos notes, elles, priment et peuvent suffire.`,
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

/**
 * Le brief d'un module, lu dans le corps de la requête.
 *
 * LE DOSSIER EN FAISAIT PARTIE, ET IL ÉTAIT JETÉ. Le brief était recomposé
 * champ par champ — intention, type, quiz — et le contexte n'y était pas
 * recopié : les consignes d'une séance partaient avec le dossier de la
 * personne, et l'IA écrivait un exercice de manuel, payé au prix d'un
 * exercice sur mesure. modulePrompt savait pourtant l'écrire pour quelqu'un.
 * Le dossier reste facultatif — l'atelier fabrique aussi des modules
 * génériques —, mais quand il est là, il est lu comme ailleurs, et gardé.
 *
 * Un module « Audio » ou « Échelle » est refusé avant tout appel : le patient
 * ne le verrait jamais comme une tâche (src/lib/typesDeModules.ts), et sa
 * consigne serait payée pour personne.
 *
 * Exportée pour être éprouvée sans appel au modèle.
 */
export function briefDuModule(body: Record<string, unknown>): ModuleContext {
  const intent = asText(body.intent).trim()
  if (intent.length < 15) {
    throw new HttpError(
      400,
      'Décrivez en une phrase ou deux ce que le module doit faire travailler.',
    )
  }
  if (intent.length > BORNES.brief) {
    throw new HttpError(
      400,
      `Le brief est trop long : quelques phrases suffisent, ${nombre(BORNES.brief)} caractères au plus.`,
    )
  }
  const type = typeDeModule(asText(body.type) || 'Exercice')
  if (!type) throw new HttpError(400, "Ce type de module n'existe pas.")
  if (!seFaitParLePatient(type)) {
    throw new HttpError(
      400,
      `Un module « ${type} » n'a pas de consigne à écrire : l'espace du patient donne aux audios et à la note du soir leur propre place, pas celle d'une tâche.`,
    )
  }
  const brief: ModuleContext = { intent, type, quiz: body.quiz !== false }
  if (body.context !== undefined && body.context !== null) brief.context = asContext(body.context)
  return brief
}

async function customModule(body: Record<string, unknown>, cle: Cle | null): Promise<Produit<unknown>> {
  const brief = briefDuModule(body)
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
  const intention = asText(body.intention).trim()
  if (intention.length > BORNES.intention) {
    throw new HttpError(
      400,
      `L'intention est trop longue : une ou deux phrases suffisent, ${nombre(BORNES.intention)} caractères au plus.`,
    )
  }
  /* Trois mouvements précèdent le dernier, jamais plus : au-delà, ce n'est
     plus une séance qui se poursuit, c'est un corps qui grossit. */
  const precedents = (Array.isArray(body.precedents) ? body.precedents : [])
    .filter((p): p is { mouvement: string; texte: string } => Boolean(p && typeof p === 'object'))
    .map((p) => ({ mouvement: asText(p.mouvement).trim() as Mouvement, texte: asText(p.texte).slice(0, 20_000) }))
    .filter((p) => MOUVEMENTS.includes(p.mouvement) && p.texte.trim().length > 0)
    .slice(0, MOUVEMENTS.length - 1)

  return callClaude({
    route: 'hypnose',
    schema: generatedHypnoseSchema,
    system: HYPNOSE_SYSTEM,
    prompt: hypnosePrompt(mouvement, {
      context,
      // Ce que la séance a relevé : quatre à huit formulations, deux à
      // quatre fils. Les bornes n'arrêtent qu'un corps qui n'en est plus un.
      mots: asStrings(body.mots, 30, 400).filter(Boolean),
      themes: asStrings(body.themes, 12, 400).filter(Boolean),
      synthese: asText(body.synthese).trim().slice(0, 8000),
      intention,
      precedents,
    }),
    // Un mouvement fait 500 à 900 mots. Le plafond laisse de la marge au
    // raisonnement sans jamais approcher les soixante secondes.
    maxTokens: 5000,
    cle,
  })
}

/**
 * Le profil est-il complet ?
 *
 * Le schéma de sortie ne peut pas l'exiger : les contraintes de cardinalité
 * sur un tableau ne font pas partie du sous-ensemble de JSON Schema que
 * l'API accepte — le SDK les retire avant l'envoi. C'est donc ici que la
 * vérification se fait.
 *
 * Elle est nécessaire, et pas théorique : le profil d'une patiente a été
 * enregistré en production avec un portrait de 2 259 caractères et TROIS
 * TABLEAUX VIDES. Le modèle avait tout mis dans le portrait, la carte
 * affichait deux titres suivis de rien, et le profil précédent — complet —
 * avait été remplacé par celui-là.
 */
export function profilCreux(p: { axes?: unknown[]; levers?: unknown[]; care?: unknown[] }): string {
  const manque = [
    !p.axes?.length && 'les axes',
    !p.levers?.length && 'les leviers',
    !p.care?.length && "les points d'attention",
  ].filter(Boolean)
  return manque.join(', ')
}

/** Ce qu'on redit au modèle quand il a rendu un profil amputé. */
const RATTRAPAGE =
  "\n\nATTENTION : ta réponse précédente ne contenait pas %s. Ces clés ne sont pas facultatives et un tableau vide n'est pas une réponse. Écris un portrait PLUS COURT — six phrases suffisent — et consacre le reste à « axes » (5), « levers » (4) et « care » (1 à 4). C'est ce que la praticienne lit en premier."

async function profile(body: Partial<ProfileBody>, cle: Cle | null): Promise<Produit<unknown>> {
  const context = asContext(body.context)
  const notes = asText(body.notes).trim()
  if (notes.length > BORNES.notes) {
    throw new HttpError(
      400,
      `Vos notes dépassent ce que l'actualisation peut relire : ${nombre(BORNES.notes)} caractères au plus. Rien n'a été produit. Gardez l'essentiel, puis relancez.`,
    )
  }
  if (mockMode()) return { data: mockGeneratedProfile(context), usage: null }
  const prompt = profilePrompt({
    context,
    notes,
    // La synthèse fait six phrases ; le prompt ne cite que le début de la
    // transcription. Au-delà, rien ne serait lu : on ne le garde pas.
    synthese: asText(body.synthese).trim().slice(0, 8000),
    transcript: asText(body.transcript).trim().slice(0, 2500),
  })
  let { data: generated, usage } = await callClaude({
    route: 'profile',
    schema: generatedProfileSchema,
    system: PROFILE_SYSTEM,
    prompt,
    maxTokens: 6000,
    cle,
  })

  /* Une seule reprise. Si elle échoue aussi, on sert ce qu'on a : un profil
     amputé vaut mieux qu'une erreur après deux appels payés — et l'écran
     dit ce qui manque. */
  const creux = profilCreux(generated)
  if (creux) {
    console.warn(`[ia] profil incomplet, une reprise — manquaient : ${creux}`)
    const reprise = await callClaude({
      route: 'profile',
      schema: generatedProfileSchema,
      system: PROFILE_SYSTEM,
      prompt: prompt + RATTRAPAGE.replace('%s', creux),
      maxTokens: 6000,
      cle,
    })
    /* On garde la meilleure des deux réponses, pas forcément la dernière :
       la reprise peut rendre les axes et perdre le portrait. */
    generated = {
      ...reprise.data,
      portrait: reprise.data.portrait || generated.portrait,
      axes: reprise.data.axes.length ? reprise.data.axes : generated.axes,
      levers: reprise.data.levers.length ? reprise.data.levers : generated.levers,
      care: reprise.data.care.length ? reprise.data.care : generated.care,
      dynamique: reprise.data.dynamique || generated.dynamique,
      alliance: reprise.data.alliance || generated.alliance,
    }
    if (usage && reprise.usage) {
      usage = {
        input: usage.input + reprise.usage.input,
        output: usage.output + reprise.usage.output,
      }
    }
  }
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

  // Hors maquette, il faut la clé DU CABINET. Sans elle, le refus est dit
  // avant tout travail — il n'y a plus de repli qui ferait payer la plateforme.
  return analyserPourCabinet(route, body, appelant?.cabinetId ?? null)
}

/**
 * Le même travail, POUR UN CABINET, sans personne pour le demander.
 *
 * C'est ce dont a besoin une tâche planifiée — les affirmations du lundi — :
 * elle n'a pas de jeton d'appelant à présenter, seulement un cabinet et un
 * dossier. Elle ne contourne rien pour autant : la clé reste celle du
 * cabinet, la consommation est inscrite à son compte, et le refus faute de
 * clé est le même qu'à l'écran.
 */
export async function analyserPourCabinet(
  route: AiRoute,
  body: Record<string, unknown>,
  cabinetId: string | null,
): Promise<AiResult> {
  const mock = mockMode()
  /* LE CONTRAT AVANT LA CLÉ. Un cabinet dont l'essai est passé ou la facture
     impayée garde ses dossiers, pas ses outils : l'analyse en fait partie.
     Le refus se dit avant tout appel, donc avant toute dépense. */
  if (!mock && cabinetId) {
    const db = clientAdmin()
    if (db && !(await abonnementEnRegle(cabinetId, db))) {
      throw new HttpError(
        403,
        "Votre abonnement n'est plus en cours : l'analyse est suspendue. Vos dossiers restent accessibles, et votre revendeur peut réactiver l'offre.",
      )
    }
  }
  const cle = mock ? null : await resoudreCle(cabinetId)
  if (!mock) client(cle)

  const produit = await produire(route, body, cle)

  if (cabinetId && produit.usage) {
    await compter(route, cabinetId, produit.usage)
  }

  return { mock, data: produit.data }
}

function produire(route: AiRoute, body: Record<string, unknown>, cle: Cle | null): Promise<Produit<unknown>> {
  switch (route) {
    case 'session-draft':
      return sessionDraft(body as Partial<SessionDraftBody>, cle)
    case 'module':
      return customModule(body, cle)
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
