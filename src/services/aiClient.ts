/**
 * Client des quatre fonctions IA.
 *
 * Aucune clé d'API ici, et aucun appel direct à api.anthropic.com : le
 * navigateur ne parle qu'à notre propre serveur (server/index.ts), qui détient
 * la clé et construit les prompts. Une transcription de séance est une donnée
 * de santé ; elle ne doit transiter que par une origine que le cabinet
 * maîtrise.
 */
import { NOTES_RELUES_PAR_L_IA } from '@/lib/echelle'
import { supabase } from '@/lib/supabase'
import { seFaitParLePatient } from '@/lib/typesDeModules'
import { allModules, isModuleDone, profileOf, scaleSeries } from '@/state/selectors'
import type { AppState } from '@/state/state'
import type { JetonsDeLAppel } from '@/types/jetons'
import type {
  ContextJournalEntry,
  ContextModule,
  GeneratedAffirmations,
  GeneratedModule,
  GeneratedProfile,
  ModuleKind,
  PatientContext,
  PatientId,
  SessionDraft,
} from '@/types/domain'

// Le contrat de contexte vit dans src/types/domain.ts, d'où le serveur le lit
// aussi : une seule définition, donc pas de dérive silencieuse entre les deux.
export type { ContextJournalEntry, ContextModule, PatientContext }

/**
 * Assemble le contexte envoyé au serveur : le dossier, les modules réellement
 * assignés cette semaine (programme + ajouts) avec leur état, le journal du
 * cabinet complété des notes partagées depuis l'application, les pages de
 * journal marquées comme partagées, les dernières notes du soir, et le profil
 * affiché.
 *
 * LES TÂCHES SEULEMENT. Un module « Audio » ou « Échelle » ne s'affiche
 * jamais comme une tâche chez le patient : cité « (non fait) », il faisait
 * conclure à l'IA qu'il n'avait pas été fait — et le prompt du module lui
 * demande d'en « tirer la leçon ».
 */
export function buildPatientContext(state: AppState, id: PatientId): PatientContext {
  const patient = state.patients[id]
  const modules = allModules(state, id)
  const shared = (state.pages[id] ?? [])
    .filter((page) => page.shared)
    .map((page) => page.text)
    .join(' ')
  /* DU PLUS RÉCENT AU PLUS ANCIEN, comme le journal de la fiche : les mots
     posés pendant la session sont les derniers écrits, ils passent devant. */
  const journal = (state.noteLog[id] ?? [])
    .concat(patient.journal)
    .map((entry) => ({ date: entry.date, text: entry.text }))
  /* Les notes datées du dossier ; en démonstration, la série sans dates. */
  const mesures = patient.mesures ?? scaleSeries(state, id).map((valeur) => ({ date: '', valeur }))

  return {
    name: patient.name,
    program: patient.program,
    subtitle: patient.subtitle,
    weekLabel: patient.weekLabel,
    sessions: patient.sessions,
    totalSessions: patient.totalSessions,
    adherence: patient.adherence,
    scaleLabel: patient.scaleLabel,
    scaleQuestion: patient.scaleQuestion,
    scaleDelta: patient.scaleDelta,
    echelle: mesures.slice(-NOTES_RELUES_PAR_L_IA),
    modules: modules
      .map((module, i) => ({
        title: module.title,
        /* La case dit « fait aujourd'hui » (0051) ; l'IA prépare une séance,
           elle lit la semaine : « fait » s'il l'a été au moins un jour. */
        done: (module.septJours?.faits ?? 0) > 0 || isModuleDone(state, id, i, module.done),
        kind: module.kind,
      }))
      .filter((m) => seFaitParLePatient(m.kind))
      .map(({ title, done }) => ({ title, done })),
    journal,
    shared,
    // Un patient sans profil n'en a pas encore : les prompts le comprennent.
    profile: profileOf(state, id) ?? {
      updated: '',
      portrait: '',
      axes: [],
      levers: [],
      care: [],
    },
  }
}

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

