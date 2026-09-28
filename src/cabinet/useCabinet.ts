/**
 * Le dossier du cabinet, lu et écrit sous le compte de la praticienne.
 *
 * Aucune de ces requêtes ne nomme un cabinet : la RLS borne déjà chaque table
 * aux lignes du cabinet dont le compte est membre. Une requête qui rendrait le
 * patient d'une autre praticienne serait un défaut de la base, pas d'ici.
 *
 * Les fiches sont assemblées à la forme que les écrans attendent déjà
 * (src/types/domain.ts) puis versées dans l'état : les vues et les sélecteurs
 * n'ont pas à savoir d'où elles viennent.
 */
import { useCallback, useEffect, useState } from 'react'
import { useRetour } from '@/lib/useRetour'
import { supabase } from '@/lib/supabase'
import { demanderInvitation } from '@/services/invitations'
import { adresseValide, messageCreation, normaliserAdresse, refusAdresse } from '@/lib/accesPatient'
import { useStore } from '@/state/store'
import { durationToSeconds, plural } from '@/lib/format'
import { bilanTelephone } from '@/lib/rappels'
import { DELAI_PURGE_JOURS } from '@/lib/seance'
import { ecartEchelle, mesuresDatees } from '@/lib/echelle'
import { seFaitParLePatient } from '@/lib/typesDeModules'
import { assiduite, decalerJour, jourDeParis, JOURS_SUIVIS, septJours } from '@/lib/assiduite'
import { couleursInvalides } from '@/lib/couleurs'
import { refusDeReouverture, type DroitsLus } from '@/lib/contrat'
import { effacerDuStockage } from '@/lib/stockage'
import type { CabinetBranding } from '@/types/reseller'
import type {
  Consigne,
  CustomModule,
  HypnoseMouvement,
  JournalEntry,
  LibraryAudio,
  ModuleKind,
  Patient,
  PatientAudio,
  PatientId,
  PatientModule,
  ProfileAxis,
  ProfileLever,
  PsychProfile,
  PushRecord,
  QuizQuestion,
  Reservation,
  SessionDraft,
} from '@/types/domain'

/* ------------------------------------------------------------------ *
 * Lignes de la base
 * ------------------------------------------------------------------ */

interface PatientRow {
  id: string
  display_name: string
  initials: string
  program: string
  subtitle: string
  week_label: string
  next_session: string | null
  sessions_done: number
  sessions_total: number
  scale_label: string
  scale_question: string
  hypnose_activee: boolean
  scale_delta: string | null
  email: string | null
  auth_user_id: string | null
  created_at: string
}

interface ModuleRow {
  id: string
  patient_id: string
  title: string
  meta: string
  kind: ModuleKind
  position: number
  done_at: string | null
  patient_note: string | null
  consigne: Consigne | null
  /** Retiré du parcours (0045) : le patient ne le voit plus, le dossier le garde. */
  archived_at: string | null
  /** Le jour où il a été confié : avant, il ne pouvait pas être fait. */
  created_at: string
}

/** Les jours où un exercice a été fait (0051), au fuseau de Paris : « AAAA-MM-JJ ». */
interface JoursFaitsRow {
  module_id: string
  jours: string[] | null
}

interface AudioRow {
  /** La ligne d'envoi : c'est elle qu'on retire au patient. */
  id: string
  patient_id: string
  audio_id: string
  listens: number
  audio: { title: string; duration_seconds: number } | null
}

interface ScaleRow {
  patient_id: string
  value: number
  recorded_at: string
}

interface JournalRow {
  patient_id: string
  title: string
  body: string
  trigger_label: string | null
  written_at: string
}

interface CategoryRow {
  id: string
  label: string
  position: number
}

interface LibraryRow {
  id: string
  category_id: string | null
  title: string
  meta: string | null
  duration_seconds: number
  storage_path: string
  created_at: string
}

interface CustomModuleRow {
  id: string
  title: string
  kind: ModuleKind
  duree: string
  quand: string
  steps: string[]
  pourquoi: string | null
  quiz: QuizQuestion[]
}

interface AffirmationRow {
  patient_id: string
  text: string
  position: number
  published_at: string | null
}

interface SettingsRow {
  patient_id: string
  affirmations_auto: boolean
}

/** Une réponse du patient au quiz d'un exercice. */
interface QuizRow {
  module_id: string
  question_index: number
  answer_index: number
}

interface PushRow {
  id: string
  title: string
  body: string
  scheduled_for: string
  scheduled_at: string | null
  created_at: string
  recipients: Array<{ push_status: string | null; patient: { display_name: string } | null }>
}

/** Un module tout juste créé par l'envoi d'une séance. */
export interface ModuleCree {
  id: string
  title: string
  kind: ModuleKind
}

/** La consigne détaillée d'un module, telle qu'elle est stockée. */
export interface ConsigneModule {
  duree: string
  quand: string
  steps: string[]
  why: string
  /**
   * Le quiz d'un module de l'atelier. Facultatif, mais à ne pas perdre :
   * la base remplace la colonne entière à chaque écriture.
   */
  quiz?: QuizQuestion[]
}

interface ProfileRow {
  patient_id: string
  version: number
  sessions_count: number
  portrait: string
  axes: ProfileAxis[]
  levers: ProfileLever[]
  dynamique: string | null
  alliance: string | null
  care: string[]
  resume: string | null
}

interface BrouillonRow {
  patient_id: string
  draft: SessionDraft | null
  created_at: string
}

interface HypnoseRow {
  id: string
  patient_id: string
  titre: string
  intention: string | null
  complete: boolean
  created_at: string
}

interface MouvementRow {
  hypnose_id: string
  mouvement: HypnoseMouvement['mouvement']
  rang: number
  titre: string
  texte: string
}

/**
 * Ce qu'il faut pour ouvrir une fiche : de quoi la nommer, et de quoi la
 * joindre. Le programme, l'échelle du soir et sa question ne s'inventent pas
 * avant la première séance — ils se règlent ensuite depuis la fiche.
 */
export interface NouvellePatiente {
  nom: string
  email: string
}

export interface Resultat {
  ok: boolean
  message: string
  /**
   * Réussi, mais pas entièrement.
   *
   * La fiche est écrite et le courriel n'est pas parti : `ok` reste vrai —
   * refaire le geste buterait sur un doublon — mais l'écran ne doit pas
   * peindre en vert une phrase qui annonce un échec.
   */
  partiel?: boolean
}

/** Durée en secondes vers l'affichage `mm:ss` attendu par les écrans. */
function duree(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
}

/** Les initiales d'un nom, quand la praticienne n'en fournit pas. */
export function initialesDe(nom: string): string {
  return (
    nom
      .split(/\s+/)
      .filter((mot) => /[A-Za-zÀ-ÿ]/.test(mot))
      .slice(0, 2)
      .map((mot) => mot[0]?.toUpperCase() ?? '')
      .join('') || '??'
  )
}

/** Un profil vide, tant qu'aucune séance n'en a produit. */
const PROFIL_VIDE: PsychProfile = {
  updated: "Aucun profil : il s'établira à partir de vos notes de séance",
  portrait: '',
  axes: [],
  levers: [],
  care: [],
}

/**
 * « Liberté · 2 / 6 séances » — dérivé du programme et des compteurs plutôt
 * que stocké : il reste juste quand une séance s'ajoute.
 */
function sousTitre(p: PatientRow): string {
  if (!p.program) return 'Programme à définir'
  const prog = p.program.replace(/^Programme\s+/i, '')
  return p.sessions_total ? `${prog} · ${p.sessions_done} / ${p.sessions_total} séances` : prog
}

/** « 2 séances sur 6 » */
function libelleSemaine(p: PatientRow): string {
  if (!p.program) return 'Programme à définir'
  const faites = `${p.sessions_done} séance${p.sessions_done > 1 ? 's' : ''}`
  return p.sessions_total ? `${faites} sur ${p.sessions_total}` : faites
}

/**
 * Assemble une fiche à la forme des écrans à partir des lignes de la base.
 * Les valeurs dérivées — assiduité, écoutes, série d'échelle — sont calculées
 * ici plutôt que stockées : elles se déduisent, elles ne se saisissent pas.
 */
