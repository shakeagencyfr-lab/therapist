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
  /**
   * Ce que l'IA a dit avoir changé, à la dernière actualisation.
   *
   * La colonne était écrite à chaque version et relue par personne : la
   * phrase s'affichait le temps de la session qui l'avait produite, puis
   * disparaissait. C'est pourtant la seule trace de ce qui a bougé — et elle
   * se lit surtout le lendemain, en rouvrant la fiche.
   */
  resume?: string
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
  /** Retiré du parcours le… (date lisible). Seuls les modules retirés la portent. */
  retireLe?: string
  /**
   * Les jours faits sur les sept derniers, et ceux où il pouvait l'être
   * (src/lib/assiduite.ts). Un exercice se refait chaque jour : `done` dit
   * « fait aujourd'hui », ceci dit la semaine. Absent en démonstration.
   */
  septJours?: { faits: number; possibles: number }
}

/** Un audio envoyé à un patient. */
export interface PatientAudio {
  title: string
  meta: string
  duration: string
  /** La ligne d'envoi en base (`patient_audios`) : c'est elle qu'on retire. */
  id?: string
  /** L'audio de la bibliothèque : c'est lui qu'on écoute. Absent en démonstration. */
  audioId?: string
}

/** Une entrée du journal partagé, vue côté cabinet. */
export interface JournalEntry {
  date: string
  trigger: string
  text: string
  /**
   * La page en base. Absente des notes de la séance et de la démonstration :
   * sans elle, rien ne se marque lu ni ne se répond.
   */
  id?: string
  /** Quand le cabinet l'a ouverte (0054) ; `null` tant qu'elle attend. */
  luLe?: string | null
}

/**
 * Une réponse du cabinet à une page partagée (0054).
 *
 * C'est un mot du cabinet comme les autres — il arrive dans l'espace, et sur
 * le téléphone si les rappels y sont activés —, adressé au seul auteur de la
 * page et rangé sous elle.
 */
export interface ReponseDuCabinet {
  /** Le mot (`push_notifications.id`). */
  id: string
  texte: string
  /** Quand il est parti. */
  le: string
  /** Côté patient seulement : quand il l'a ouvert, `null` tant qu'il attend. */
  lueLe?: string | null
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
  /**
   * L'évolution de l'échelle en une ligne : « 8 → 3 en 3 semaines ».
   * Calculée à l'assemblage depuis les notes (src/lib/echelle.ts) ; écrite
   * à la main sur les fiches de démonstration.
   */
  scaleDelta: string
  /** Série de l'auto-évaluation, 0–10, du plus ancien au plus récent. */
  scale: number[]
  /**
   * La même série, datée — ce que l'IA relit. Absente en démonstration, où
   * les notes n'ont pas de date.
   */
  mesures?: MesureEchelle[]
  /** Sa séance produit-elle aussi une hypnose personnalisée ? */
  hypnoseActivee: boolean
  profile: PsychProfile
  /** Son parcours : les modules qu'il voit. Les retirés n'y figurent pas. */
  modules: PatientModule[]
  /**
   * Les modules retirés du parcours, du plus récent au plus ancien.
   *
   * Le patient ne les voit plus ; le dossier les garde — fait, mot, réponses
   * au quiz —, et la thérapeute peut les remettre. Absent en démonstration.
   */
  modulesRetires?: PatientModule[]
  /** L'adresse de la fiche : celle qui ouvre son espace. Vide si aucune. */
  email?: string
  /**
   * Son compte est-il rattaché à la fiche ? C'est-à-dire : a-t-il ouvert son
   * espace au moins une fois. L'identifiant du compte, lui, ne quitte pas
   * la couche de données : l'écran n'a besoin que de savoir.
   */
  compteActif?: boolean
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
  /** La ligne en base — absente en démonstration, où rien ne s'enregistre. */
  id?: string
  title: string
  message: string
  when: string
  /**
   * L'horodatage prévu (ISO), tant que le mot n'est pas parti : de quoi
   * rouvrir le champ de date à la même heure pour le reprogrammer.
   */
  prevu?: string | null
  /** Noms des destinataires. */
  names: string[]
  /** Date d'envoi affichée dans le journal des envois. */
  stamp: string
  /**
   * L'heure à laquelle elle part, quand elle n'est pas encore partie.
   *
   * Le journal disait « envoyé » de tout, y compris de ce qui attendait le
   * soir : la thérapeute croyait son mot arrivé et n'y revenait pas.
   */
  attend: string | null
  /**
   * Ce qui est arrivé sur les téléphones — absent en démonstration, où rien
   * ne part.
   */
  telephone?: BilanTelephone
}

/**
 * Le sort d'un mot, patiente par patiente, une fois l'heure venue.
 *
 * « Sans téléphone » n'est pas un échec : la patiente n'a pas activé les
 * rappels, elle lira le mot à sa prochaine ouverture — et la thérapeute
 * peut le lui proposer en séance.
 */
export interface BilanTelephone {
  arrivees: number
  sansTelephone: number
  echecs: number
  /** L'heure était passée depuis plus de deux heures : pas envoyé. */
  tardives: number
  /** Pas encore traité — le passage de la minute s'en occupe. */
  enAttente: number
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

/** Une note du soir : son jour (« AAAA-MM-JJ », vide si inconnu) et sa valeur, 0 à 10. */
export interface MesureEchelle {
  date: string
  valeur: number
}

/** Le dossier du patient réduit à ce que les prompts consomment. */
export interface PatientContext {
  name: string
  program: string
  subtitle: string
  weekLabel: string
  sessions: number
  totalSessions: number
  /** Assiduité, en pourcentage des tâches qu'il peut faire (src/lib/typesDeModules.ts). */
  adherence: number
  scaleLabel: string
  /** La question du soir : c'est elle qui dit si une baisse est un progrès. */
  scaleQuestion: string
  scaleDelta: string
  /** Ses dernières notes du soir, de la plus ancienne à la plus récente. */
  echelle: MesureEchelle[]
  /** Les tâches de son parcours — ni les audios, ni l'échelle, qui ne se cochent pas. */
  modules: ContextModule[]
  /** Son journal, DU PLUS RÉCENT AU PLUS ANCIEN. */
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
