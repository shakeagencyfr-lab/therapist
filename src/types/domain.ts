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
/**
 * Une version passée du profil, réduite à ce qui se trace.
 *
 * Les versions sont déjà en base — le profil est versionné à chaque
 * actualisation — et elles étaient déjà toutes chargées : seule la dernière
 * servait. Une valeur d'axe sans son histoire est une photo ; c'est le
 * mouvement qui intéresse quelqu'un qui suit la même personne depuis six
 * séances.
 */
export interface ProfileVersion {
  version: number
  sessions: number
  axes: ProfileAxis[]
}

export interface PsychProfile {
  /** Phrase de contexte : « Mis à jour après la séance du 4 septembre ». */
  updated: string
  portrait: string
  axes: ProfileAxis[]
  levers: ProfileLever[]
  /** Ce qui a bougé depuis le début du suivi, et ce qui résiste encore. */
  dynamique?: string
  /** Ce à quoi cette personne répond dans la relation de travail. */
  alliance?: string
  /** Points d'attention pour la praticienne. */
  care: string[]
  /** Les versions précédentes, de la plus ancienne à la plus récente. */
  historique?: ProfileVersion[]
}

/** Un mouvement d'une séance d'hypnose. */
export interface HypnoseMouvement {
  mouvement: 'induction' | 'approfondissement' | 'travail' | 'retour'
  titre: string
  texte: string
}

/** Une séance d'hypnose écrite pour un patient (fonction IA n° 5). */
export interface Hypnose {
  id: string
  titre: string
  intention: string
  complete: boolean
  createdAt: string
  mouvements: HypnoseMouvement[]
}

/** Un module du parcours de la semaine. */
export interface PatientModule {
  title: string
  meta: string
  kind: ModuleKind
  done: boolean
  /** Module arrivé depuis une séance : sa pilule de type est accentuée. */
  fresh?: boolean
  /** Le mot que le patient a posé sur cet exercice, s'il y en a un. */
  note?: string
  /**
   * Pourquoi ce module, dans les mots de la séance.
   *
   * Le brouillon de séance le produit pour chaque proposition, et il était
   * jeté au moment d'écrire le parcours : le patient recevait un titre à
   * cocher, sans jamais savoir ce qu'on attendait de lui.
   */
  pourquoi?: string
  /** L'identifiant en base, absent sur les fiches de démonstration. */
  id?: string
  /** La consigne détaillée, écrite par l'IA et corrigée par la thérapeute. */
  consigne?: Consigne
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
  /** Sa séance produit-elle aussi une hypnose personnalisée ? */
  hypnoseActivee: boolean
  profile: PsychProfile
  modules: PatientModule[]
  audios: PatientAudio[]
  journal: JournalEntry[]
  /** Les hypnoses écrites pour elle, de la plus récente à la plus ancienne. */
  hypnoses: Hypnose[]
  /**
   * Le brouillon de sa dernière séance analysée.
   *
   * Il porte les formulations et la synthèse d'où une hypnose se bâtit :
   * sans lui, une hypnose relancée depuis la fiche perdrait les mots de la
   * séance, qui en sont la matière la plus précieuse.
   */
  dernierBrouillon?: SessionDraft
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
  /**
   * Les formulations marquantes de la séance, citées littéralement.
   *
   * Sans distinction des locuteurs, on ne prétend pas les attribuer : une
   * image forte reste réutilisable même si son auteur est incertain.
   */
  mots: string[]
  themes: string[]
  propositions: DraftProposal[]
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
  /** Ce qui a bougé depuis le début du suivi, et ce qui résiste encore. */
  dynamique: string
  /** Ce à quoi cette personne répond dans la relation de travail. */
  alliance: string
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

/** La prise de rendez-vous du cabinet, telle que le patient la verra. */
export interface Reservation {
  url: string
  mode: 'bouton' | 'widget'
  widgetUrl: string | null
}