function assembler(
  p: PatientRow,
  modules: ModuleRow[],
  audios: AudioRow[],
  echelles: ScaleRow[],
  journal: JournalRow[],
  profil: ProfileRow | undefined,
  versions: ProfileRow[],
  hypnoses: HypnoseRow[],
  mouvements: MouvementRow[],
  brouillon: SessionDraft | undefined,
  /** Les jours faits de la semaine, par module ; `null` s'ils n'ont pas pu être lus. */
  joursFaits: Map<string, string[]> | null,
  /** Le jour de Paris où le dossier est lu. */
  aujourdhui: string,
): Patient {
  /* LE PARCOURS, C'EST CE QUE LE PATIENT VOIT. Un module retiré (0045) n'y
     compte plus — ni dans l'assiduité, ni dans « faits sur », ni dans le
     contexte que l'IA relit. Il reste au dossier, à part, pour être remis. */
  const siens = modules.filter((m) => m.patient_id === p.id)
  const mods = siens.filter((m) => !m.archived_at).sort((a, b) => a.position - b.position)
  const retires = siens
    .filter((m) => m.archived_at)
    .sort((a, b) => (b.archived_at ?? '').localeCompare(a.archived_at ?? ''))
  /* L'ASSIDUITÉ NE COMPTE QUE CE QUI SE FAIT. Un module « Audio » ou
     « Échelle » ne s'affiche jamais comme une tâche chez le patient
     (src/lib/typesDeModules.ts) : compté, il restait « non fait » pour
     toujours, et l'assiduité baissait jusqu'à signaler un décrochage. */
  const taches = mods.filter((m) => seFaitParLePatient(m.kind))

  /* CHAQUE JOUR SE COCHE (0051). Un exercice se refait chaque jour : la case
     dit « fait aujourd'hui », la semaine dit combien de jours. Sans les
     jours — leur lecture a échoué, et l'écran le dit —, la case se déduit
     de `done_at`, que la base tient à l'instant du dernier jour fait : c'est
     la même réponse, par un autre chemin. */
  const faitAujourdhui = (m: ModuleRow): boolean =>
    joursFaits
      ? (joursFaits.get(m.id) ?? []).includes(aujourdhui)
      : m.done_at !== null && jourDeParis(m.done_at) === aujourdhui
  const semaine = (m: ModuleRow) =>
    joursFaits ? septJours(joursFaits.get(m.id) ?? [], jourDeParis(m.created_at), aujourdhui) : undefined
  /* L'ASSIDUITÉ EST LA PART DES JOURS FAITS SUR LES SEPT DERNIERS. Sans les
     jours, on retombe sur le seul chiffre que la base sait encore donner :
     la part des tâches faites au moins une fois. */
  const adherence = joursFaits
    ? assiduite(taches.map((m) => semaine(m) ?? { faits: 0, possibles: 0 }))
    : taches.length
      ? Math.round((taches.filter((m) => m.done_at).length / taches.length) * 100)
      : 0

  const auds = audios.filter((a) => a.patient_id === p.id)
  /* L'ÉCHELLE SE LIT DANS LE TEMPS. `scale_delta` n'a jamais été écrit par
     aucun code : l'écart se déduit des notes, ici, à chaque chargement — une
     phrase stockée vieillirait dès la note suivante. */
  const notes = echelles
    .filter((e) => e.patient_id === p.id)
    .map((e) => ({ valeur: e.value, le: e.recorded_at }))
  const mesures = mesuresDatees(notes)

  return {
    name: p.display_name,
    initials: p.initials,
    /* Une fiche neuve n'a encore ni programme ni échelle. Les écrans le
       disent plutôt que d'afficher un vide : c'est un état normal, pas une
       donnée manquante. */
    program: p.program,
    subtitle: p.subtitle || sousTitre(p),
    weekLabel: p.week_label || libelleSemaine(p),
    nextSession: p.next_session ?? 'Aucune séance planifiée',
    adherence,
    listens: auds.reduce((n, a) => n + a.listens, 0),
    sessions: p.sessions_done,
    totalSessions: p.sessions_total,
    scaleLabel: p.scale_label || 'Auto-évaluation',
    scaleQuestion: p.scale_question,
    scaleDelta: ecartEchelle(notes),
    scale: mesures.map((m) => m.valeur),
    mesures,
    hypnoseActivee: Boolean(p.hypnose_activee),
    dernierBrouillon: brouillon,
    hypnoses: hypnoses
      .filter((h) => h.patient_id === p.id)
      .map((h) => ({
        id: h.id,
        titre: h.titre,
        intention: h.intention ?? '',
        complete: h.complete,
        createdAt: h.created_at,
        mouvements: mouvements
          .filter((m) => m.hypnose_id === h.id)
          .sort((a, b) => a.rang - b.rang)
          .map((m) => ({ mouvement: m.mouvement, titre: m.titre, texte: m.texte })),
      })),
    profile: profil
      ? {
          updated: `Établi après ${profil.sessions_count} ${profil.sessions_count > 1 ? 'séances' : 'séance'}`,
          portrait: profil.portrait,
          axes: profil.axes ?? [],
          levers: profil.levers ?? [],
          dynamique: profil.dynamique ?? undefined,
          alliance: profil.alliance ?? undefined,
          care: profil.care ?? [],
          resume: profil.resume ?? undefined,
          /* De la plus ancienne à la plus récente : une courbe se lit dans le
             sens du temps, et la base les rend dans l'autre. */
          historique: versions
            .filter((v) => v.patient_id === profil.patient_id)
            .map((v) => ({ version: v.version, sessions: v.sessions_count, axes: v.axes ?? [] }))
            .sort((a, b) => a.version - b.version),
        }
      : PROFIL_VIDE,
    modules: mods.map<PatientModule>((m) => ({
      title: m.title,
      meta: m.meta,
      kind: m.kind,
      done: faitAujourdhui(m),
      // Un audio, une échelle ne se font pas « un jour sur sept » : rien à compter.
      septJours: seFaitParLePatient(m.kind) ? semaine(m) : undefined,
      note: m.patient_note ?? undefined,
      id: m.id,
      consigne: m.consigne ?? undefined,
    })),
    /* Un retiré ne se fait plus : « Fait » y dit qu'il l'a été, un jour. */
    modulesRetires: retires.map<PatientModule>((m) => ({
      title: m.title,
      meta: m.meta,
      kind: m.kind,
      done: Boolean(m.done_at),
      note: m.patient_note ?? undefined,
      id: m.id,
      consigne: m.consigne ?? undefined,
      retireLe: m.archived_at
        ? new Date(m.archived_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
        : undefined,
    })),
    /* L'accès à son espace, enfin lisible depuis la fiche : `auth_user_id`
       était chargé à chaque rechargement et jamais montré. On n'en garde que
       le fait — l'identifiant du compte n'a rien à faire dans l'état. */
    email: p.email ?? '',
    compteActif: Boolean(p.auth_user_id),
    audios: auds.map<PatientAudio>((a) => ({
      title: a.audio?.title ?? 'Enregistrement',
      meta: a.listens > 0 ? `Écouté ${a.listens} fois` : 'Jamais écouté',
      duration: duree(a.audio?.duration_seconds ?? 0),
      id: a.id,
      audioId: a.audio_id,
    })),
    journal: journal
      .filter((j) => j.patient_id === p.id)
      .sort((a, b) => b.written_at.localeCompare(a.written_at))
      .map<JournalEntry>((j) => ({
        date: new Date(j.written_at).toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
        }),
        trigger: j.trigger_label ?? j.title,
        text: j.body,
      })),
  }
}

/** Ce qu'une captation a produit, à conserver avec la séance. */
export interface Brouillon {
  transcript: string
  notes: string
  dureeSecondes: number
  draft: SessionDraft
}

/** Ce que la captation a déjà pris, enregistré au fil de la séance. */
export type Captation = Omit<Brouillon, 'draft'>

/**
 * Une séance ouverte et jamais envoyée : consentement signé, puis la page
 * s'est fermée, ou la thérapeute est passée à autre chose.
 */
export interface SeanceOuverte extends Captation {
  id: string
  /** Horodatage de la signature du consentement. */
  ouverteLe: string
  /** Le brouillon, s'il avait déjà été rédigé. */
  draft: SessionDraft | null
}

/** Ce qui part au dossier à la validation du brouillon. */
export interface Envoi {
  modules: PatientModule[]
  /** Audios de la bibliothèque du cabinet, par identifiant en base. */
  audioIds: string[]
  /**
   * Le brouillon TEL QU'IL EST À L'ÉCRAN au moment de l'envoi.
   *
   * `enregistrerBrouillon` écrit la sortie brute de l'IA dès la génération, et
   * rien ne réécrivait après : les corrections de la thérapeute sur la
   * synthèse de séance et sur le message au patient — les deux textes qu'elle
   * relit vraiment — restaient dans l'état React et mouraient avec l'onglet.
   * Le dossier gardait la version de l'IA, et c'est elle que la génération
   * d'hypnose relisait ensuite comme « les mots de la séance ».
   */
  draft: SessionDraft | null
}

/** Ce qui se règle depuis la fiche, une fois le patient reçue. */
export interface ReglagesFiche {
  /** « Programme Liberté », ou vide. */
  programme: string
  seances: number
  /** Ce qu'elle s'auto-évalue le soir : le titre de la courbe. */
  echelle: string
  question: string
  prochaine: string
}

/** Un profil actualisé par l'analyse, tel que le serveur le rend. */
export interface ProfilGenere {
  portrait: string
  axes: ProfileAxis[]
  levers: ProfileLever[]
  dynamique?: string
  alliance?: string
  care: string[]
  resume: string
}

/** Ce qu'une praticienne règle de sa propre marque. L'identifiant n'en est
 *  pas : il donne l'adresse publique du cabinet, et se change chez le
 *  revendeur. */
export interface MarqueCabinet {
  nom: string
  surTitre: string
  branding: CabinetBranding
}

/** Une fiche close, telle qu'on la retrouve pour la rouvrir. */
export interface FicheClose {
  id: PatientId
  nom: string
  initiales: string
  closeLe: string
}

export interface CabinetData {
  /** Vrai quand les fiches viennent de la base. */
  reel: boolean
  /** Les suivis clos : hors du compte des fiches actives, et récupérables. */
  archivees: FicheClose[]
  chargement: boolean
  erreur: string
  /**
   * Ce qui n'a pas pu être lu, quand le dossier s'affiche quand même.
   *
   * Vide : tout est là. Sinon, la phrase nomme les parties manquantes — un
   * écran qui montre l'absence d'une chose non lue ment sans le savoir.
   */
  incomplet: string
  recharger: () => Promise<void>
  creerPatiente: (input: NouvellePatiente) => Promise<Resultat>
  /** Clôt un suivi : la fiche sort des actives, le dossier reste. */
  archiverPatiente: (patientId: PatientId) => Promise<Resultat>
  /** Rouvre un suivi clos, si l'offre a encore une place. */
  rouvrirPatiente: (patientId: PatientId) => Promise<Resultat>
  /** Coche ou décoche un module du parcours, désigné par son identifiant. */
  basculerModule: (moduleId: string, fait: boolean) => Promise<Resultat>
  /** Retire un module du parcours : le patient ne le voit plus, le dossier le garde. */
  retirerModule: (moduleId: string) => Promise<Resultat>
  /** Remet au parcours un module retiré, à sa place d'origine. */
  remettreModule: (moduleId: string) => Promise<Resultat>
  /** Renomme un module et remplace sa consigne, en une seule écriture. */
  majModule: (moduleId: string, input: { titre: string; consigne: Consigne }) => Promise<Resultat>
  /** Règle la fiche : programme, échelle, question du soir, prochaine séance. */
  majFiche: (patientId: PatientId, input: ReglagesFiche) => Promise<Resultat>
  /**
   * Change l'adresse de la fiche. Si son compte y était rattaché, il est
   * détaché dans la même écriture — l'écran l'annonce avant, jamais après.
   */
  changerAdresse: (patientId: PatientId, email: string) => Promise<Resultat & { detache?: boolean }>
  /** Envoie (ou renvoie) le lien qui ouvre son espace, à l'adresse de la fiche. */
  envoyerLienAcces: (email: string) => Promise<Resultat>
  /** Publie la marque du cabinet : nom affiché, sur-titre, initiales, couleurs. */
  enregistrerMarque: (input: MarqueCabinet) => Promise<Resultat>
  /** Dépose une image dans le compartiment public et rend son adresse. */
  televerserLogo: (file: File) => Promise<Resultat & { url?: string }>
  /* Les programmes du cabinet : c'est lui qui les nomme, pas le produit. */
  creerProgramme: (label: string) => Promise<Resultat>
  renommerProgramme: (ancien: string, nouveau: string) => Promise<Resultat>
  /** Fixe qui suit ce programme : la liste remplace l'ancienne. */
  attribuerProgramme: (label: string, patientIds: PatientId[]) => Promise<Resultat>
  retirerProgramme: (label: string) => Promise<Resultat>
  /* La bibliothèque audio ------------------------------------------- *
   * Les fichiers vont dans un compartiment privé, rangé par cabinet ; la
   * base n'en garde que le chemin. Une écoute passe par une URL signée,
   * courte, obtenue sous les droits de qui écoute.                       */
  importerAudio: (file: File, categorie: string) => Promise<Resultat & { id?: string }>
  envoyerAudio: (audioId: string, patientIds: PatientId[]) => Promise<Resultat>
  creerCategorie: (label: string) => Promise<Resultat>
  renommerAudio: (audioId: string, title: string) => Promise<Resultat>
  recategoriserAudio: (audioId: string, categorie: string) => Promise<Resultat>
  urlEcoute: (audioId: string) => Promise<string | null>
  /** Retire un audio du compte d'un patient (la ligne d'envoi, pas le fichier). */
  retirerAudioPatient: (envoiId: string) => Promise<Resultat>
  /** Supprime un audio de la bibliothèque : sa ligne, puis son fichier. */
  supprimerAudio: (audioId: string) => Promise<Resultat>
  /* L'atelier, les affirmations, les notifications --------------------- */
  /** Le module rejoint la bibliothèque du cabinet et le parcours des patients choisies. */
  assignerModule: (module: CustomModule, patientIds: PatientId[]) => Promise<Resultat>
  /** Remplace les affirmations visibles par le patient. */
  publierAffirmations: (patientId: PatientId, textes: string[]) => Promise<Resultat>
  reglerAffirmationsAuto: (patientId: PatientId, auto: boolean) => Promise<Resultat>
  /** Enregistre une notification et ses destinataires. L'envoi réel attend un service de push. */
  envoyerNotification: (
    input: { title: string; body: string; when: string; quand: Date | null },
    patientIds: PatientId[],
  ) => Promise<Resultat>
  /** Réécrit ou reprogramme un mot pas encore parti. La base refuse après l'heure (0047). */
  modifierNotification: (
    pushId: string,
    input: { title: string; body: string; when: string; quand: Date },
  ) => Promise<Resultat>
  /** Annule un mot pas encore parti : il n'arrivera nulle part. */
  annulerNotification: (pushId: string) => Promise<Resultat>
  /* La séance ------------------------------------------------------ *
   * Elle s'ouvre à la signature du consentement — c'est la pièce qui
   * autorise la captation, elle est horodatée et conservée. Le brouillon
   * la complète, l'envoi la clôt et verse au dossier ce qui a été retenu. */
  ouvrirSeance: (patientId: PatientId) => Promise<Resultat & { id?: string }>
  /** La dernière séance ouverte et jamais envoyée de cette fiche, à reprendre. */
  seanceOuverte: (patientId: PatientId) => Promise<SeanceOuverte | null>
  /** Enregistre ce que la captation a pris, sans attendre le brouillon. */
  sauverCaptation: (sessionId: string, input: Captation) => Promise<Resultat>
  /** Retire le consentement : la base efface tout ce qui a été pris. */
  retirerConsentement: (sessionId: string) => Promise<Resultat>
  enregistrerBrouillon: (sessionId: string, input: Brouillon) => Promise<Resultat>
  /** Réécrit le seul brouillon, à la sortie d'un champ relu. */
  majBrouillon: (sessionId: string, draft: SessionDraft) => Promise<Resultat>
  /** Rend aussi les modules créés : leurs consignes s'écrivent juste après. */
  envoyerSeance: (
    sessionId: string,
    patientId: PatientId,
    input: Envoi,
  ) => Promise<Resultat & { modules?: ModuleCree[] }>
  /** Remplace la consigne d'un module du parcours. */
  majConsigne: (moduleId: string, consigne: ConsigneModule | null) => Promise<Resultat>
  enregistrerProfil: (patientId: PatientId, sessionId: string | null, profil: ProfilGenere) => Promise<Resultat>
  /** Ouvre ou ferme l'hypnose pour un patient. */
  reglerHypnose: (patientId: PatientId, active: boolean) => Promise<Resultat>
  /** Ouvre une hypnose vide et rend son identifiant. */
  creerHypnose: (patientId: PatientId, sessionId: string | null, intention: string) => Promise<string | null>
  /** Ajoute un mouvement à une hypnose en cours d'écriture. */
  ajouterMouvement: (hypnoseId: string, m: HypnoseMouvement, rang: number) => Promise<Resultat>
  /** Referme l'hypnose : les quatre mouvements sont là. */
  acheverHypnose: (hypnoseId: string, titre: string) => Promise<Resultat>
  /** Supprime une fiche et tout ce qu'elle porte. Irréversible. */
  supprimerPatiente: (patientId: PatientId) => Promise<Resultat>
  /** Supprime une hypnose et ses mouvements. */
  supprimerHypnose: (hypnoseId: string) => Promise<Resultat>
}

