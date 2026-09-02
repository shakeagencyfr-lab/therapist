import type { Patient } from '@/types/domain'
import type {
  CustomModule,
  JournalEntry,
  JournalPage,
  LibraryAudio,
  ModuleKind,
  PatientAudio,
  PatientId,
  PatientModule,
  PsychProfile,
  PushRecord,
  SessionDraft,
} from '@/types/domain'
import { AUDIO_CATEGORIES, AUDIO_LIBRARY } from '@/data/audioLibrary'
import { JOURNAL_PAGES } from '@/data/journalPages'
import { INITIAL_AFFIRMATIONS, INITIAL_AFF_AUTO } from '@/data/affirmations'
import { PATIENTS, PATIENT_ORDER } from '@/data/patients'
import { CABINETS, SUBSCRIPTIONS } from '@/data/reseller'
import type { Cabinet, CabinetId, PlanCode, Subscription } from '@/types/reseller'

/**
 * L'espace ouvert. Deux personnes différentes, deux applications :
 * la thérapeute suit ses patients, le revendeur suit ses cabinets et ne voit
 * aucune donnée de santé.
 */
export type Space = 'cabinet' | 'reseller'

/** Vue de l'espace revendeur. */
export type ResellerView = 'portfolio' | 'brand' | 'plans'

/** Vue affichée par le commutateur de l'en-tête. Une seule à la fois. */
export type ViewMode =
  | 'therapist'
  | 'patient'
  | 'session'
  | 'atelier'
  | 'audios'
  | 'notif'
  | 'integrations'

/** Vue interne de la maquette téléphone. */
export type PatientView = 'home' | 'journal'

/** Mode de captation de séance. */
export type CaptureMode = 'live' | 'dictation'

/** Filtre d'assiduité du ciblage de notifications. */
export type AdherenceFilter = 'all' | 'low' | 'mid' | 'high'

/**
 * État de l'application.
 *
 * Dans le produit réel, la partie « données patients » vient du serveur ;
 * ne restent côté client que les états d'interface (sélection, brouillons,
 * filtres). Le découpage est signalé par les commentaires de section.
 */
export interface AppState {
  /* Navigation ---------------------------------------------------- */
  /** Espace ouvert. Dans le produit réel, il découle du rôle du compte. */
  space: Space
  mode: ViewMode
  /** Patient sélectionné dans la barre latérale. */
  sel: PatientId
  /** Recherche de la barre latérale. */
  q: string

  /* Dossier du cabinet ---------------------------------------------- *
   * Les fiches vivent ici plutôt que dans un module importé : c'est ce qui
   * permet de les remplacer par celles de la base sans toucher aux écrans
   * ni aux sélecteurs, qui lisent déjà l'état. Sans session, elles restent
   * les fiches de démonstration.                                         */
  /** Cabinet ouvert, quand il vient d'un compte connecté. */
  cabinetId: string | null
  patients: Record<PatientId, Patient>
  patientOrder: PatientId[]
  /** Vrai quand les fiches viennent de la base et non de la démonstration. */
  patientsReels: boolean
  patientsChargement: boolean
  patientsErreur: string

  /* Ajout d'une patiente -------------------------------------------- *
   * Une fiche s'ouvre avec un nom et une adresse, rien de plus : le
   * programme, l'échelle du soir et sa question se règlent ensuite depuis
   * la fiche, quand la première séance a eu lieu.                        */
  pNewOpen: boolean
  pNewName: string
  pNewEmail: string
  /** Confirmation du dernier geste sur le dossier. */
  pNotice: string

  /* Fiche client -------------------------------------------------- */
  /** Modules cochés, clé `${patientId}:${index}`. */
  done: Record<string, boolean>
  /** Modules ajoutés depuis la séance ou l'atelier, par patient. */
  extra: Record<PatientId, PatientModule[]>
  /** Audios envoyés depuis la bibliothèque, par patient. */
  extraAudios: Record<PatientId, PatientAudio[]>