/** Échec d'une fonction IA. Le message est en français, prêt à afficher. */
export class AiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiError'
  }
}

/**
 * Ce qu'un écran dit quand une analyse échoue.
 *
 * LE MESSAGE DU SERVEUR, TEL QUEL. Il est déjà une phrase complète, qui dit
 * la cause et le remède : « Ce cabinet n'a pas encore sa clé Anthropic :
 * posez-la dans l'onglet Intégrations… », « Votre clé Anthropic a été
 * refusée… ». Les écrans le remplaçaient par « Réessayez » — ce qui envoie
 * réessayer en boucle une praticienne dont la clé manque — ou l'enrobaient
 * dans « La génération a échoué : ….. Réessayez. », double point compris.
 *
 * Le repli ne sert qu'à ce qui ne vient pas du serveur : il doit être, lui
 * aussi, une phrase complète.
 */
export function messageDEchec(erreur: unknown, repli: string): string {
  const message = erreur instanceof AiError ? erreur.message.trim() : ''
  return message || repli
}

/** Enveloppe de réponse du serveur : les données, ou l'erreur. */
interface Envelope<T> {
  mock?: boolean
  data?: T
  error?: string
  /** En mode jetons : ce que l'appel a coûté, et ce qui reste. Absent sinon. */
  jetons?: JetonsDeLAppel
}

/**
 * L'évènement que chaque analyse payée en jetons émet sur `window`, avec
 * `{ solde, utilises }` pour détail : le compteur de l'écran se met à jour
 * sans relire la base, d'où que parte l'analyse.
 */
export const EVENEMENT_JETONS = 'klaro:jetons'

/** Annonce les jetons d'un appel. Rien hors d'un navigateur (épreuves, rendu serveur). */
function annoncerJetons(jetons: JetonsDeLAppel): void {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return
  window.dispatchEvent(
    new CustomEvent<JetonsDeLAppel>(EVENEMENT_JETONS, { detail: { solde: jetons.solde, utilises: jetons.utilises } }),
  )
}

/**
 * Le dernier appel a-t-il rendu un texte de maquette ?
 *
 * Le serveur le dit dans chaque réponse ; personne ne le lisait, et un
 * brouillon inventé arrivait à l'écran comme une vraie analyse. Les écrans qui
 * affichent une production de l'IA doivent pouvoir le dire.
 */
let dernierEstMaquette = false

export function derniereReponseEstMaquette(): boolean {
  return dernierEstMaquette
}

/**
 * Le jeton de session, s'il y en a un : le serveur n'agit que pour un compte
 * qu'il reconnaît. Sans base (démonstration), il n'y a pas de jeton à donner.
 */