export function useCabinet(cabinetId: string | null): CabinetData {
  const { state, set } = useStore()
  const [chargement, setChargement] = useState(Boolean(cabinetId))
  const [erreur, setErreur] = useState('')
  /* Le dossier tient, mais il lui manque quelque chose — et l'écran doit le
     dire plutôt que de présenter un trou comme une absence. */
  const [incomplet, setIncomplet] = useState('')
  /* Les suivis clos ne rejoignent pas l'état des fiches : ils n'ont ni
     parcours, ni journal, ni profil à afficher. Une liste de noms suffit à
     les retrouver, et c'est tout ce qu'on charge. */
  const [archivees, setArchivees] = useState<FicheClose[]>([])
  const reel = state.patientsReels

  const recharger = useCallback(async () => {
    const db = supabase()
    if (!db || !cabinetId) {
      setChargement(false)
      return
    }
    setErreur('')
    setChargement(true)
    /* Le jour de Paris où le dossier est lu : c'est celui des cases, et la
       fin de la semaine que l'assiduité regarde. */
    const aujourdhui = jourDeParis()

    const [fiches, closes, modules, audios, echelles, journal, profils, categories, progs, rdv, bibliotheque, ateliers, affs, reglages, pushes, hypnoses, mouvements, brouillons, quiz, telephones, joursFaits] = await Promise.all([
      db.from('patients').select('*').is('archived_at', null).order('created_at'),
      db
        .from('patients')
        .select('id, display_name, initials, archived_at')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false }),
      // Les retirés aussi : `assembler` les range à part, pour les remettre.
      db.from('patient_modules').select('id, patient_id, title, meta, kind, position, done_at, patient_note, consigne, archived_at, created_at'),
      // `last_listened_at` était chargé à chaque rechargement et lu nulle part.
      // `id` et `audio_id` : de quoi retirer l'envoi, et écouter l'audio.
      db.from('patient_audios').select('id, patient_id, audio_id, listens, audio:audio_library (title, duration_seconds)'),
      db.from('scale_entries').select('patient_id, value, recorded_at'),
      db.from('journal_pages').select('patient_id, title, body, trigger_label, written_at'),
      db.from('psych_profiles').select('patient_id, version, sessions_count, portrait, axes, levers, dynamique, alliance, care, resume').order('version', { ascending: false }),
      db.from('audio_categories').select('id, label, position').order('position').order('label'),
      db.from('cabinet_programs').select('label, position').is('archived_at', null).order('position').order('label'),
      db.from('cabinet_settings').select('booking_url, booking_mode, booking_widget_url').eq('cabinet_id', cabinetId).maybeSingle(),
      db.from('audio_library').select('id, category_id, title, meta, duration_seconds, storage_path, created_at').order('created_at', { ascending: false }),
      db.from('custom_modules').select('id, title, kind, duree, quand, steps, pourquoi, quiz').order('created_at'),
      db.from('affirmations').select('patient_id, text, position, published_at').order('position'),
      db.from('patient_settings').select('patient_id, affirmations_auto'),
      db
        .from('push_notifications')
        .select('id, title, body, scheduled_for, scheduled_at, created_at, recipients:push_recipients (push_status, patient:patients (display_name))')
        .order('created_at', { ascending: false })
        .limit(30),
      db
        .from('hypnoses')
        .select('id, patient_id, titre, intention, complete, created_at')
        .order('created_at', { ascending: false }),
      db.from('hypnose_mouvements').select('hypnose_id, mouvement, rang, titre, texte').order('rang'),
      // Le dernier brouillon de chaque patient : il porte les formulations
      // et la synthèse d'où une hypnose se bâtit. Sans lui, une hypnose
      // relancée depuis la fiche n'aurait que le dossier — et perdrait les
      // mots de la séance, qui en sont la matière la plus précieuse.
      db
        .from('therapy_sessions')
        .select('patient_id, draft, created_at')
        .not('draft', 'is', null)
        .order('created_at', { ascending: false }),
      /* Les réponses au quiz de compréhension. La table existait, la
         politique l'autorisait, le patient n'avait aucun écran pour y
         répondre — et le badge « Quiz 3 / 4 » de la fiche se nourrissait des
         clics de la thérapeute dans l'aperçu de démonstration. */
      db.from('module_quiz_answers').select('module_id, question_index, answer_index'),
      /* Qui recevra un rappel sur son téléphone, et qui devra ouvrir son
         espace pour le lire. Le nombre seulement : une adresse d'envoi
         permet d'écrire sur un écran verrouillé, elle ne quitte pas la base. */
      db.rpc('cabinet_appareils', { p_cabinet: cabinetId }),
      /* Les jours faits de la semaine (0051) : huit jours, parce que la
         semaine finit hier tant qu'un exercice n'est pas fait aujourd'hui
         (src/lib/assiduite.ts). Regroupés par exercice en base : ligne à
         ligne, l'API s'arrêterait à mille et tronquerait la semaine. */
      db.rpc('jours_faits_depuis', { p_depuis: decalerJour(aujourdhui, -JOURS_SUIVIS) }),
    ])

    /* CE QUI N'A PAS ÉTÉ LU N'EST PAS VIDE.
       Le garde ne regardait que huit des dix-huit requêtes. Les dix autres
       pouvaient échouer sans un mot, et l'écran présentait alors leur absence
       comme un fait : « Rien n'est visible côté patient » quand les
       affirmations n'avaient pas été lues, aucune hypnose sur une fiche qui en
       porte trois, la case du lundi décochée, la liste des programmes vide.
       Une thérapeute ne peut pas distinguer « il n'y en a pas » de « je n'ai
       pas pu le lire », et republierait par-dessus.

       Deux gravités, parce qu'elles n'appellent pas le même geste. Sans les
       fiches, leurs modules ou leur journal, il n'y a pas de dossier : on
       refuse d'en montrer un. Sans les affirmations ou les hypnoses, le
       dossier tient — mais il est troué, et on le dit en nommant les trous. */
    const VITALES: Array<[string, { error: unknown }]> = [
      ['les fiches', fiches],
      ['les exercices', modules],
      ['les audios', audios],
      ["l'auto-évaluation", echelles],
      ['le journal', journal],
      ['les profils', profils],
    ]
    const SECONDAIRES: Array<[string, { error: unknown }]> = [
      ['les suivis clos', closes],
      ['les rayons de la bibliothèque', categories],
      ['la bibliothèque', bibliotheque],
      ['les programmes', progs],
      ['la prise de rendez-vous', rdv],
      ["l'atelier", ateliers],
      ['les affirmations', affs],
      ['les réglages des fiches', reglages],
      ['les notifications', pushes],
      ['les hypnoses', hypnoses],
      ['les mouvements des hypnoses', mouvements],
      ['les brouillons de séance', brouillons],
      ['les réponses aux quiz', quiz],
      ['les téléphones inscrits aux rappels', telephones],
      ['les jours faits des exercices', joursFaits],
    ]

    if (VITALES.some(([, r]) => r.error)) {
      setErreur("Le dossier du cabinet n'a pas pu être chargé. Réessayez dans un instant.")
      setIncomplet('')
      setChargement(false)
      return
    }
    const manquants = SECONDAIRES.filter(([, r]) => r.error).map(([quoi]) => quoi)
    setIncomplet(
      manquants.length
        ? `Une partie du dossier n'a pas pu être lue : ${manquants.join(', ')}. Ce qui manque à l'écran n'est pas vide — il n'a pas été chargé. Revenez sur l'onglet dans un instant pour le relire.`
        : '',
    )

    setArchivees(
      ((closes.data ?? []) as Array<{ id: string; display_name: string; initials: string; archived_at: string }>).map(
        (f) => ({ id: f.id, nom: f.display_name, initiales: f.initials, closeLe: f.archived_at }),
      ),
    )

    const lignes = (fiches.data ?? []) as PatientRow[]
    // Un seul brouillon par patient : le plus récent, l'ordre étant décroissant.
    const dernierBrouillon = new Map<string, SessionDraft>()
    for (const b of (brouillons.data ?? []) as BrouillonRow[]) {
      if (b.draft && !dernierBrouillon.has(b.patient_id)) dernierBrouillon.set(b.patient_id, b.draft)
    }

    // Une seule version par patient : la plus récente, l'ordre étant décroissant.
    const dernierProfil = new Map<string, ProfileRow>()
    for (const pr of (profils.data ?? []) as ProfileRow[]) {
      if (!dernierProfil.has(pr.patient_id)) dernierProfil.set(pr.patient_id, pr)
    }
    /* Toutes les versions, elles, servent aux courbes de tendance : elles
       étaient déjà chargées et jetées à chaque rechargement. */
    const toutesVersions = (profils.data ?? []) as ProfileRow[]

    /* Les jours faits, par module. `null` — et non une carte vide — quand la
       lecture a échoué : « aucun jour fait » et « jours non lus » ne disent
       pas la même chose, et l'assemblage ne les traite pas pareil. */
    const parModule: Map<string, string[]> | null = joursFaits.error
      ? null
      : new Map(((joursFaits.data ?? []) as JoursFaitsRow[]).map((j) => [j.module_id, j.jours ?? []]))

    const assemblees: Record<PatientId, Patient> = {}
    for (const ligne of lignes) {
      assemblees[ligne.id] = assembler(
        ligne,
        (modules.data ?? []) as ModuleRow[],
        (audios.data ?? []) as unknown as AudioRow[],
        (echelles.data ?? []) as ScaleRow[],
        (journal.data ?? []) as JournalRow[],
        dernierProfil.get(ligne.id),
        toutesVersions,
        (hypnoses.data ?? []) as HypnoseRow[],
        (mouvements.data ?? []) as MouvementRow[],
        dernierBrouillon.get(ligne.id),
        parModule,
        aujourdhui,
      )
    }

    // La bibliothèque du cabinet, à la forme que l'écran des audios attend.
    const cats = (categories.data ?? []) as CategoryRow[]
    const libelle = new Map(cats.map((c) => [c.id, c.label]))
    const lib = ((bibliotheque.data ?? []) as LibraryRow[]).map<LibraryAudio>((a) => ({
      id: a.id,
      title: a.title,
      cat: (a.category_id && libelle.get(a.category_id)) || 'Sans catégorie',
      duration: duree(a.duration_seconds),
      meta: a.meta ?? '',
    }))
    const catLabels = cats.map((c) => c.label)

    // Les programmes du cabinet. Un cabinet neuf n'en a aucun : l'écran de la
    // fiche le dit et propose d'en créer un, plutôt que d'en inventer quatre.
    const programmes = ((progs.data ?? []) as Array<{ label: string }>).map((r) => r.label)

    // La prise de rendez-vous, pour que l'aperçu du téléphone montre ce que
    // le patient verra vraiment — et rien quand rien n'est réglé.
    const r = (rdv.data ?? null) as {
      booking_url?: string | null
      booking_mode?: string | null
      booking_widget_url?: string | null
    } | null
    const booking: Reservation | null = r?.booking_url
      ? {
          url: r.booking_url,
          mode: r.booking_mode === 'widget' ? 'widget' : 'bouton',
          widgetUrl: r.booking_widget_url ?? null,
        }
      : null

    // L'atelier : les modules du cabinet, rangés par type.
    const customs: Record<string, CustomModule[]> = {}
    for (const m of (ateliers.data ?? []) as CustomModuleRow[]) {
      const entree: CustomModule = {
        titre: m.title,
        duree: m.duree,
        quand: m.quand,
        steps: m.steps ?? [],
        pourquoi: m.pourquoi ?? '',
        quiz: m.quiz ?? [],
        type: m.kind,
      }
      customs[m.kind] = (customs[m.kind] ?? []).concat([entree])
    }

    // Les affirmations publiées, par patient ; et le réglage du lundi.
    const affirmations: Record<PatientId, string[]> = {}
    for (const a of (affs.data ?? []) as AffirmationRow[]) {
      if (!a.published_at) continue
      affirmations[a.patient_id] = (affirmations[a.patient_id] ?? []).concat([a.text])
    }
    const affAuto: Record<PatientId, boolean> = {}
    for (const r of (reglages.data ?? []) as SettingsRow[]) affAuto[r.patient_id] = r.affirmations_auto

    /** Les réponses du patient, par module et par question. */
    const quizReponses: Record<string, number> = {}
    for (const r of (quiz.data ?? []) as QuizRow[]) {
      quizReponses[`${r.module_id}:${r.question_index}`] = r.answer_index
    }

    // Le journal des envois.
    const envois = ((pushes.data ?? []) as unknown as PushRow[]).map<PushRecord>((n) => ({
      id: n.id,
      title: n.title,
      message: n.body,
      when: n.scheduled_for,
      prevu: n.scheduled_at,
      names: n.recipients.map((r) => r.patient?.display_name ?? '').filter(Boolean),
      stamp: new Date(n.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      /* Programmée et pas encore due : depuis 0036, l'espace patient ne la
         voit pas avant l'heure. Le journal doit donc le dire aussi, sans quoi
         la thérapeute lirait « envoyé » d'un mot qui attend encore. */
      telephone: bilanTelephone(n.recipients.map((r) => r.push_status)),
      attend:
        n.scheduled_at && new Date(n.scheduled_at) > new Date()
          ? new Date(n.scheduled_at).toLocaleString('fr-FR', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })
          : null,
    }))

    const ordre = lignes.map((l) => l.id)
    set((prev) => ({
      customs,
      affs: affirmations,
      affAuto,
      quizReponses,
      pushes: envois,
      appareils: Object.fromEntries(
        ((telephones.data ?? []) as Array<{ patient_id: string; appareils: number }>).map((t) => [
          t.patient_id,
          t.appareils,
        ]),
      ),
      patients: assemblees,
      patientOrder: ordre,
      patientsReels: true,
      cabinetId,
      // Garder le patient ouvert s'il existe encore ; sinon prendre le premier.
      sel: ordre.includes(prev.sel) ? prev.sel : (ordre[0] ?? ''),
      lib,
      cats: catLabels,
      programmes,
      booking,
      libSel: lib.some((a) => a.id === prev.libSel) ? prev.libSel : (lib[0]?.id ?? null),
      libFilter: catLabels.includes(prev.libFilter) ? prev.libFilter : 'Toutes',
      upCat: catLabels.includes(prev.upCat) ? prev.upCat : (catLabels[0] ?? ''),
    }))
    setChargement(false)
  }, [cabinetId, set])

  useEffect(() => {
    void recharger()
  }, [recharger])

  // L'autre côté écrit pendant que cet écran est ouvert : on relit au retour.
  useRetour(recharger)

  /**
   * Créer un patient, c'est écrire une fiche avec son adresse : c'est cette
   * adresse qui ouvrira son espace, au premier lien. Le lien part juste après
   * l'écriture ; sans adresse, il partira depuis « Réglages de la fiche »,
   * qui permet désormais de l'ajouter, de la corriger et de renvoyer le lien.
   */
  const creerPatiente = useCallback(
    async (input: NouvellePatiente): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) {
        return { ok: false, message: 'Connectez-vous à votre cabinet pour ajouter un patient.' }
      }

      const nom = input.nom.trim()
      const email = normaliserAdresse(input.email)
      if (nom.length < 2) return { ok: false, message: 'Indiquez au moins un nom.' }
      /* Une adresse mal formée était écrite quand même : le serveur
         d'invitations la refusait ensuite, et la fiche gardait une adresse à
         laquelle rien ne partirait jamais. On la refuse avant d'écrire. */
      if (email && !adresseValide(email)) {
        return { ok: false, message: 'Cette adresse ne ressemble pas à une adresse électronique.' }
      }

      /* Les colonnes non renseignées restent vides plutôt que de recevoir une
         valeur que personne n'a choisie : « aucun programme » se lit dans la
         base, « Programme Liberté » posé d'office ne se relit plus. C'est
         `assembler` qui décide de ce que les écrans affichent en attendant. */
      const { error } = await db.from('patients').insert({
        cabinet_id: cabinetId,
        display_name: nom,
        initials: initialesDe(nom),
        email: email || null,
        program: '',
        subtitle: '',
        week_label: '',
        next_session: null,
        sessions_done: 0,
        sessions_total: 0,
        scale_label: '',
        scale_question: '',
        scale_delta: null,
      })

      if (error) {
        const doublon = error.code === '23505'
        /* Le plafond de fiches est tenu par un déclencheur, avec un message
           déjà écrit pour être lu (migration 0019). On le rend tel quel :
           « La fiche n'a pas pu être créée » ne dirait pas quoi faire. */
        const plafond = error.code === '23514' || /fiches actives/i.test(error.message)
        return {
          ok: false,
          message: doublon
            ? `Une fiche porte déjà l'adresse ${email}.`
            : plafond
              ? error.message
              : "La fiche n'a pas pu être créée. Réessayez.",
        }
      }

      /* Sa fiche existe ; on lui envoie le lien qui ouvre son espace. Le
         serveur dit s'il a envoyé quelque chose ; on jetait sa réponse et on
         ne gardait que sa phrase. « Votre serveur d'envoi n'a pas répondu »
         s'affichait donc dans le bandeau vert des réussites. */
      const envoi = email ? await demanderInvitation({ email, cabinetId, kind: 'patient' }) : null

      await recharger()
      /* La fiche est faite dans tous les cas : c'est la première chose à dire,
         sans quoi la phrase du courriel se lit comme si rien n'avait eu lieu.
         Et elle se dit au neutre : voir messageCreation. */
      const { message, partiel } = messageCreation(nom, email, envoi)
      return { ok: true, partiel, message }
    },
    [cabinetId, recharger],
  )

  /**
   * Cocher un module, DÉSIGNÉ PAR SON IDENTIFIANT.
   *
   * L'écran passait le rang du module dans la liste, et la base cherchait
   * `position = rang`. Les deux ne coïncidaient que par chance : dès qu'un
   * module sort du parcours (0045), les rangs glissent et la case cochée
   * était celle du voisin — et plusieurs modules à la même position
   * basculaient ensemble.
   *
   * POUR AUJOURD'HUI, PAR LA MÊME FONCTION QUE LE PATIENT (0051). La case
   * écrivait `done_at` directement : « fait » une fois pour toutes, et sans
   * jour. Elle coche désormais le jour de Paris, comme le patient, et la
   * base tient `done_at` au même endroit pour les deux.
   */
  const basculerModule = useCallback(
    async (moduleId: string, fait: boolean): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db.rpc('patient_set_module_done', { p_module: moduleId, p_done: fait })
      if (error) return { ok: false, message: "L'exercice n'a pas pu être mis à jour. Réessayez." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  /**
   * Retirer un module du parcours.
   *
   * RETIRER, PAS SUPPRIMER. Un exercice fait, commenté, dont le quiz a reçu
   * des réponses, fait partie du dossier : le supprimer emporterait en
   * cascade ce que le patient y a laissé. On le sort donc de son parcours
   * (`archived_at`) — la RLS de 0045 le lui cache, ses gestes le refusent — et
   * il reste à la thérapeute, qui peut le remettre.
   */
  const retirerModule = useCallback(
    async (moduleId: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db
        .from('patient_modules')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', moduleId)
        .is('archived_at', null)
      if (error) return { ok: false, message: "L'exercice n'a pas pu être retiré. Réessayez." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  /** Il reprend sa position : c'est là que la thérapeute l'avait mis. */
  const remettreModule = useCallback(
    async (moduleId: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db
        .from('patient_modules')
        .update({ archived_at: null })
        .eq('id', moduleId)
      if (error) return { ok: false, message: "L'exercice n'a pas pu être remis au parcours. Réessayez." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  /**
   * Le titre et la consigne, ensemble : c'est un seul geste à l'écran, et une
   * seule écriture en base — un titre renommé sur une consigne refusée
   * laisserait le patient devant un exercice à moitié corrigé.
   */
  const majModule = useCallback(
    async (moduleId: string, input: { titre: string; consigne: Consigne }): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const titre = input.titre.trim()
      if (!titre) return { ok: false, message: 'Un exercice a besoin d’un titre.' }
      const { error } = await db
        .from('patient_modules')
        .update({ title: titre, consigne: input.consigne })
        .eq('id', moduleId)
      if (error) return { ok: false, message: "L'exercice n'a pas pu être enregistré." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  const majFiche = useCallback(
    async (patientId: PatientId, input: ReglagesFiche): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db
        .from('patients')
        .update({
          program: input.programme,
          sessions_total: Math.max(0, Math.round(input.seances)),
          scale_label: input.echelle,
          scale_question: input.question,
          next_session: input.prochaine || null,
          // Les libellés dérivés se recalculent à la lecture.
          subtitle: '',
          week_label: '',
        })
        .eq('id', patientId)
      if (error) return { ok: false, message: "La fiche n'a pas pu être mise à jour." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  /**
   * Changer l'adresse d'une fiche.
   *
   * Un patient créé sans adresse ne pouvait jamais recevoir son accès, et une
   * adresse fausse ne se corrigeait pas : `majFiche` n'écrit pas `email`, et
   * aucun écran ne la montrait.
   *
   * L'écriture passe par `cabinet_changer_adresse` (0045) plutôt que par un
   * UPDATE : quand un compte est déjà rattaché, changer l'adresse sans le
   * détacher laisserait l'espace à l'ancienne adresse — le lien envoyé à la
   * nouvelle ouvrirait un compte neuf, sans fiche, sur un espace vide. La
   * fonction détache donc le compte dans la même écriture, et le dit ; la
   * base refuse tout autre chemin (déclencheur de 0045). C'est l'écran qui
   * prévient AVANT : rien ne se détache en silence.
   */
  const changerAdresse = useCallback(
    async (patientId: PatientId, saisie: string): Promise<Resultat & { detache?: boolean }> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Connectez-vous à votre cabinet.' }
      const email = normaliserAdresse(saisie)
      if (email && !adresseValide(email)) {
        return { ok: false, message: 'Cette adresse ne ressemble pas à une adresse électronique.' }
      }
      const { data, error } = await db.rpc('cabinet_changer_adresse', {
        p_patient: patientId,
        p_email: email || null,
      })
      if (error) return { ok: false, message: refusAdresse(error, email) }
      const r = (data ?? {}) as { change?: boolean; detache?: boolean }
      await recharger()
      if (!r.change) return { ok: true, message: 'Cette adresse est déjà celle de la fiche.' }
      return {
        ok: true,
        detache: Boolean(r.detache),
        message: !email
          ? "Adresse retirée. Son espace ne s'ouvrira qu'avec une nouvelle adresse."
          : r.detache
            ? `Adresse changée pour ${email}, et l'ancien compte détaché. Envoyez le lien d'accès : l'espace se rouvrira à la première connexion avec cette adresse.`
            : `Adresse enregistrée : ${email}. Envoyez le lien d'accès pour ouvrir son espace.`,
      }
    },
    [cabinetId, recharger],
  )

  /**
   * Envoyer — ou renvoyer — le lien d'accès.
   *
   * `demanderInvitation` n'était appelée qu'à la création : un courriel
   * perdu, arrivé en indésirables ou expiré ne se rattrapait plus. Le serveur
   * vérifie sous la RLS que l'adresse est bien celle d'une fiche du cabinet,
   * puis envoie ; sa réponse dit ce qui s'est passé, et c'est elle qu'on rend.
   */
  const envoyerLienAcces = useCallback(
    async (email: string): Promise<Resultat> => {
      if (!cabinetId) return { ok: false, message: 'Connectez-vous à votre cabinet.' }
      const adresse = normaliserAdresse(email)
      if (!adresse) return { ok: false, message: "La fiche n'a pas d'adresse : ajoutez-la d'abord." }
      const r = await demanderInvitation({ email: adresse, cabinetId, kind: 'patient' })
      return {
        ok: r.ok,
        message:
          r.message ||
          (r.ok
            ? `Lien d'accès envoyé à ${adresse}.`
            : "Le lien n'a pas pu être envoyé. Reconnectez-vous, puis réessayez."),
      }
    },
    [cabinetId],
  )

  /**
   * La marque du cabinet, publiée par la praticienne elle-même.
   *
   * La même ligne que règle le revendeur depuis son espace : la RLS autorise
   * les deux, chacun sur ses cabinets. L'identifiant et le rattachement au
   * revendeur ne bougent pas d'ici — le premier donne l'adresse publique, le
   * second est verrouillé en base par un déclencheur.
   *
   * Rien ne recharge le dossier : ce qui change est l'identité du cabinet,
   * lue par `my_context()`. C'est l'appelant qui la redemande.
   */
  const enregistrerMarque = useCallback(
    async (input: MarqueCabinet): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) {
        return { ok: false, message: 'Connectez-vous à votre cabinet pour publier votre marque.' }
      }
      const nom = input.nom.trim()
      if (nom.length < 2) return { ok: false, message: 'Le nom affiché doit compter au moins deux caractères.' }
      /* La base refuse aussi une couleur hors format (0048) ; le dire ici donne
         la raison au lieu d'un échec muet. */
      if (couleursInvalides(input.branding).length) {
        return { ok: false, message: 'Une couleur n’est pas au format #RRGGBB : corrigez-la avant de publier.' }
      }
      /* Le logo publié jusqu'ici, pour l'effacer du compartiment une fois le
         nouveau en place : un logo remplacé restait public pour toujours. */
      const { data: avant } = await db
        .from('cabinets')
        .select('branding')
        .eq('id', cabinetId)
        .maybeSingle<{ branding: CabinetBranding | null }>()
      const { error } = await db
        .from('cabinets')
        .update({ name: nom, tagline: input.surTitre.trim(), branding: input.branding })
        .eq('id', cabinetId)
      if (error) return { ok: false, message: "Votre marque n'a pas pu être publiée. Réessayez." }
      const ancien = avant?.branding?.logoUrl ?? null
      if (ancien && ancien !== (input.branding.logoUrl ?? null)) {
        void effacerDuStockage('logos', ancien, cabinetId)
      }
      return {
        ok: true,
        message: 'Marque publiée. Elle habille votre espace et l’application de vos patients.',
      }
    },
    [cabinetId],
  )

  /**
   * Déposer le logo du cabinet.
   *
   * Le compartiment est public : le logo doit s'afficher sur l'adresse du
   * cabinet, ouverte par quelqu'un qui n'est pas encore connecté. Une URL
   * signée demanderait une session, il n'y en a pas — et un logo est de toute
   * façon ce qu'un cabinet montre à tout le monde.
   *
   * Le fichier ne remplace pas le précédent : il prend un nom neuf. Une image
   * remplacée reste ainsi affichée jusqu'à la publication, et les navigateurs
   * qui gardaient l'ancienne en cache ne montrent pas la nouvelle à sa place.
   */
  const televerserLogo = useCallback(
    async (file: File): Promise<Resultat & { url?: string }> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Connectez-vous à votre cabinet.' }
      if (file.size > 1_000_000) {
        return { ok: false, message: 'Le fichier dépasse 1 Mo. Réduisez-le et réessayez.' }
      }
      const extension = (file.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
      const chemin = `${cabinetId}/${crypto.randomUUID()}.${extension}`
      const { error } = await db.storage.from('logos').upload(chemin, file, {
        contentType: file.type || 'image/png',
        upsert: false,
      })
      if (error) {
        return {
          ok: false,
          message: /mime|type/i.test(error.message)
            ? "Ce format n'est pas accepté : PNG, JPEG ou WebP."
            : "Le logo n'a pas pu être déposé. Réessayez.",
        }
      }
      const { data } = db.storage.from('logos').getPublicUrl(chemin)
      return { ok: true, message: 'Logo déposé. Publiez votre marque pour l’appliquer.', url: data.publicUrl }
    },
    [cabinetId],
  )

  /* ---- Les programmes du cabinet -------------------------------------- */

  /**
   * Nommer un programme. Le libellé est ce que la fiche d'un patient garde,
   * en clair : renommer un programme ne renomme donc pas celui des fiches
   * déjà réglées, et c'est voulu — on ne réécrit pas un dossier au passage.
   */
  const creerProgramme = useCallback(
    async (label: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Connectez-vous à votre cabinet.' }
      const propre = label.trim()
      if (!propre) return { ok: false, message: 'Donnez un nom au programme.' }
      const { error } = await db.from('cabinet_programs').insert({ cabinet_id: cabinetId, label: propre })
      if (error) {
        return {
          ok: false,
          message:
            error.code === '23505'
              ? `« ${propre} » existe déjà dans vos programmes.`
              : "Le programme n'a pas pu être créé. Réessayez.",
        }
      }
      await recharger()
      return { ok: true, message: `« ${propre} » ajouté à vos programmes.` }
    },
    [cabinetId, recharger],
  )

  /**
   * Renommer un programme.
   *
   * Le libellé est ce que la fiche d'un patient garde, en clair : renommer
   * le catalogue sans toucher aux fiches les laisserait rattachées à un
   * programme qui n'existe plus. Les deux écritures vont donc ensemble.
   */
  const renommerProgramme = useCallback(
    async (ancien: string, nouveau: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Connectez-vous à votre cabinet.' }
      const propre = nouveau.trim()
      if (!propre) return { ok: false, message: 'Donnez un nom au programme.' }
      if (propre === ancien) return { ok: true, message: '' }

      const { error } = await db
        .from('cabinet_programs')
        .update({ label: propre })
        .eq('cabinet_id', cabinetId)
        .eq('label', ancien)
        .is('archived_at', null)
      if (error) {
        return {
          ok: false,
          message:
            error.code === '23505'
              ? `« ${propre} » existe déjà dans vos programmes.`
              : "Le programme n'a pas pu être renommé. Réessayez.",
        }
      }
      // Les fiches suivent. Un échec ici laisse un catalogue renommé et des
      // fiches sur l'ancien nom : on le dit plutôt que de le taire.
      const { error: e2 } = await db
        .from('patients')
        .update({ program: propre })
        .eq('cabinet_id', cabinetId)
        .eq('program', ancien)
      await recharger()
      return e2
        ? { ok: false, message: `Programme renommé, mais les fiches sont restées sur « ${ancien} ».` }
        : { ok: true, message: `« ${ancien} » s'appelle désormais « ${propre} ».` }
    },
    [cabinetId, recharger],
  )

  /**
   * Rattacher des patients à un programme, et en détacher les autres.
   *
   * L'écran envoie la liste complète de celles qui doivent le suivre : celles
   * qui le suivaient et n'y sont plus repassent à « aucun programme ». Les
   * fiches rattachées à un AUTRE programme ne sont pas touchées.
   */
  const attribuerProgramme = useCallback(
    async (label: string, patientIds: PatientId[]): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Connectez-vous à votre cabinet.' }

      const { error: e1 } = patientIds.length
        ? await db.from('patients').update({ program: label }).in('id', patientIds)
        : { error: null }
      if (e1) return { ok: false, message: "Le rattachement n'a pas pu être enregistré." }

      // Détacher : celles qui portent ce programme sans figurer dans la liste.
      let detache = db.from('patients').update({ program: '' }).eq('cabinet_id', cabinetId).eq('program', label)
      if (patientIds.length) detache = detache.not('id', 'in', `(${patientIds.join(',')})`)
      const { error: e2 } = await detache
      await recharger()
      if (e2) return { ok: false, message: 'Les rattachements sont posés, mais les retraits ont échoué.' }
      return {
        ok: true,
        message: patientIds.length
          ? `${patientIds.length} ${patientIds.length > 1 ? 'patients suivent' : 'patient suit'} « ${label} ».`
          : `Plus personne ne suit « ${label} ».`,
      }
    },
    [cabinetId, recharger],
  )

  /**
   * Retirer un programme du catalogue. Archivé, pas supprimé : les fiches qui
   * le portent gardent leur libellé, et l'historique reste lisible.
   */
  const retirerProgramme = useCallback(
    async (label: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Connectez-vous à votre cabinet.' }
      const { error } = await db
        .from('cabinet_programs')
        .update({ archived_at: new Date().toISOString() })
        .eq('cabinet_id', cabinetId)
        .eq('label', label)
        .is('archived_at', null)
      if (error) return { ok: false, message: "Le programme n'a pas pu être retiré." }
      await recharger()
      return { ok: true, message: `« ${label} » retiré de vos programmes.` }
    },
    [cabinetId, recharger],
  )

  /* ---- La bibliothèque audio ------------------------------------------ */

  /** L'identifiant d'une catégorie par son libellé, créée si elle manque. */
  const categorieId = useCallback(
    async (label: string): Promise<string | null> => {
      const db = supabase()
      if (!db || !cabinetId) return null
      const propre = label.trim()
      if (!propre) return null
      const { data } = await db
        .from('audio_categories')
        .select('id')
        .eq('cabinet_id', cabinetId)
        .eq('label', propre)
        .maybeSingle<{ id: string }>()
      if (data) return data.id
      const { data: creee } = await db
        .from('audio_categories')
        .insert({ cabinet_id: cabinetId, label: propre })
        .select('id')
        .single<{ id: string }>()
      return creee?.id ?? null
    },
    [cabinetId],
  )

  const creerCategorie = useCallback(
    async (label: string): Promise<Resultat> => {
      const id = await categorieId(label)
      if (!id) return { ok: false, message: "La catégorie n'a pas pu être créée." }
      await recharger()
      return { ok: true, message: '' }
    },
    [categorieId, recharger],
  )

  /** La durée d'un fichier audio, lue dans ses métadonnées. 0 si illisible. */
  const dureeFichier = (file: File): Promise<number> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const element = new Audio(url)
      const fin = (n: number) => {
        URL.revokeObjectURL(url)
        resolve(n)
      }
      element.addEventListener('loadedmetadata', () =>
        fin(Number.isFinite(element.duration) && element.duration > 0 ? Math.round(element.duration) : 0),
      )
      element.addEventListener('error', () => fin(0))
    })

  const importerAudio = useCallback(
    async (file: File, categorie: string): Promise<Resultat & { id?: string }> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Connectez-vous à votre cabinet pour importer.' }
      const extension = (file.name.split('.').pop() ?? 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3'
      const chemin = `${cabinetId}/${crypto.randomUUID()}.${extension}`
      const secondes = await dureeFichier(file)

      const { error: e1 } = await db.storage.from('audios').upload(chemin, file, {
        contentType: file.type || 'audio/mpeg',
        upsert: false,
      })
      if (e1) {
        return {
          ok: false,
          message: /mime|type/i.test(e1.message)
            ? 'Ce format n’est pas accepté : MP3, M4A, AAC, WAV ou OGG.'
            : "Le fichier n'a pas pu être déposé. Réessayez.",
        }
      }
      const catId = await categorieId(categorie)
      const taille = Math.round(file.size / 100000) / 10
      const { data, error: e2 } = await db
        .from('audio_library')
        .insert({
          cabinet_id: cabinetId,
          category_id: catId,
          title: file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Sans titre',
          meta: `${taille} Mo · importé le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`,
          // La base exige une durée positive : un fichier illisible vaut une seconde.
          duration_seconds: Math.max(1, secondes),
          storage_path: chemin,
        })
        .select('id')
        .single<{ id: string }>()
      if (e2 || !data) {
        // Le fichier est monté mais la fiche a échoué : on ne laisse pas d'orphelin.
        await db.storage.from('audios').remove([chemin])
        return { ok: false, message: "L'audio n'a pas pu être catalogué. Réessayez." }
      }
      await recharger()
      return { ok: true, message: '', id: data.id }
    },
    [cabinetId, categorieId, recharger],
  )

  const envoyerAudio = useCallback(
    async (audioId: string, patientIds: PatientId[]): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId || !patientIds.length) return { ok: false, message: '' }
      const { error } = await db
        .from('patient_audios')
        .upsert(
          patientIds.map((patient_id) => ({ cabinet_id: cabinetId, patient_id, audio_id: audioId })),
          { onConflict: 'patient_id,audio_id', ignoreDuplicates: true },
        )
      if (error) return { ok: false, message: "L'audio n'a pas pu être envoyé." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  const renommerAudio = useCallback(
    async (audioId: string, title: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const propre = title.trim()
      if (!propre) return { ok: false, message: 'Un audio a besoin d’un titre.' }
      const { error } = await db.from('audio_library').update({ title: propre }).eq('id', audioId)
      if (error) return { ok: false, message: "Le titre n'a pas pu être enregistré." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  const recategoriserAudio = useCallback(
    async (audioId: string, categorie: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const catId = await categorieId(categorie)
      const { error } = await db.from('audio_library').update({ category_id: catId }).eq('id', audioId)
      if (error) return { ok: false, message: "La catégorie n'a pas pu être changée." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, categorieId, recharger],
  )

  /** Une URL signée d'une heure : la seule façon d'écouter un fichier privé. */
  const urlEcoute = useCallback(
    async (audioId: string): Promise<string | null> => {
      const db = supabase()
      if (!db) return null
      const { data: ligne } = await db
        .from('audio_library')
        .select('storage_path')
        .eq('id', audioId)
        .maybeSingle<{ storage_path: string }>()
      if (!ligne) return null
      const { data } = await db.storage.from('audios').createSignedUrl(ligne.storage_path, 3600)
      return data?.signedUrl ?? null
    },
    [],
  )

  /**
   * Retirer un audio du compte d'un patient.
   *
   * Seule la ligne d'envoi part : le fichier reste dans la bibliothèque, et
   * les autres patients qui l'ont le gardent. Un audio ACHETÉ dans la
   * boutique ne se retire pas — la base le refuse (0045), avec une phrase
   * écrite pour être lue, qu'on rend telle quelle.
   */
  const retirerAudioPatient = useCallback(
    async (envoiId: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db.from('patient_audios').delete().eq('id', envoiId)
      if (error) {
        return {
          ok: false,
          message: error.code === '23514' ? error.message : "L'audio n'a pas pu être retiré. Réessayez.",
        }
      }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  /**
   * Supprimer un audio de la bibliothèque : la ligne, PUIS le fichier.
   *
   * Dans cet ordre, parce que c'est la ligne qui porte les refus : un audio
   * en vente, ou acheté par un patient, ne se supprime pas (0045). Effacer
   * le fichier d'abord laisserait, sur un refus, une ligne qui pointe vers
   * rien — un audio qu'on ne peut plus écouter mais qui s'affiche encore.
   * Dans l'autre sens, l'échec du stockage ne laisse qu'un fichier que plus
   * rien ne désigne : de la place perdue, pas un audio cassé.
   *
   * Ce que la ligne emporte en cascade — les envois aux patients — l'écran
   * l'a dit avant de demander confirmation.
   */
  const supprimerAudio = useCallback(
    async (audioId: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { data: ligne } = await db
        .from('audio_library')
        .select('storage_path')
        .eq('id', audioId)
        .maybeSingle<{ storage_path: string }>()
      const { error } = await db.from('audio_library').delete().eq('id', audioId)
      if (error) {
        return {
          ok: false,
          message: error.code === '23514' ? error.message : "L'audio n'a pas pu être supprimé. Réessayez.",
        }
      }
      if (ligne?.storage_path) {
        const { error: eFichier } = await db.storage.from('audios').remove([ligne.storage_path])
        // Journal technique seulement : la raison du stockage, ni titre ni chemin.
        if (eFichier) console.warn('[audios] fichier non retiré du stockage', eFichier.message)
      }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  /* ---- L'atelier, les affirmations, les notifications ---------------- */

  const assignerModule = useCallback(
    async (module: CustomModule, patientIds: PatientId[]): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }

      // La bibliothèque du cabinet : un titre par type, mis à jour s'il existe.
      const { data: existant } = await db
        .from('custom_modules')
        .select('id')
        .eq('cabinet_id', cabinetId)
        .eq('kind', module.type)
        .eq('title', module.titre)
        .maybeSingle<{ id: string }>()
      const ligne = {
        cabinet_id: cabinetId,
        title: module.titre,
        kind: module.type,
        duree: module.duree,
        quand: module.quand,
        steps: module.steps,
        pourquoi: module.pourquoi || null,
        quiz: module.quiz,
      }
      const { error: e1 } = existant
        ? await db.from('custom_modules').update(ligne).eq('id', existant.id)
        : await db.from('custom_modules').insert(ligne)
      if (e1) return { ok: false, message: "Le module n'a pas pu être enregistré." }

      // Le parcours de chaque patient choisie, à la suite de l'existant.
      const consigne = {
        duree: module.duree,
        quand: module.quand,
        steps: module.steps,
        why: module.pourquoi,
        quiz: module.quiz,
      }
      for (const patientId of patientIds) {
        const { data: dernier } = await db
          .from('patient_modules')
          .select('position')
          .eq('patient_id', patientId)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle<{ position: number }>()
        const { error } = await db.from('patient_modules').insert({
          cabinet_id: cabinetId,
          patient_id: patientId,
          title: module.titre,
          meta: `${module.duree} · ${module.quand}`,
          kind: module.type,
          source: 'atelier',
          position: (dernier?.position ?? -1) + 1,
          consigne,
        })
        if (error) return { ok: false, message: "Le module n'a pas pu être ajouté au parcours." }
      }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  const publierAffirmations = useCallback(
    async (patientId: PatientId, textes: string[]): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      /* REMPLACER EN UNE FOIS. C'était un DELETE puis un INSERT : entre les
         deux, rien ne tenait. Une coupure, un onglet fermé, un refus sur la
         seconde requête, et la patiente se retrouvait sans AUCUNE affirmation
         pendant que l'écran annonçait « n'ont pas pu être publiées » — soit
         l'inverse de ce qui venait d'arriver. Le RPC fait les deux dans la
         même transaction (0033) ; il rogne et numérote côté base. */
      const { error } = await db.rpc('cabinet_publier_affirmations', {
        p_patient: patientId,
        p_textes: textes,
      })
      if (error) return { ok: false, message: "Les affirmations n'ont pas pu être publiées. Celles en place n'ont pas bougé." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  const reglerAffirmationsAuto = useCallback(
    async (patientId: PatientId, auto: boolean): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db
        .from('patient_settings')
        .upsert({ patient_id: patientId, cabinet_id: cabinetId, affirmations_auto: auto }, { onConflict: 'patient_id' })
      if (error) return { ok: false, message: "Le réglage n'a pas pu être enregistré." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  const envoyerNotification = useCallback(
    async (
      input: { title: string; body: string; when: string; quand: Date | null },
      patientIds: PatientId[],
    ): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId || !patientIds.length) return { ok: false, message: '' }
      const { data, error: e1 } = await db
        .from('push_notifications')
        .insert({
          cabinet_id: cabinetId,
          title: input.title,
          body: input.body,
          // Le libellé se lit, l'horodatage décide. « Ce soir, 20 h » se
          // comprend d'un coup d'œil ; un timestamp, non.
          scheduled_for: input.when,
          scheduled_at: input.quand ? input.quand.toISOString() : null,
        })
        .select('id')
        .single<{ id: string }>()
      if (e1 || !data) return { ok: false, message: "La notification n'a pas pu être enregistrée. Réessayez." }
      const { error: e2 } = await db
        .from('push_recipients')
        .insert(patientIds.map((patient_id) => ({ push_id: data.id, patient_id, cabinet_id: cabinetId })))
      if (e2) {
        /* La notification existe et n'a aucun destinataire : elle n'atteindra
           personne. On efface la ligne orpheline plutôt que de la laisser
           encombrer le journal des envois d'un mot que nul n'a reçu. */
        await db.from('push_notifications').delete().eq('id', data.id)
        return { ok: false, message: "Les destinataires n'ont pas pu être enregistrés. Rien n'est parti." }
      }
      await recharger()
      /* Le message vide était la moitié du défaut : l'écran ne disait rien du
         tout, ni en succès ni en échec, et l'on recliquait pour voir. */
      const combien = plural(patientIds.length, 'patient', 'patients')
      return {
        ok: true,
        message: input.quand && input.quand > new Date()
          ? `Programmée pour ${input.when} — ${combien}. Elle apparaîtra dans leur espace à ce moment-là, pas avant.`
          : `Envoyée à ${combien}.`,
      }
    },
    [cabinetId, recharger],
  )

  /* UN MOT PROGRAMMÉ SE REPREND TANT QU'IL N'EST PAS PARTI. Une faute de
     frappe, une heure mal choisie : il fallait attendre qu'il parte, puis
     s'excuser. La base garde la frontière (0047) — après l'heure, le texte
     est celui que le patient a pu lire, et il ne se réécrit plus — si bien
     qu'un clic à la dernière seconde reçoit un refus clair, pas un mot
     modifié après coup sur un téléphone. */
  const modifierNotification = useCallback(
    async (
      pushId: string,
      input: { title: string; body: string; when: string; quand: Date },
    ): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { data, error } = await db
        .from('push_notifications')
        .update({
          title: input.title,
          body: input.body,
          scheduled_for: input.when,
          scheduled_at: input.quand.toISOString(),
        })
        .eq('id', pushId)
        .select('id')
      await recharger()
      if (error) {
        return {
          ok: false,
          message: /déjà parti/.test(error.message)
            ? 'Ce mot est déjà parti : il ne peut plus être modifié.'
            : "Le mot n'a pas pu être modifié. Réessayez.",
        }
      }
      if (!data?.length) return { ok: false, message: "Ce mot n'existe plus." }
      return { ok: true, message: `Mot reprogrammé pour ${input.when}.` }
    },
    [cabinetId, recharger],
  )

  const annulerNotification = useCallback(
    async (pushId: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { data, error } = await db.from('push_notifications').delete().eq('id', pushId).select('id')
      await recharger()
      if (error) {
        return {
          ok: false,
          message: /déjà parti/.test(error.message)
            ? 'Ce mot est déjà parti : il ne peut plus être annulé.'
            : "Le mot n'a pas pu être annulé. Réessayez.",
        }
      }
      if (!data?.length) return { ok: false, message: "Ce mot n'existe plus." }
      return { ok: true, message: 'Mot annulé : il ne partira pas.' }
    },
    [cabinetId, recharger],
  )

  /* ---- La séance ----------------------------------------------------- */

  const ouvrirSeance = useCallback(
    async (patientId: PatientId): Promise<Resultat & { id?: string }> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { data, error } = await db
        .from('therapy_sessions')
        .insert({
          cabinet_id: cabinetId,
          patient_id: patientId,
          status: 'captation',
          consent_given_at: new Date().toISOString(),
        })
        .select('id')
        .single<{ id: string }>()
      if (error || !data) {
        return { ok: false, message: "Le consentement n'a pas pu être enregistré. Réessayez." }
      }
      return { ok: true, message: '', id: data.id }
    },
    [cabinetId],
  )

  /**
   * Le brouillon relu, écrit sans attendre l'envoi.
   *
   * `enregistrerBrouillon` pose la sortie brute de l'IA dès la génération.
   * Ensuite, la thérapeute corrige la synthèse et le message — les deux
   * textes qu'elle relit vraiment — et rien ne réécrivait : ses corrections
   * vivaient dans l'état React jusqu'à l'envoi, et disparaissaient avec
   * l'onglet fermé, le téléphone qui sonne, la séance suivante qui commence.
   * Cet enregistrement-là part à la sortie du champ.
   */
  const majBrouillon = useCallback(
    async (sessionId: string, draft: SessionDraft): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db.from('therapy_sessions').update({ draft }).eq('id', sessionId)
      if (error) return { ok: false, message: "Vos corrections n'ont pas pu être enregistrées." }
      return { ok: true, message: '' }
    },
    [cabinetId],
  )

  /**
   * La séance laissée en plan sur cette fiche, s'il y en a une.
   *
   * La captation vit en mémoire : un onglet fermé, une page rechargée, et
   * l'écran repartait de zéro — alors que la séance, elle, existait en base
   * depuis le consentement, avec ce qui avait déjà été enregistré. On la
   * retrouve ici pour la proposer à la reprise.
   *
   * Seulement dans le délai de la purge (sept jours, 0043) : au-delà, le
   * verbatim est effacé, et reprendre une séance vidée de sa matière
   * tromperait plus qu'elle n'aiderait.
   */
  const seanceOuverte = useCallback(
    async (patientId: PatientId): Promise<SeanceOuverte | null> => {
      const db = supabase()
      if (!db || !cabinetId) return null
      const depuis = new Date(Date.now() - DELAI_PURGE_JOURS * 86_400_000).toISOString()
      const { data, error } = await db
        .from('therapy_sessions')
        .select('id, consent_given_at, created_at, transcript, notes, duration_seconds, draft')
        .eq('patient_id', patientId)
        .is('sent_at', null)
        .is('consent_revoked_at', null)
        .gte('created_at', depuis)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<{
          id: string
          consent_given_at: string | null
          created_at: string
          transcript: string | null
          notes: string | null
          duration_seconds: number | null
          draft: SessionDraft | null
        }>()
      if (error || !data) return null
      // Une séance ouverte sur laquelle rien n'a été pris ne vaut pas reprise.
      if (!data.transcript && !data.notes && !data.draft) return null
      return {
        id: data.id,
        ouverteLe: data.consent_given_at ?? data.created_at,
        transcript: data.transcript ?? '',
        notes: data.notes ?? '',
        dureeSecondes: data.duration_seconds ?? 0,
        draft: data.draft,
      }
    },
    [cabinetId],
  )

  /**
   * Ce que la captation a pris, écrit pendant la séance.
   *
   * La transcription n'existait qu'en mémoire jusqu'à « Terminer » : une
   * heure de séance tenait à un onglet. La séance existe en base dès le
   * consentement ; on y dépose le texte au fil de l'eau. Jamais sur une
   * séance close ou dont le consentement est retiré : la base le refuserait
   * de toute façon (0043), le filtre évite d'essayer.
   */
  const sauverCaptation = useCallback(
    async (sessionId: string, input: Captation): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { data, error } = await db
        .from('therapy_sessions')
        .update({
          transcript: input.transcript || null,
          notes: input.notes || null,
          duration_seconds: Math.max(0, Math.round(input.dureeSecondes)),
        })
        .eq('id', sessionId)
        .is('sent_at', null)
        .is('consent_revoked_at', null)
        .select('id')
      if (error) return { ok: false, message: "La séance n'a pas pu être enregistrée." }
      if (!data?.length) {
        return { ok: false, message: "Cette séance est close : ce qui est à l'écran ne s'y enregistre plus." }
      }
      return { ok: true, message: '' }
    },
    [cabinetId],
  )

  /**
   * Le patient retire son consentement.
   *
   * La colonne attendait depuis 0002 et rien ne l'écrivait : l'écran disait
   * « révocable à tout moment » sans geste pour le faire. Poser la date
   * suffit — le déclencheur de 0043 efface la transcription, les notes et le
   * brouillon, et range la séance. Le consentement reste daté, avec son
   * retrait : c'est la trace de ce qui a été autorisé, puis retiré.
   */
  const retirerConsentement = useCallback(
    async (sessionId: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { data, error } = await db
        .from('therapy_sessions')
        .update({ consent_revoked_at: new Date().toISOString(), status: 'archive' })
        .eq('id', sessionId)
        .is('consent_revoked_at', null)
        .select('id')
      if (error || !data?.length) {
        return { ok: false, message: "Le retrait n'a pas pu être enregistré : rien n'a été effacé. Réessayez." }
      }
      return { ok: true, message: '' }
    },
    [cabinetId],
  )

  /**
   * Le brouillon rédigé, posé sur la séance.
   *
   * JAMAIS SUR UNE SÉANCE ENVOYÉE. « Reprendre » après l'envoi ramenait à la
   * captation, et la génération suivante réécrivait ici le verbatim et le
   * statut de brouillon d'une séance close. Le filtre refuse d'emblée ; la
   * garde de 0043 le refuse aussi en base, pour tout autre chemin.
   */
  const enregistrerBrouillon = useCallback(
    async (sessionId: string, input: Brouillon): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { data, error } = await db
        .from('therapy_sessions')
        .update({
          transcript: input.transcript || null,
          notes: input.notes || null,
          duration_seconds: Math.max(0, Math.round(input.dureeSecondes)),
          draft: input.draft,
          status: 'brouillon',
        })
        .eq('id', sessionId)
        .is('sent_at', null)
        .is('consent_revoked_at', null)
        .select('id')
      if (error) return { ok: false, message: "Le brouillon n'a pas pu être conservé." }
      if (!data?.length) {
        return { ok: false, message: "Cette séance est déjà close : ce brouillon ne s'y enregistre pas." }
      }
      return { ok: true, message: '' }
    },
    [cabinetId],
  )

  const envoyerSeance = useCallback(
    async (
      sessionId: string,
      patientId: PatientId,
      input: Envoi,
    ): Promise<Resultat & { modules?: ModuleCree[] }> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }

      /* UN SEUL GESTE, EN BASE (cabinet_envoyer_seance, 0043).
         Le navigateur enchaînait quatre écritures — modules, audios, clôture,
         compteur. Un échec au milieu laissait des modules sans séance close,
         que le nouvel essai insérait une seconde fois ; un second envoi de
         la même séance (« Reprendre » après l'envoi, un autre onglet) faisait
         de même et comptait la séance deux fois. La fonction verrouille la
         séance, refuse celle qui est déjà close ou dont le consentement est
         retiré, et fait tout ou rien. Elle efface aussi le verbatim : la
         transcription n'a servi qu'à écrire ce que la thérapeute a retenu.

         Les audios : seulement ceux qui existent en base (identifiants UUID) —
         ceux de la démonstration n'ont rien à faire dans un dossier. */
      const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const { data, error } = await db.rpc('cabinet_envoyer_seance', {
        p_session: sessionId,
        p_patient: patientId,
        /* La version relue l'emporte sur celle de l'IA : c'est elle que la
           thérapeute vient de valider, et elle seule qui a sa main. */
        p_draft: input.draft,
        p_modules: input.modules.map((m) => ({
          title: m.title,
          meta: m.meta,
          kind: m.kind,
          /* Le « pourquoi » de la séance devient la consigne du module : il
             n'y a pas d'étapes — le brouillon n'en produit pas — mais savoir
             à quoi sert un exercice change tout pour qui doit le faire seul. */
          pourquoi: m.pourquoi ?? '',
        })),
        p_audios: input.audioIds.filter((id) => UUID.test(id)),
      })
      if (error) {
        /* 55000 : la base a refusé une séance close ou au consentement
           retiré, et son message le dit en français. Le reste est une panne :
           rien n'est passé, un nouvel essai ne fera pas de doublon. */
        return {
          ok: false,
          message:
            error.code === '55000'
              ? error.message
              : "La séance n'a pas pu être envoyée. Rien n'a été versé au dossier : réessayez.",
        }
      }

      await recharger()
      /* Les identifiants des modules créés : l'écriture des consignes qui
         suit l'envoi doit savoir lesquels compléter. */
      return { ok: true, message: '', modules: (data ?? []) as ModuleCree[] }
    },
    [cabinetId, recharger],
  )

  /**
   * Remplacer la consigne d'un module.
   *
   * Écrite par l'IA à l'envoi de la séance, relue et corrigée par la
   * thérapeute : c'est elle qui connaît la personne, et un exercice mal
   * formulé se fait mal ou pas du tout.
   */
  const majConsigne = useCallback(
    async (moduleId: string, consigne: ConsigneModule | null): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db
        .from('patient_modules')
        .update({ consigne })
        .eq('id', moduleId)
      if (error) return { ok: false, message: "La consigne n'a pas pu être enregistrée." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  const reglerHypnose = useCallback(
    async (patientId: PatientId, active: boolean): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db
        .from('patients')
        .update({ hypnose_activee: active })
        .eq('id', patientId)
      if (error) return { ok: false, message: "Le réglage n'a pas pu être enregistré." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  /**
   * L'hypnose s'ouvre AVANT d'être écrite, et se remplit mouvement par
   * mouvement. Une écriture interrompue au troisième laisse donc les deux
   * premiers en base : la thérapeute reprend au lieu de tout reperdre.
   */
  const creerHypnose = useCallback(
    async (patientId: PatientId, sessionId: string | null, intention: string): Promise<string | null> => {
      const db = supabase()
      if (!db || !cabinetId) return null
      const { data, error } = await db
        .from('hypnoses')
        .insert({
          cabinet_id: cabinetId,
          patient_id: patientId,
          session_id: sessionId,
          titre: 'Séance en cours d’écriture',
          intention: intention || null,
        })
        .select('id')
        .maybeSingle<{ id: string }>()
      if (error || !data) return null
      return data.id
    },
    [cabinetId],
  )

  const ajouterMouvement = useCallback(
    async (hypnoseId: string, m: HypnoseMouvement, rang: number): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db.from('hypnose_mouvements').upsert(
        {
          hypnose_id: hypnoseId,
          cabinet_id: cabinetId,
          mouvement: m.mouvement,
          rang,
          titre: m.titre,
          texte: m.texte,
        },
        { onConflict: 'hypnose_id,mouvement' },
      )
      if (error) return { ok: false, message: "Ce mouvement n'a pas pu être conservé." }
      return { ok: true, message: '' }
    },
    [cabinetId],
  )

  const acheverHypnose = useCallback(
    async (hypnoseId: string, titre: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db
        .from('hypnoses')
        .update({ complete: true, titre })
        .eq('id', hypnoseId)
      if (error) return { ok: false, message: "L'hypnose n'a pas pu être refermée." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  /**
   * Supprime une fiche. Tout ce qui s'y rattache part avec elle : la base le
   * fait en cascade, sur les clés étrangères. Le compte de connexion de la
   * patient, lui, survit — il ne nous appartient pas, et il peut être
   * rattaché à une autre fiche ailleurs.
   */
  const supprimerHypnose = useCallback(
    async (hypnoseId: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      // Les mouvements partent en cascade, sur la clé étrangère.
      const { error } = await db.from('hypnoses').delete().eq('id', hypnoseId)
      if (error) return { ok: false, message: "L'hypnose n'a pas pu être supprimée." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  /**
   * Clore un suivi.
   *
   * La fiche sort des actives — donc du plafond de l'offre — et le dossier
   * reste entier. C'est ce que le message du plafond demande de faire, et il
   * fallait bien que quelque chose le fasse.
   *
   * Conséquence à dire à l'écran : le patient perd l'accès à son espace,
   * `my_context()` ne rendant que les fiches actives. Clore, c'est finir un
   * accompagnement, pas ranger un dossier encombrant.
   */
  const archiverPatiente = useCallback(
    async (patientId: PatientId): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Connectez-vous à votre cabinet.' }
      const { error } = await db
        .from('patients')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', patientId)
        .is('archived_at', null)
      if (error) return { ok: false, message: "Le suivi n'a pas pu être clos. Réessayez." }
      await recharger()
      return { ok: true, message: 'Suivi clos. Le dossier est conservé, et la place est libre.' }
    },
    [cabinetId, recharger],
  )

  /** Rouvrir un suivi clos. Le plafond de l'offre s'applique de nouveau. */
  const rouvrirPatiente = useCallback(
    async (patientId: PatientId): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Connectez-vous à votre cabinet.' }
      /* On le dit avant d'écrire, avec les droits de l'appelante — la
         fonction refuse à qui n'est pas du cabinet. Le CONTRAT d'abord : hors
         contrat, le plafond vaut le nombre de fiches déjà actives, et « Closez
         un autre suivi » envoyait fermer un suivi pour une place qui ne se
         libère jamais. La base tient la même règle (0032, 0049). */
      const { data: droits } = await db.rpc('mes_droits')
      const refus = refusDeReouverture((droits ?? null) as DroitsLus | null)
      if (refus) return { ok: false, message: refus }
      const { error } = await db
        .from('patients')
        .update({ archived_at: null })
        .eq('id', patientId)
        .not('archived_at', 'is', null)
      if (error) {
        // 23514 : le déclencheur du plafond, dont le message est écrit pour l'écran.
        return { ok: false, message: error.code === '23514' ? error.message : "Le suivi n'a pas pu être rouvert. Réessayez." }
      }
      await recharger()
      return { ok: true, message: 'Suivi rouvert. Son patient retrouve son espace.' }
    },
    [cabinetId, recharger],
  )

  const supprimerPatiente = useCallback(
    async (patientId: PatientId): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db.from('patients').delete().eq('id', patientId)
      if (error) return { ok: false, message: "La fiche n'a pas pu être supprimée." }
      await recharger()
      return { ok: true, message: '' }
    },
    [cabinetId, recharger],
  )

  const enregistrerProfil = useCallback(
    async (patientId: PatientId, sessionId: string | null, profil: ProfilGenere): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const [{ data: precedent }, { data: fiche }] = await Promise.all([
        db
          .from('psych_profiles')
          .select('version')
          .eq('patient_id', patientId)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle<{ version: number }>(),
        db.from('patients').select('sessions_done').eq('id', patientId).maybeSingle<{ sessions_done: number }>(),
      ])
      const { error } = await db.from('psych_profiles').insert({
        cabinet_id: cabinetId,
        patient_id: patientId,
        version: (precedent?.version ?? 0) + 1,
        /* LA SÉANCE EN COURS COMPTE — QUAND IL Y EN A UNE.
           Ce « +1 » était inconditionnel. Il a un sens depuis l'écran de
           séance, où la séance n'est pas encore comptée ; depuis la fiche, où
           `sessionId` est nul, il inventait une séance qui n'a pas eu lieu.
           La carte affichait alors deux comptes contradictoires côte à côte —
           « Consolidé · 4 séances » face à « Établi après 5 séances » — et la
           courbe des axes se décalait d'un cran à chaque actualisation.
           C'est le même motif que 0031 a retiré de la clôture, resté ici. */
        sessions_count: (fiche?.sessions_done ?? 0) + (sessionId ? 1 : 0),
        portrait: profil.portrait,
        axes: profil.axes,
        levers: profil.levers,
        dynamique: profil.dynamique || null,
        alliance: profil.alliance || null,
        care: profil.care,
        resume: profil.resume || null,
        source_session_id: sessionId,
      })
      if (error) return { ok: false, message: "Le profil n'a pas pu être enregistré." }
      return { ok: true, message: '' }
    },
    [cabinetId],
  )

  return {
    reel,
    archivees,
    chargement,
    erreur,
    incomplet,
    recharger,
    creerPatiente,
    archiverPatiente,
    rouvrirPatiente,
    basculerModule,
    retirerModule,
    remettreModule,
    majModule,
    majFiche,
    changerAdresse,
    envoyerLienAcces,
    enregistrerMarque,
    televerserLogo,
    creerProgramme,
    renommerProgramme,
    attribuerProgramme,
    retirerProgramme,
    importerAudio,
    envoyerAudio,
    creerCategorie,
    renommerAudio,
    recategoriserAudio,
    urlEcoute,
    retirerAudioPatient,
    supprimerAudio,
    assignerModule,
    publierAffirmations,
    reglerAffirmationsAuto,
    envoyerNotification,
    modifierNotification,
    annulerNotification,
    ouvrirSeance,
    seanceOuverte,
    sauverCaptation,
    retirerConsentement,
    enregistrerBrouillon,
    majBrouillon,
    envoyerSeance,
    majConsigne,
    enregistrerProfil,
    reglerHypnose,
    creerHypnose,
    ajouterMouvement,
    acheverHypnose,
    supprimerPatiente,
    supprimerHypnose,
  }
}

/** Durée d'un audio de la bibliothèque, pour les écrans qui l'affichent. */
export const dureeAudio = (mmss: string) => durationToSeconds(mmss)