  /* Captation de séance ------------------------------------------- *
   * La séance porte sa propre sélection : c'est la fiche qui recevra la
   * note et les modules. Elle est choisie avant tout le reste, et ne suit
   * pas la barre latérale — changer de fiche entre deux séances ne doit
   * pas déplacer une captation en cours.                                 */
  /** Fiche de la séance en cours. Vide tant qu'aucune n'est choisie. */
  sessionPatient: PatientId
  /** La séance en base, ouverte à la signature du consentement. */
  sessionId: string | null
  consent: boolean
  capture: CaptureMode
  recording: boolean
  /** Durée d'enregistrement, en secondes. */
  elapsed: number
  transcript: string
  /** Segment en cours de reconnaissance, pas encore validé. */
  interim: string
  /** Message d'information affiché sous la zone de captation. */
  notice: string
  sessionNotes: string
  /** Index de l'échantillon de démonstration chargé, s'il y en a un. */
  sample: number | null

  /* Brouillon de note --------------------------------------------- */
  generating: boolean
  draft: SessionDraft | null
  /** Le brouillon affiché est un texte de maquette, pas une analyse. */
  draftMaquette: boolean
  /** La synthèse a été relue et validée par la thérapeute. */
  syntheseOk: boolean
  /** Propositions de modules décochées, par index. */
  proposalOff: Record<number, boolean>
  /** Le brouillon a été envoyé au patient. */
  sent: boolean
  /** Le message au patient a été relu. */
  msgOk: boolean
  /** Audios suggérés décochés, par identifiant. */
  sugOff: Record<string, boolean>
  /** Confirmation d'envoi des audios suggérés. */
  sugSent: string

  /* Atelier de modules -------------------------------------------- */
  /** Modules du cabinet créés dans l'atelier, par type. */
  customs: Record<string, CustomModule[]>
  aIntent: string
  aType: ModuleKind
  aQuiz: boolean
  aGen: boolean
  aMod: CustomModule | null
  /** Patients cochés pour l'assignation. */
  aAssign: Record<PatientId, boolean>
  aNotice: string
  aLastAssigned: string

  /* Bibliothèque audio -------------------------------------------- */
  lib: LibraryAudio[]
  libSel: string | null
  /** « Toutes » ou une catégorie. */
  libFilter: string
  libAssign: Record<PatientId, boolean>
  libNotice: string
  /** Catégorie choisie à l'import. */
  upCat: string
  cats: string[]
  catAdd: boolean
  catName: string

  /* Notifications -------------------------------------------------- */
  nTitle: string
  nMsg: string
  nWhen: string
  /** Programmes cochés. */
  nProgs: Record<string, boolean>
  nAdh: AdherenceFilter
  /** Situations cochées. */
  nSits: Record<string, boolean>
  pushes: PushRecord[]

  /* Espace patient -------------------------------------------------- */
  pView: PatientView
  /** Pages du journal, par patient. */
  pages: Record<PatientId, JournalPage[]>
  openPage: string | null
  /** Index du module ouvert dans la maquette téléphone. */
  openTask: number | null
  /** Notes libres saisies dans un module, clé `${patientId}:${index}`. */
  taskNote: Record<string, string>
  /** Réponses de quiz, clé `${patientId}:${moduleIndex}:${questionIndex}`. */
  quizAns: Record<string, number>
  /** Valeur courante de l'échelle du soir. */
  scale: number
  /** Valeurs d'échelle saisies dans la session, par patient. */
  scaleLog: Record<PatientId, number[]>
  /** Brouillon de note de journal. */
  note: string
  /** Notes partagées par le patient pendant la session, par patient. */
  noteLog: Record<PatientId, JournalEntry[]>
  noteSent: boolean
  /** Lecteur audio de la maquette. */
  playing: boolean
  playPos: number
  /** Index de l'audio sélectionné dans la bibliothèque du patient. */
  pAudio: number
  /** Audio déplié côté fiche client, clé `${patientId}:${index}`. */
  audioOn: string | null