async function jeton(): Promise<string | null> {
  const db = supabase()
  if (!db) return null
  const { data } = await db.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * Ce que dit une réponse qui ne vient pas de notre serveur.
 *
 * L'hébergeur répond parfois à sa place, en texte brut : un corps trop lourd
 * pour être reçu (413), une analyse qui dépasse le temps qu'il accorde à une
 * fonction (504). Le repli disait alors « le serveur n'a pas répondu » — il
 * avait répondu, et disait pourquoi. `null` : rien de plus précis à dire que
 * le repli de l'écran.
 */
export function messageDeLHebergeur(status: number): string | null {
  if (status === 413) {
    return "La demande est trop volumineuse pour être reçue par le serveur. Rien n'a été produit : raccourcissez la transcription ou les notes, puis relancez."
  }
  if (status === 504) {
    return "L'analyse a dépassé le temps que l'hébergeur lui accorde. Rien n'a été produit : relancez dans un instant."
  }
  return null
}

async function post<T>(route: string, body: unknown, fallback: string): Promise<T> {
  let response: Response
  let payload: Envelope<T>
  try {
    const token = await jeton()
    response = await fetch(`/api/ai/${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  } catch {
    // Serveur arrêté, réseau coupé : même message que l'échec métier.
    throw new AiError(fallback)
  }
  try {
    payload = (await response.json()) as Envelope<T>
  } catch {
    // Une réponse qui n'est pas du JSON : l'hébergeur a parlé à notre place.
    throw new AiError(messageDeLHebergeur(response.status) ?? fallback)
  }
  if (!response.ok || payload?.data === undefined) {
    throw new AiError(payload?.error ?? messageDeLHebergeur(response.status) ?? fallback)
  }
  dernierEstMaquette = payload.mock === true
  if (payload.jetons && typeof payload.jetons.utilises === 'number') annoncerJetons(payload.jetons)
  return payload.data
}

/* ------------------------------------------------------------------ *
 * Les quatre fonctions
 * ------------------------------------------------------------------ */

export interface SessionDraftInput {
  context: PatientContext
  transcript: string
  /** Notes écrites par la thérapeute pendant la séance ; elles priment. */
  notes: string
  /** Les rayons de la bibliothèque d'audios du cabinet. */
  categories: string[]
  /**
   * La séance en base, quand il y en a une. En mode jetons, c'est elle qui
   * ouvre le forfait : les consignes et une actualisation du profil qui la
   * citent ne se repaient pas.
   */
  sessionId?: string | null
}

/** Brouillon de note de séance. */
export function draftSessionNote(input: SessionDraftInput): Promise<SessionDraft> {
  /* Le repli sert quand le serveur ne répond même pas : ce que la thérapeute
     lit doit lui dire quoi faire, pas « erreur inconnue ». */
  return post<SessionDraft>(
    'session-draft',
    input,
    "Le brouillon n'a pas pu être écrit — le serveur n'a pas répondu. Vos notes et la transcription sont intactes : réessayez.",
  )
}

export interface ModuleInput {
  intent: string
  type: ModuleKind
  quiz: boolean
  /**
   * Le dossier de la personne à qui ce module est destiné, s'il y en a une.
   *
   * Le serveur l'accepte depuis toujours ; le client ne le proposait pas, et
   * l'atelier écrivait donc des exercices de manuel quand il aurait pu en
   * écrire pour quelqu'un.
   */
  context?: PatientContext
  /** La séance dont ce module est une consigne : comprise dans son forfait (mode jetons). */
  sessionId?: string | null
}

/** Module sur mesure, depuis le brief de l'atelier. */
export function generateModule(input: ModuleInput): Promise<GeneratedModule> {
  return post<GeneratedModule>(
    'module',
    input,
    "Le module n'a pas pu être écrit — le serveur n'a pas répondu. Votre brief est intact : réessayez.",
  )
}

/** Affirmations de la semaine. */
export function generateAffirmations(input: { context: PatientContext }): Promise<GeneratedAffirmations> {
  return post<GeneratedAffirmations>('affirmations', input, 'La génération a échoué. Réessayez.')
}

export interface ProfileInput {
  context: PatientContext
  /** Notes écrites pendant la dernière séance. */
  notes: string
  /** Synthèse du brouillon de séance, si elle existe. */
  synthese: string
  /** Transcription de la dernière séance, si elle existe. */
  transcript: string
  /** La séance qui vient d'être analysée : l'actualisation qui la suit est comprise (mode jetons). */
  sessionId?: string | null
}

/** Profil psychologique actualisé. */
export function refreshProfile(input: ProfileInput): Promise<GeneratedProfile> {
  return post<GeneratedProfile>('profile', input, "L'actualisation a échoué. Réessayez.")
}

/* ------------------------------------------------------------------ *
 * 5. Hypnose personnalisée
 * ------------------------------------------------------------------ */

export const MOUVEMENTS_HYPNOSE = ['induction', 'approfondissement', 'travail', 'retour'] as const
export type MouvementHypnose = (typeof MOUVEMENTS_HYPNOSE)[number]

/** Le nom que la thérapeute voit passer pendant la génération. */
export const NOM_MOUVEMENT: Record<MouvementHypnose, string> = {
  induction: 'Induction',
  approfondissement: 'Approfondissement',
  travail: 'Travail thérapeutique',
  retour: 'Retour',
}

export interface HypnoseInput {
  context: PatientContext
  /** Les formulations marquantes relevées dans la séance. */
  mots: string[]
  themes: string[]
  synthese: string
  /** Ce que la thérapeute veut travailler, si elle le précise. */
  intention: string
  /**
   * L'hypnose ouverte en base avant l'écriture (useEcritureHypnose). En mode
   * jetons, elle relie les quatre mouvements : l'hypnose se paie une fois.
   */
  hypnoseId?: string | null
}

export interface MouvementEcrit {
  mouvement: MouvementHypnose
  titre: string
  texte: string
}

/**
 * Où reprendre une hypnose interrompue.
 *
 * Ce qui est ACQUIS, c'est la suite ininterrompue des mouvements écrits
 * depuis l'induction — pas tout ce qui existe. Un mouvement écrit après un
 * trou (un versement refusé au deuxième, le troisième passé quand même) l'a
 * été sans son prédécesseur : il reprendrait des images que la séance n'a
 * pas posées. On repart donc du premier manquant et l'on réécrit tout ce qui
 * suit ; l'écriture en base remplace, mouvement par mouvement, sans doublon.
 *
 * Un mouvement au texte vide compte comme manquant : on ne lit pas un blanc
 * à voix haute.
 */
export function pointDeReprise(deja: readonly MouvementEcrit[]): {
  acquis: MouvementEcrit[]
  restants: MouvementHypnose[]
} {
  const acquis: MouvementEcrit[] = []
  for (const mouvement of MOUVEMENTS_HYPNOSE) {
    const ecrit = deja.find((e) => e.mouvement === mouvement && e.texte.trim().length > 0)
    if (!ecrit) break
    acquis.push(ecrit)
  }
  return { acquis, restants: MOUVEMENTS_HYPNOSE.slice(acquis.length) }
}

/**
 * Écrit la séance d'hypnose, un mouvement à la fois.
 *
 * QUATRE APPELS, PAS UN. Trente minutes de lecture font près de cinq mille
 * jetons, soit deux à trois minutes de génération — au-delà des soixante
 * secondes qu'accorde l'hébergeur. Chaque mouvement tient largement dans ce
 * budget, et le modèle écrit mieux sept minutes qu'il n'en écrit trente
 * d'affilée.
 *
 * SÉQUENTIEL, PAS EN PARALLÈLE : chaque mouvement reçoit les précédents,
 * sans quoi le travail reprendrait des images que l'induction n'a pas
 * posées et la séance se sentirait recousue.
 *
 * `onMouvement` est appelé après chacun : l'écran montre l'avancement au
 * lieu d'un rond qui tourne trois minutes, et un échec au troisième laisse
 * les deux premiers acquis.
 *
 * `deja` permet de REPRENDRE : les mouvements acquis ne sont pas réécrits —
 * ils ont été payés — et partent comme précédents du premier manquant, pour
 * que la suite parte des images déjà posées. Voir pointDeReprise.
 */
export async function genererHypnose(
  input: HypnoseInput,
  onMouvement?: (ecrit: MouvementEcrit, rang: number) => void | Promise<void>,
  deja: readonly MouvementEcrit[] = [],
): Promise<MouvementEcrit[]> {
  const { acquis, restants } = pointDeReprise(deja)
  const ecrits: MouvementEcrit[] = [...acquis]
  for (const mouvement of restants) {
    const rendu = await post<{ titre: string; texte: string }>(
      'hypnose',
      {
        ...input,
        mouvement,
        precedents: ecrits.map((e) => ({ mouvement: e.mouvement, texte: e.texte })),
      },
      "L'hypnose n'a pas pu être écrite. Réessayez.",
    )
    const ecrit: MouvementEcrit = { mouvement, titre: rendu.titre, texte: rendu.texte }
    ecrits.push(ecrit)
    await onMouvement?.(ecrit, ecrits.length)
  }
  return ecrits
}
