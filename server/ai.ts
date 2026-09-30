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
import { BORNES, asContext, asStrings, asText, nombre } from './lecture.js'
import { baseConfiguree, clientAdmin, identifierPourGesteSensible, type Appelant } from './auth.js'
import { cleAnthropicDuCabinet } from './integrations.js'
import { abonnementEnRegle, hypnoseOuverte, REFUS_HYPNOSE } from './droits.js'
import {
  confirmer,
  coutDeLAppel,
  facturationDuCabinet,
  jetonsDeLAppel,
  recherchesPour,
  rembourser,
  reserver,
  soldeDuCabinet,
  type Facturation,
} from './jetons.js'
import type { JetonsDeLAppel } from '../src/types/jetons.js'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { ZodType } from 'zod'

import {
  mockGeneratedAffirmations,
  mockGeneratedModule,
  mockGeneratedProfile,
  mockHypnoseMouvement,
  mockRetouche,
  mockSessionDraft,
} from './mock.js'
import { SANS_PREFERENCES, preferencesDuCabinet, type Preferences } from './preferences.js'
import { lireRetouche, planDeRetouche, promptDeRetouche, systemeDeRetouche } from './retouche.js'
import type { CibleRetouche } from '../src/lib/retouche.js'
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
  GeneratedProfileOutput,
  HypnoseBody,
  ModuleContext,
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
 * OPUS 5.5 DEPUIS LE 29 SEPTEMBRE 2026. Le successeur d'Opus 5, 20 % moins
 * cher au jeton (4 $ / 20 $ le million contre 5 $ / 25 $). L'effort est posé
 * EXPLICITEMENT à « high » : son défaut est « medium », un cran sous celui
 * d'Opus 5, et une route qui l'omettrait réfléchirait moins qu'avant sans
 * que rien ne le dise. À effort égal, il réfléchit un peu plus qu'Opus 5 :
 * les plafonds de sortie ont été relevés d'autant (voir chaque action).
 *
 * Aucun suffixe de date : l'identifiant d'un modèle est complet tel quel.
 */
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

interface Reglage {
  model: string
  effort?: Effort
}

/** Le modèle des quatre analyses qui comptent. */
export const MODELE_ANALYSE = 'claude-opus-5-5'

/**
 * Le modèle de repli, quand l'analyse refuse une demande.
 *
 * Opus 5.5 porte des filtres de sécurité plus larges qu'Opus 5 (biologie,
 * extraction du raisonnement). Une séance d'hypnose n'a rien à y voir, mais
 * un faux positif ne doit pas devenir une panne : la demande refusée est
 * rejouée UNE fois sur Opus 5, qui la traitait hier. Le SDK du projet ne
 * connaît pas encore le repli côté serveur ; c'est donc un nouvel essai ici.
 */
export const MODELE_DE_REPLI = 'claude-opus-5'

const REGLAGES: Record<AiRoute, Reglage> = {
  'session-draft': { model: MODELE_ANALYSE, effort: 'high' },
  profile: { model: MODELE_ANALYSE, effort: 'high' },
  module: { model: MODELE_ANALYSE, effort: 'high' },
  hypnose: { model: MODELE_ANALYSE, effort: 'high' },
  // La seule exception. Écrire sept affirmations ne demande ni le meilleur
  // modèle ni la moindre réflexion : Haiku refuse output_config.effort (400)
  // et ne raisonne pas par défaut, ce qui est exactement ce qu'on veut.
  affirmations: { model: 'claude-haiku-4-5' },
  /* La retouche n'a pas de réglage à elle : elle EMPRUNTE celui de l'action
     qui a écrit le texte (server/retouche.ts) — Haiku pour des affirmations,
     Opus pour tout le reste. Celui-ci ne sert qu'au journal de démarrage. */
  revision: { model: MODELE_ANALYSE, effort: 'high' },
}

