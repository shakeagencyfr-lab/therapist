/**
 * Modèle de domaine.
 *
 * Dans le prototype, ces données sont codées en dur. Dans le produit réel
 * elles viennent d'une API : données de santé, donc chiffrées en transit et
 * au repos, chez un hébergeur certifié HDS, avec journalisation des accès.
 */

/** Identifiant de patient (clé opaque côté API). */
export type PatientId = string

/** Type de module proposé au patient entre deux séances. */
export type ModuleKind =
  | 'Audio'
  | 'Exercice'
  | 'Journal'
  | 'Échelle'
  | 'Écriture'
  | 'Séance'
  | 'Formulaire'
  | 'Visualisation'
  | 'Module'

/** Un axe du profil psychologique : une valeur 0–100 et sa note courte. */
export interface ProfileAxis {
  label: string
  /** 0 à 100. Toujours affichée avec sa bande d'incertitude. */
  value: number
  note: string
}

/** Un conseil d'accompagnement. */
export interface ProfileLever {
  title: string
  body: string
}

/** Profil psychologique, affiné après chaque séance. */
export interface PsychProfile {
  /** Phrase de contexte : « Mis à jour après la séance du 4 septembre ». */
  updated: string
  portrait: string
  axes: ProfileAxis[]
  levers: ProfileLever[]
  /** Points d'attention pour la praticienne. */
  care: string[]
}

/** Un module du parcours de la semaine. */
export interface PatientModule {
  title: string
  meta: string
  kind: ModuleKind
  done: boolean
  /** Module arrivé depuis une séance : sa pilule de type est accentuée. */
  fresh?: boolean
}

/** Un audio envoyé à un patient. */
export interface PatientAudio {
  title: string
  meta: string
  duration: string
}

/** Une entrée du journal partagé, vue côté cabinet. */
export interface JournalEntry {
  date: string
  trigger: string
  text: string
}

/** Une page du journal, côté patient (partagée ou privée). */
export interface JournalPage {
  id: string
  title: string
  date: string
  shared: boolean
  text: string
}

/** Fiche patient complète. */
export interface Patient {
  name: string
  initials: string
  program: string
  subtitle: string
  weekLabel: string
  nextSession: string
  /** Assiduité en pourcentage. */
  adherence: number
  /** Nombre d'écoutes audio. */
  listens: number
  sessions: number
  totalSessions: number
  scaleLabel: string
  scaleQuestion: string
  scaleDelta: string
  /** Série de l'auto-évaluation, 0–10, du plus ancien au plus récent. */
  scale: number[]
  profile: PsychProfile
  modules: PatientModule[]
  audios: PatientAudio[]
  journal: JournalEntry[]
}

/** Une question de quiz de compréhension. */
export interface QuizQuestion {
  question: string
  options: string[]
  /** Index de la bonne réponse dans `options`. */
  correct: number
  feedback: string
}

/** La consigne détaillée d'un module, telle que le patient la voit. */
export interface Consigne {
  duree: string
  quand: string
  /** Les trois temps de la consigne. */
  steps: string[]
  /** Le « pourquoi », destiné au patient. */
  why?: string
  quiz?: QuizQuestion[]
}

/** Un audio de la bibliothèque du cabinet. */
export interface LibraryAudio {
  id: string
  title: string
  cat: string
  duration: string
  meta: string
}

/** Un module généré par l'atelier et enregistré dans la bibliothèque. */
export interface CustomModule {
  titre: string
  duree: string
  quand: string
  steps: string[]
  pourquoi: string
  quiz: QuizQuestion[]
  type: ModuleKind
}

/** Une notification envoyée à un groupe de patients. */
export interface PushRecord {
  title: string
  message: string
  when: string
  /** Noms des destinataires. */
  names: string[]
  /** Date d'envoi affichée dans le journal des envois. */
  stamp: string
}

/* ------------------------------------------------------------------ *
 * Sorties des quatre fonctions IA (JSON renvoyé par le serveur)
 * ------------------------------------------------------------------ */

/** Une proposition de module issue du brouillon de séance. */
export interface DraftProposal {
  titre: string
  pourquoi: string
  type: ModuleKind
}

/** Un point de vigilance clinique. */
export interface DraftVigilance {
  point: string
  conduite: string
}

/** Une catégorie d'audio suggérée depuis la bibliothèque. */
export interface DraftAudioCategory {
  categorie: string
  pourquoi: string
}

/** Brouillon de note de séance (fonction IA n° 1). */
export interface SessionDraft {
  synthese: string
  /** Les mots et métaphores du patient, cités littéralement. */
  mots: string[]
  themes: string[]
  propositions: DraftProposal[]
  induction: string
  questions: string[]
  vigilance: DraftVigilance[]
  categories_audio: DraftAudioCategory[]
  message: string
}

/** Module sur mesure (fonction IA n° 2). */
export interface GeneratedModule {
  titre: string
  duree: string
  quand: string
  steps: string[]
  pourquoi: string
  quiz: QuizQuestion[]
}

/** Affirmations de la semaine (fonction IA n° 3). */
export interface GeneratedAffirmations {
  affirmations: string[]
}

/** Profil psychologique actualisé (fonction IA n° 4). */
export interface GeneratedProfile {
  portrait: string
  axes: ProfileAxis[]
  levers: ProfileLever[]
  care: string[]
  /** Une phrase disant ce qui a changé depuis la version précédente. */
  resume: string
}

/* ------------------------------------------------------------------ *
 * Contexte envoyé aux fonctions IA
 *
 * Source unique, partagée par le client (src/services/aiClient.ts) et le
 * serveur (server/schemas.ts) : les prompts consomment cette forme des deux
 * côtés, et une dérive entre les deux ne serait signalée par aucun test.
 * ------------------------------------------------------------------ */

/** Un module du parcours, tel que les prompts le citent. */
export interface ContextModule {
  title: string
  done: boolean
}

/** Une entrée de journal, telle que les prompts la citent. */
export interface ContextJournalEntry {
  date: string
  text: string
}

/** Le dossier du patient réduit à ce que les prompts consomment. */
export interface PatientContext {
  name: string
  program: string
  subtitle: string
  weekLabel: string
  sessions: number
  totalSessions: number
  adherence: number
  scaleLabel: string
  scaleDelta: string
  modules: ContextModule[]
  journal: ContextJournalEntry[]
  /** Ce que le patient écrit lui-même : pages de journal partagées, mises bout à bout. */
  shared: string
  /** Profil courant, que l'actualisation révise plutôt qu'elle ne remplace. */
  profile: PsychProfile
}

/** La prise de rendez-vous du cabinet, telle que la patiente la verra. */
export interface Reservation {
  url: string
  mode: 'bouton' | 'widget'
  widgetUrl: string | null
}
