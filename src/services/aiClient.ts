/**
 * Client des quatre fonctions IA.
 *
 * Aucune clé d'API ici, et aucun appel direct à api.anthropic.com : le
 * navigateur ne parle qu'à notre propre serveur (server/index.ts), qui détient
 * la clé et construit les prompts. Une transcription de séance est une donnée
 * de santé ; elle ne doit transiter que par une origine que le cabinet
 * maîtrise.
 */
import { supabase } from '@/lib/supabase'
import { allModules, isModuleDone, profileOf } from '@/state/selectors'
import type { AppState } from '@/state/state'
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
 * journal marquées comme partagées, et le profil affiché.
 */
export function buildPatientContext(state: AppState, id: PatientId): PatientContext {
  const patient = state.patients[id]
  const modules = allModules(state, id)
  const shared = (state.pages[id] ?? [])
    .filter((page) => page.shared)
    .map((page) => page.text)
    .join(' ')
  const journal = patient.journal
    .concat(state.noteLog[id] ?? [])
    .map((entry) => ({ date: entry.date, text: entry.text }))

  return {
    name: patient.name,
    program: patient.program,
    subtitle: patient.subtitle,
    weekLabel: patient.weekLabel,
    sessions: patient.sessions,
    totalSessions: patient.totalSessions,
    adherence: patient.adherence,
    scaleLabel: patient.scaleLabel,
    scaleDelta: patient.scaleDelta,
    modules: modules.map((module, i) => ({
      title: module.title,
      done: isModuleDone(state, id, i, module.done),
    })),
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

/** Enveloppe de réponse du serveur : les données, ou l'erreur. */
interface Envelope<T> {
  mock?: boolean
  data?: T
  error?: string
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
    payload = (await response.json()) as Envelope<T>
  } catch {
    // Serveur arrêté, réseau coupé, réponse illisible : même message que l'échec métier.
    throw new AiError(fallback)
  }
  if (!response.ok || payload.data === undefined) {
    throw new AiError(payload.error ?? fallback)
  }
  dernierEstMaquette = payload.mock === true
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
}

/** Brouillon de note de séance. */
export function draftSessionNote(input: SessionDraftInput): Promise<SessionDraft> {
  return post<SessionDraft>('session-draft', input, 'erreur inconnue')
}

export interface ModuleInput {
  intent: string
  type: ModuleKind
  quiz: boolean
}

/** Module sur mesure, depuis le brief de l'atelier. */
export function generateModule(input: ModuleInput): Promise<GeneratedModule> {
  return post<GeneratedModule>('module', input, 'erreur inconnue')
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
}

/** Profil psychologique actualisé. */
export function refreshProfile(input: ProfileInput): Promise<GeneratedProfile> {
  return post<GeneratedProfile>('profile', input, "L'actualisation a échoué. Réessayez.")
}