/** Les modèles qui acceptent `output_config.effort`. Les autres répondent 400. */
const EFFORT_ACCEPTE = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
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
 * D'où vient la clé d'un appel : DU CABINET — ou, en mode jetons, de son
 * revendeur (server/jetons.ts). De nulle part ailleurs.
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
  /**
   * « revendeur » : le mode jetons (0065). La clé qui paie est celle du
   * revendeur, et ses refus ne se corrigent pas dans l'onglet du cabinet.
   */
  source: 'cabinet' | 'revendeur'
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
  /**
   * L'action dont l'appel emprunte le modèle et l'effort, quand ce n'est pas
   * la sienne : une retouche prend ceux du texte qu'elle réécrit.
   */
  reglage?: AiRoute
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
  /** Le modèle facturé, quand ce n'est pas celui de l'action (repli après un refus). */
  modele?: string
}

/** Une sortie du modèle, et ce qu'elle a coûté. */
interface Produit<T> {
  data: T
  usage: Usage | null
}

/**
 * Le refus rejoué ailleurs ?
 *
 * Oui pour un refus du modèle d'analyse, une fois, sur le modèle de repli —
 * sauf la catégorie « reasoning_extraction », qu'aucun modèle ne traitera
 * autrement (et qu'Anthropic ne rejoue pas non plus). Jamais quand un modèle
 * est imposé par CLAUDE_MODEL : l'exploitation a choisi, on ne la contredit
 * pas en silence.
 */
export function rejouerLeRefus(model: string, categorie: string | null | undefined): boolean {
  return !MODELE_IMPOSE && model === MODELE_ANALYSE && categorie !== 'reasoning_extraction'
}

/**
 * Une panne du modèle d'analyse se rejoue-t-elle sur le modèle de repli ?
 *
 * Constaté le jour de la bascule : Opus 5.5 répondait 503 à la clé d'un
 * cabinet, trois fois de suite (le SDK réessaie déjà deux fois), et la
 * praticienne restait sans brouillon alors qu'Opus 5 répondait. Opus 5.5 a
 * ses propres limites de débit, et un modèle peut être indisponible pour une
 * clé : 404 (introuvable pour ce compte), 429 (débit), 5xx et 529 (service
 * saturé ou indisponible) se rejouent une fois sur Opus 5. Un refus de clé
 * (401, 403) ou une demande mal formée (400) échoueraient pareil : non.
 */
export function rejouerLaPanne(model: string, statut: number | undefined): boolean {
  if (MODELE_IMPOSE || model !== MODELE_ANALYSE || typeof statut !== 'number') return false
  return statut === 404 || statut === 429 || statut >= 500
}