  /* Affirmations ---------------------------------------------------- */
  /** Génération automatique le lundi, par patient. */
  affAuto: Record<PatientId, boolean>
  affs: Record<PatientId, string[]>
  /** Affirmations générées, en attente de publication. */
  affPending: Record<PatientId, string[]>
  affNew: string
  /** Index de l'affirmation affichée côté patient. */
  affIdx: number
  /** Patient dont les affirmations sont en cours de génération. */
  affGen: string
  affSaved: string
  /** La rotation automatique est arrêtée après le premier tap. */
  affPaused: boolean

  /* Profil psychologique -------------------------------------------- */
  /** Profil actualisé par l'IA, par patient. */
  profNew: Record<PatientId, PsychProfile>
  /** Patient dont le profil est en cours d'actualisation. */
  profGen: string
  /** Phrase de résumé du changement, par patient. */
  profNote: Record<PatientId, string>

  /* Espace revendeur ------------------------------------------------ */
  rView: ResellerView
  /** Portefeuille : les cabinets vendus. Aucune donnée de santé. */
  rCabinets: Cabinet[]
  rSubs: Record<CabinetId, Subscription>
  /** Cabinet ouvert dans l'éditeur de marque. */
  rSel: CabinetId
  /** Message de confirmation du dernier geste. */
  rNotice: string
  /** Formulaire d'ouverture d'un cabinet. */
  rNewOpen: boolean
  rNewName: string
  rNewSlug: string
  rNewEmail: string
  rNewTherapist: string
  rNewPlan: PlanCode
}

export const initialState: AppState = {
  space: 'cabinet',
  mode: 'therapist',
  sel: 'camille',
  q: '',

  pNewOpen: false,
  pNewName: '',
  pNewEmail: '',
  pNotice: '',

  cabinetId: null,
  patients: PATIENTS,
  patientOrder: PATIENT_ORDER,
  patientsReels: false,
  patientsChargement: false,
  patientsErreur: '',

  done: {},
  extra: {},
  extraAudios: {},

  sessionPatient: '',
  sessionId: null,
  consent: false,
  capture: 'live',
  recording: false,
  elapsed: 0,
  transcript: '',
  interim: '',
  notice: '',
  sessionNotes: '',
  sample: null,

  generating: false,
  draft: null,
  draftMaquette: false,
  syntheseOk: false,
  proposalOff: {},
  sent: false,
  msgOk: false,
  sugOff: {},
  sugSent: '',

  customs: {},
  aIntent: '',
  aType: 'Exercice',
  aQuiz: true,
  aGen: false,
  aMod: null,
  aAssign: {},
  aNotice: '',
  aLastAssigned: '',

  lib: AUDIO_LIBRARY,
  libSel: 'a1',
  libFilter: 'Toutes',
  libAssign: {},
  libNotice: '',
  upCat: 'Détente',
  cats: AUDIO_CATEGORIES,
  catAdd: false,
  catName: '',

  nTitle: '',
  nMsg: '',
  nWhen: 'Ce soir, 20 h',
  nProgs: {},
  nAdh: 'all',
  nSits: {},
  pushes: [],

  pView: 'home',
  pages: JOURNAL_PAGES,
  openPage: null,
  openTask: null,
  taskNote: {},
  quizAns: {},
  scale: 3,
  scaleLog: {},
  note: '',
  noteLog: {},
  noteSent: false,
  playing: false,
  playPos: 214,
  pAudio: 0,
  audioOn: null,

  affAuto: INITIAL_AFF_AUTO,
  affs: INITIAL_AFFIRMATIONS,
  affPending: {},
  affNew: '',
  affIdx: 0,
  affGen: '',
  affSaved: '',
  affPaused: false,

  profNew: {},
  profGen: '',
  profNote: {},

  rView: 'portfolio',
  rCabinets: CABINETS,
  rSubs: SUBSCRIPTIONS,
  rSel: 'ollivier',
  rNotice: '',
  rNewOpen: false,
  rNewName: '',
  rNewSlug: '',
  rNewEmail: '',
  rNewTherapist: '',
  rNewPlan: 'cabinet',
}