async function callClaude<T>({ route, schema, system, prompt, maxTokens, cle, reglage }: CallOptions<T>): Promise<Produit<T>> {
  const { model, effort } = reglageDe(reglage ?? route)
  const format = zodOutputFormat(schema)
  const demander = (modele: string) =>
    client(cle).messages.parse({
      model: modele,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
      output_config: effort && EFFORT_ACCEPTE.has(modele) ? { format, effort } : { format },
    })
  let message
  let refuse: Usage | null = null
  let replie = false
  try {
    try {
      message = await demander(model)
    } catch (err) {
      const statut = err instanceof Anthropic.APIError ? err.status : undefined
      if (!rejouerLaPanne(model, statut)) throw err
      console.warn(`[ia] ${route} : ${model} a répondu ${statut}, rejoué sur ${MODELE_DE_REPLI}`)
      replie = true
      message = await demander(MODELE_DE_REPLI)
    }
    /* Un refus est un succès HTTP : il se lit sur stop_reason. Rejoué une
       fois sur le modèle de repli ; l'appel refusé compte dans l'usage. */
    const categorie = (message as { stop_details?: { category?: string | null } | null }).stop_details?.category
    if (!replie && message.stop_reason === 'refusal' && rejouerLeRefus(model, categorie)) {
      console.warn(`[ia] ${route} refusé (${categorie ?? 'sans catégorie'}), rejoué sur ${MODELE_DE_REPLI}`)
      refuse = { input: message.usage.input_tokens, output: message.usage.output_tokens }
      message = await demander(MODELE_DE_REPLI)
    }
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
    /* UN CRÉDIT ÉPUISÉ N'EST PAS UN RÉGLAGE DU SERVEUR. Le service le dit
       par un 400 ordinaire, pas par un refus de clé : il tombait dans le cas
       générique, qui envoyait la thérapeute prévenir son revendeur pour une
       facture qui se règle chez elle, en deux minutes. */
    if (cle?.source === 'cabinet' && err instanceof Anthropic.BadRequestError && /credit balance/i.test(err.message)) {
      throw new HttpError(
        402,
        "Le crédit de votre clé Anthropic est épuisé. Rechargez-le depuis votre compte Anthropic (rubrique Billing), puis relancez : rien n'a été analysé.",
      )
    }
    /* EN MODE JETONS, LA CLÉ EST CELLE DU REVENDEUR. Sa panne n'est ni à la
       praticienne ni à ses jetons : elle se dit au revendeur, et les jetons
       réservés sont rendus (analyserEnJetons). */
    if (
      cle?.source === 'revendeur' &&
      (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    ) {
      throw new HttpError(
        502,
        "La clé d'analyse de votre revendeur a été refusée : prévenez-le, c'est un réglage de son espace. Rien n'a été analysé, et vos jetons vous sont rendus.",
      )
    }
    if (cle?.source === 'revendeur' && err instanceof Anthropic.BadRequestError && /credit balance/i.test(err.message)) {
      throw new HttpError(
        502,
        "Le compte d'analyse de votre revendeur est à court de crédit : prévenez-le. Rien n'a été analysé, et vos jetons vous sont rendus.",
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
    usage: refuse
      ? {
          input: refuse.input + message.usage.input_tokens,
          output: refuse.output + message.usage.output_tokens,
          modele: MODELE_DE_REPLI,
        }
      : replie
        ? { input: message.usage.input_tokens, output: message.usage.output_tokens, modele: MODELE_DE_REPLI }
        : reglage && reglage !== route
          ? /* Un réglage emprunté : le modèle facturé n'est pas celui de la
               route — une retouche d'affirmations passe par Haiku, et le
               compteur doit le savoir pour ne pas la compter au prix d'Opus. */
            { input: message.usage.input_tokens, output: message.usage.output_tokens, modele: model }
          : { input: message.usage.input_tokens, output: message.usage.output_tokens },
  }
}

/* ------------------------------------------------------------------ *
 * Lecture des corps de requête
 * ------------------------------------------------------------------ */

/* Le dossier, les textes et leurs bornes se lisent dans server/lecture.ts :
   la retouche (server/retouche.ts) les lit de la même façon. */

/* ------------------------------------------------------------------ *
 * Les fonctions
 * ------------------------------------------------------------------ */

/**
 * Les chemins exposés, tels que le client les appelle. La retouche (0066)
 * vient en dernier : elle réécrit ce que les autres ont écrit.
 */
export type AiRoute = 'session-draft' | 'module' | 'affirmations' | 'profile' | 'hypnose' | 'revision'

export const AI_ROUTES: AiRoute[] = ['session-draft', 'module', 'affirmations', 'profile', 'hypnose', 'revision']

/**
 * Les préférences que chaque écriture relit (0066) : celles des textes
 * qu'elle produit. Un brouillon de séance écrit la synthèse, le message et
 * les propositions ; la route « module » écrit les modules de l'atelier et
 * les consignes d'après séance. La retouche relit celles du texte retouché.
 */
export const CIBLES_DE_LA_ROUTE: Record<Exclude<AiRoute, 'revision'>, readonly CibleRetouche[]> = {
  'session-draft': ['synthese', 'message', 'proposition'],
  module: ['module', 'consigne'],
  affirmations: ['affirmations'],
  profile: ['profil'],
  hypnose: ['hypnose'],
}

/**
 * Enveloppe de réponse : les données, et le drapeau du mode maquette.
 *
 * En mode jetons, elle dit aussi ce que l'appel a coûté et ce qui reste —
 * une clé de plus, absente sinon : un client d'avant l'ignore.
 */
export interface AiResult {
  mock: boolean
  data: unknown
  jetons?: JetonsDeLAppel
}

async function sessionDraft(
  body: Partial<SessionDraftBody>,
  cle: Cle | null,
  preferences: Preferences,
): Promise<Produit<unknown>> {
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
  // Ce que la praticienne a demandé de retenir, à la fin de la demande (0066).
  const retenues = await preferences(CIBLES_DE_LA_ROUTE['session-draft'])
  return callClaude({
    route: 'session-draft',
    schema: sessionDraftSchema,
    system: SESSION_DRAFT_SYSTEM,
    /* Sans transcription, pas de locuteurs à signaler : l'avertissement sur
       les voix mêlées ne concerne que la parole transcrite. */
    prompt:
      (transcript.trim()
        ? sessionDraftPrompt(material, categories, hasSpeakerLabels(transcript))
        : sessionDraftPrompt(material, categories, true, true)) + retenues,
    maxTokens: 6000,
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

async function customModule(
  body: Record<string, unknown>,
  cle: Cle | null,
  preferences: Preferences,
): Promise<Produit<unknown>> {
  const brief = briefDuModule(body)
  if (mockMode()) return { data: mockGeneratedModule(brief), usage: null }
  const retenues = await preferences(CIBLES_DE_LA_ROUTE.module)
  return callClaude({
    route: 'module',
    schema: generatedModuleSchema,
    system: MODULE_SYSTEM,
    prompt: modulePrompt(brief) + retenues,
    maxTokens: 6000,
    cle,
  })
}

async function affirmations(
  body: Partial<AffirmationsBody>,
  cle: Cle | null,
  preferences: Preferences,
): Promise<Produit<unknown>> {
  const context = asContext(body.context)
  if (mockMode()) return { data: mockGeneratedAffirmations(context), usage: null }
  // La série du lundi aussi (server/affirmationsHebdo.ts) : elle passe par ici.
  const retenues = await preferences(CIBLES_DE_LA_ROUTE.affirmations)
  return callClaude({
    route: 'affirmations',
    schema: generatedAffirmationsSchema,
    system: AFFIRMATIONS_SYSTEM,
    prompt: affirmationsPrompt(context) + retenues,
    maxTokens: 800,
    cle,
  })
}

/**
 * Un mouvement d'hypnose.
 *
 * Un appel par mouvement, et non un pour toute la séance. Trente minutes de
 * lecture font près de cinq mille jetons : deux à trois minutes de
 * génération d'un seul tenant. Un mouvement de sept minutes se rédige en
 * moins d'une minute (mesuré sous Opus 5 : ~60 jetons par seconde), loin des
 * trois cents secondes accordées aux routes d'analyse (vercel.json) — et le
 * modèle écrit mieux sept minutes qu'il n'en écrit trente d'affilée.
 */
async function hypnose(
  body: Partial<HypnoseBody>,
  cle: Cle | null,
  preferences: Preferences,
): Promise<Produit<unknown>> {
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

  const retenues = await preferences(CIBLES_DE_LA_ROUTE.hypnose)
  return callClaude({
    route: 'hypnose',
    schema: generatedHypnoseSchema,
    system: HYPNOSE_SYSTEM,
    prompt:
      hypnosePrompt(mouvement, {
        context,
        // Ce que la séance a relevé : quatre à huit formulations, deux à
        // quatre fils. Les bornes n'arrêtent qu'un corps qui n'en est plus un.
        mots: asStrings(body.mots, 30, 400).filter(Boolean),
        themes: asStrings(body.themes, 12, 400).filter(Boolean),
        synthese: asText(body.synthese).trim().slice(0, 8000),
        intention,
        precedents,
      }) + retenues,
    // Un mouvement fait 500 à 900 mots. Le plafond laisse de la marge au
    // raisonnement d'Opus 5.5, qui pense un peu plus qu'Opus 5 à effort égal.
    maxTokens: 7000,
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

async function profile(
  body: Partial<ProfileBody>,
  cle: Cle | null,
  preferences: Preferences,
): Promise<Produit<unknown>> {
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
  return profilSansTrou({
    route: 'profile',
    schema: generatedProfileSchema,
    system: PROFILE_SYSTEM,
    // Ce que la praticienne a demandé de retenir, à la fin de la demande (0066).
    prompt: prompt + (await preferences(CIBLES_DE_LA_ROUTE.profile)),
    maxTokens: 8000,
    cle,
  })
}

/**
 * Un profil, repris une fois s'il revient creux, et ses axes bornés.
 *
 * L'actualisation et la retouche d'un profil passent par ici : un profil
 * retouché qui perdrait ses leviers remplacerait, lui aussi, un profil
 * complet par une carte vide.
 */
async function profilSansTrou(appel: CallOptions<GeneratedProfileOutput>): Promise<Produit<unknown>> {
  let { data: generated, usage } = await callClaude(appel)

  /* Une seule reprise. Si elle échoue aussi, on sert ce qu'on a : un profil
     amputé vaut mieux qu'une erreur après deux appels payés — et l'écran
     dit ce qui manque. */
  const creux = profilCreux(generated)
  if (creux) {
    console.warn(`[ia] profil incomplet, une reprise — manquaient : ${creux}`)
    const reprise = await callClaude({ ...appel, prompt: appel.prompt + RATTRAPAGE.replace('%s', creux) })
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
        modele: reprise.usage.modele ?? usage.modele,
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

/**
 * La retouche d'un texte déjà écrit (0066) — server/retouche.ts.
 *
 * Placée APRÈS les écritures qu'elle retouche, et appelée sous son propre
 * nom de route : src/lib/coutIA.test.ts relit le plafond de la PREMIÈRE
 * écriture du brouillon et de l'hypnose dans ce fichier.
 *
 * Le système est celui du texte d'origine, les règles de la retouche en
 * plus ; le modèle, l'effort et le plafond aussi. Les préférences du cabinet
 * pour ce type de texte ferment la demande, comme à l'écriture.
 */
async function revision(
  body: Record<string, unknown>,
  cle: Cle | null,
  preferences: Preferences,
): Promise<Produit<unknown>> {
  const demande = lireRetouche(body)
  if (mockMode()) return { data: mockRetouche(demande), usage: null }
  const plan = planDeRetouche(demande.cible)
  const appel = {
    route: 'revision' as const,
    reglage: plan.reglage,
    system: systemeDeRetouche(demande),
    prompt: promptDeRetouche(demande, await preferences([demande.cible])),
    maxTokens: plan.maxTokens,
    cle,
  }
  if (demande.cible === 'profil') return profilSansTrou({ ...appel, schema: generatedProfileSchema })
  return callClaude({ ...appel, schema: plan.schema })
}

/* ------------------------------------------------------------------ *
 * Consommation
 * ------------------------------------------------------------------ */

/** Tarif du modèle, en dollars par million de jetons. */
const TARIFS: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
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
  // 0066 : sans cette valeur dans l'énumération, la retouche ne se compterait pas (0018).
  revision: 'revision',
}

/**
 * L'appel touche-t-il à l'hypnose ? En écrire un mouvement, ou en retoucher
 * un : l'option ouvre les deux, et ne se contourne pas par la retouche.
 */
export function toucheALHypnose(route: AiRoute, body: Record<string, unknown>): boolean {
  return route === 'hypnose' || (route === 'revision' && body.cible === 'hypnose')
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
  const modele = usage.modele ?? reglageDe(route).model
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
    /* Une analyse dépense la clé du cabinet sur un dossier de santé : elle
       exige le second facteur quand le compte en a un, comme la base pour
       lire ce dossier (0056). */
    appelant = await identifierPourGesteSensible(token)
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

  // Hors maquette, il faut la clé DU CABINET — ou les jetons de son revendeur.
  // Sans l'une ni les autres, le refus est dit avant tout travail : il n'y a
  // plus de repli qui ferait payer la plateforme.
  return analyserPourCabinet(route, body, appelant?.cabinetId ?? null)
}

/**
 * Le même travail, POUR UN CABINET, sans personne pour le demander.
 *
 * C'est ce dont a besoin une tâche planifiée — les affirmations du lundi — :
 * elle n'a pas de jeton d'appelant à présenter, seulement un cabinet et un
 * dossier. Elle ne contourne rien pour autant : la clé reste celle du
 * cabinet (ou de son revendeur, jetons décomptés), la consommation est
 * inscrite à son compte, et le refus faute de clé ou de jetons est le même
 * qu'à l'écran.
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
    /* L'HYPNOSE EST UNE OPTION (0065) : comprise dans l'offre, accordée par
       exception, ou achetée pour un temps. Refusée avant toute dépense, dans
       les deux modes — la clé du cabinet ne l'ouvre pas plus que les jetons.
       La retouche d'un mouvement non plus. */
    if (db && toucheALHypnose(route, body) && !(await hypnoseOuverte(cabinetId, db))) {
      throw new HttpError(403, REFUS_HYPNOSE)
    }
  }

  /* CE QUE LE CABINET A DEMANDÉ DE RETENIR (0066), relu au moment d'écrire
     la demande — pas avant, et pas en maquette. */
  const preferences = mock ? SANS_PREFERENCES : preferencesDuCabinet(cabinetId)

  /* QUI PAIE. Hors maquette, le revendeur décide : sa clé et des jetons, ou
     la clé de chaque cabinet. Ce second cas est le chemin d'avant, inchangé. */
  const facturation: Facturation =
    mock || !cabinetId ? { mode: 'cle_cabinet' } : await facturationDuCabinet(cabinetId, clientAdmin())
  if (facturation.mode === 'jetons' && cabinetId) {
    return analyserEnJetons(route, body, cabinetId, facturation, preferences)
  }

  const cle = mock ? null : await resoudreCle(cabinetId)
  if (!mock) client(cle)

  const produit = await produire(route, body, cle, preferences)

  if (cabinetId && produit.usage) {
    await compter(route, cabinetId, produit.usage)
  }

  return { mock, data: produit.data }
}

/**
 * L'analyse en mode jetons : la clé du revendeur, et le prix de l'appel.
 *
 * Les jetons sont RÉSERVÉS avant l'appel — deux analyses lancées ensemble ne
 * passent pas sur un solde qui n'en couvre qu'une —, CONFIRMÉS quand l'appel
 * a produit, RENDUS s'il a échoué, quelle qu'en soit la raison : un corps mal
 * formé, un refus du modèle, une sortie coupée. Ce qui n'a rien produit ne
 * se paie pas.
 */
async function analyserEnJetons(
  route: AiRoute,
  body: Record<string, unknown>,
  cabinetId: string,
  facturation: Extract<Facturation, { mode: 'jetons' }>,
  preferences: Preferences,
): Promise<AiResult> {
  const db = clientAdmin()
  if (!db) {
    throw new HttpError(503, "Le serveur n'a pas sa clé de service : il ne peut pas décompter les jetons. Rien n'a été produit.")
  }
  const cle: Cle = { apiKey: facturation.cle, source: 'revendeur' }
  const cout = await coutDeLAppel(route, body, facturation.bareme, recherchesPour(cabinetId, db))
  const reservation = await reserver(cabinetId, cout, facturation, db)

  let produit: Produit<unknown>
  try {
    produit = await produire(route, body, cle, preferences)
  } catch (err) {
    await rembourser(reservation, db)
    throw err
  }
  await confirmer(reservation, db)

  if (produit.usage) {
    await compter(route, cabinetId, produit.usage)
  }
  return { mock: false, data: produit.data, jetons: jetonsDeLAppel(cout, await soldeDuCabinet(cabinetId, db)) }
}

function produire(
  route: AiRoute,
  body: Record<string, unknown>,
  cle: Cle | null,
  preferences: Preferences,
): Promise<Produit<unknown>> {
  switch (route) {
    case 'session-draft':
      return sessionDraft(body as Partial<SessionDraftBody>, cle, preferences)
    case 'module':
      return customModule(body, cle, preferences)
    case 'affirmations':
      return affirmations(body as Partial<AffirmationsBody>, cle, preferences)
    case 'profile':
      return profile(body as Partial<ProfileBody>, cle, preferences)
    case 'hypnose':
      return hypnose(body as Partial<HypnoseBody>, cle, preferences)
    case 'revision':
      return revision(body, cle, preferences)
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
