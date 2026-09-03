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
import { useStore } from '@/state/store'
import { durationToSeconds } from '@/lib/format'
import type { CabinetBranding } from '@/types/reseller'
import type {
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
}

interface AudioRow {
  patient_id: string
  listens: number
  last_listened_at: string | null
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

interface PushRow {
  id: string
  title: string
  body: string
  scheduled_for: string
  created_at: string
  recipients: Array<{ patient: { display_name: string } | null }>
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
): Patient {
  const mods = modules
    .filter((m) => m.patient_id === p.id)
    .sort((a, b) => a.position - b.position)
  const faits = mods.filter((m) => m.done_at).length

  const auds = audios.filter((a) => a.patient_id === p.id)
  const serie = echelles
    .filter((e) => e.patient_id === p.id)
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    .map((e) => e.value)

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
    adherence: mods.length ? Math.round((faits / mods.length) * 100) : 0,
    listens: auds.reduce((n, a) => n + a.listens, 0),
    sessions: p.sessions_done,
    totalSessions: p.sessions_total,
    scaleLabel: p.scale_label || 'Auto-évaluation',
    scaleQuestion: p.scale_question,
    scaleDelta: p.scale_delta ?? '',
    scale: serie,
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
      done: Boolean(m.done_at),
      note: m.patient_note ?? undefined,
    })),
    audios: auds.map<PatientAudio>((a) => ({
      title: a.audio?.title ?? 'Enregistrement',
      meta: a.listens > 0 ? `Écouté ${a.listens} fois` : 'Jamais écouté',
      duration: duree(a.audio?.duration_seconds ?? 0),
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

/** Ce qui part au dossier à la validation du brouillon. */
export interface Envoi {
  modules: PatientModule[]
  /** Audios de la bibliothèque du cabinet, par identifiant en base. */
  audioIds: string[]
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
  recharger: () => Promise<void>
  creerPatiente: (input: NouvellePatiente) => Promise<Resultat>
  /** Clôt un suivi : la fiche sort des actives, le dossier reste. */
  archiverPatiente: (patientId: PatientId) => Promise<Resultat>
  /** Rouvre un suivi clos, si l'offre a encore une place. */
  rouvrirPatiente: (patientId: PatientId) => Promise<Resultat>
  /** Coche ou décoche un module du parcours. */
  basculerModule: (patientId: PatientId, position: number, fait: boolean) => Promise<Resultat>
  /** Règle la fiche : programme, échelle, question du soir, prochaine séance. */
  majFiche: (patientId: PatientId, input: ReglagesFiche) => Promise<Resultat>
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
  /* La séance ------------------------------------------------------ *
   * Elle s'ouvre à la signature du consentement — c'est la pièce qui
   * autorise la captation, elle est horodatée et conservée. Le brouillon
   * la complète, l'envoi la clôt et verse au dossier ce qui a été retenu. */
  ouvrirSeance: (patientId: PatientId) => Promise<Resultat & { id?: string }>
  enregistrerBrouillon: (sessionId: string, input: Brouillon) => Promise<Resultat>
  envoyerSeance: (sessionId: string, patientId: PatientId, input: Envoi) => Promise<Resultat>
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

    const [fiches, closes, modules, audios, echelles, journal, profils, categories, progs, rdv, bibliotheque, ateliers, affs, reglages, pushes, hypnoses, mouvements, brouillons] = await Promise.all([
      db.from('patients').select('*').is('archived_at', null).order('created_at'),
      db
        .from('patients')
        .select('id, display_name, initials, archived_at')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false }),
      db.from('patient_modules').select('id, patient_id, title, meta, kind, position, done_at, patient_note'),
      db.from('patient_audios').select('patient_id, listens, last_listened_at, audio:audio_library (title, duration_seconds)'),
      db.from('scale_entries').select('patient_id, value, recorded_at'),
      db.from('journal_pages').select('patient_id, title, body, trigger_label, written_at'),
      db.from('psych_profiles').select('patient_id, version, sessions_count, portrait, axes, levers, dynamique, alliance, care').order('version', { ascending: false }),
      db.from('audio_categories').select('id, label, position').order('position').order('label'),
      db.from('cabinet_programs').select('label, position').is('archived_at', null).order('position').order('label'),
      db.from('cabinet_settings').select('booking_url, booking_mode, booking_widget_url').eq('cabinet_id', cabinetId).maybeSingle(),
      db.from('audio_library').select('id, category_id, title, meta, duration_seconds, storage_path, created_at').order('created_at', { ascending: false }),
      db.from('custom_modules').select('id, title, kind, duree, quand, steps, pourquoi, quiz').order('created_at'),
      db.from('affirmations').select('patient_id, text, position, published_at').order('position'),
      db.from('patient_settings').select('patient_id, affirmations_auto'),
      db
        .from('push_notifications')
        .select('id, title, body, scheduled_for, created_at, recipients:push_recipients (patient:patients (display_name))')
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
    ])

    const premiere = [fiches, modules, audios, echelles, journal, profils, categories, bibliotheque].find((r) => r.error)
    if (premiere?.error) {
      setErreur("Le dossier du cabinet n'a pas pu être chargé. Réessayez dans un instant.")
      setChargement(false)
      return
    }

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

    // Le journal des envois.
    const envois = ((pushes.data ?? []) as unknown as PushRow[]).map<PushRecord>((n) => ({
      title: n.title,
      message: n.body,
      when: n.scheduled_for,
      names: n.recipients.map((r) => r.patient?.display_name ?? '').filter(Boolean),
      stamp: new Date(n.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    }))

    const ordre = lignes.map((l) => l.id)
    set((prev) => ({
      customs,
      affs: affirmations,
      affAuto,
      pushes: envois,
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
   * adresse qui la connectera, au premier lien magique. Rien n'est envoyé ici —
   * le compte se crée quand elle demande son lien.
   */
  const creerPatiente = useCallback(
    async (input: NouvellePatiente): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) {
        return { ok: false, message: 'Connectez-vous à votre cabinet pour ajouter un patient.' }
      }

      const nom = input.nom.trim()
      const email = input.email.trim().toLowerCase()
      if (nom.length < 2) return { ok: false, message: 'Indiquez au moins un nom.' }

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

      // Sa fiche existe ; on lui envoie le lien qui ouvre son espace.
      let envoi = ''
      if (email) {
        const r = await demanderInvitation({ email, cabinetId, kind: 'patient' })
        envoi = r.message
      }

      await recharger()
      if (!email) {
        return { ok: true, message: `${nom} est ajoutée. Ajoutez son adresse pour qu'elle puisse ouvrir son espace.` }
      }
      return {
        ok: true,
        message: envoi || `${nom} est ajoutée. Elle entrera dans son espace avec ${email}, sans mot de passe.`,
      }
    },
    [cabinetId, recharger],
  )

  const basculerModule = useCallback(
    async (patientId: PatientId, position: number, fait: boolean): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db
        .from('patient_modules')
        .update({ done_at: fait ? new Date().toISOString() : null })
        .eq('patient_id', patientId)
        .eq('position', position)
      if (error) return { ok: false, message: "Le module n'a pas pu être mis à jour." }
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
      if (!nom) return { ok: false, message: 'Le nom affiché ne peut pas être vide.' }
      const { error } = await db
        .from('cabinets')
        .update({ name: nom, tagline: input.surTitre.trim(), branding: input.branding })
        .eq('id', cabinetId)
      return error
        ? { ok: false, message: "Votre marque n'a pas pu être publiée. Réessayez." }
        : {
            ok: true,
            message:
              'Marque publiée. Elle habille votre espace et l’application de vos patients.',
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
      const propres = textes.map((t) => t.trim()).filter(Boolean)
      // Remplacer : ce que le patient lit est exactement la liste publiée.
      const { error: e1 } = await db.from('affirmations').delete().eq('patient_id', patientId)
      if (e1) return { ok: false, message: "Les affirmations n'ont pas pu être remplacées." }
      if (propres.length) {
        const maintenant = new Date().toISOString()
        const { error: e2 } = await db.from('affirmations').insert(
          propres.map((text, position) => ({
            cabinet_id: cabinetId,
            patient_id: patientId,
            text,
            position,
            source: 'manuel',
            published_at: maintenant,
          })),
        )
        if (e2) return { ok: false, message: "Les affirmations n'ont pas pu être publiées." }
      }
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
      if (e1 || !data) return { ok: false, message: "La notification n'a pas pu être enregistrée." }
      const { error: e2 } = await db
        .from('push_recipients')
        .insert(patientIds.map((patient_id) => ({ push_id: data.id, patient_id, cabinet_id: cabinetId })))
      if (e2) return { ok: false, message: "Les destinataires n'ont pas pu être enregistrés." }
      await recharger()
      return { ok: true, message: '' }
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

  const enregistrerBrouillon = useCallback(
    async (sessionId: string, input: Brouillon): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db
        .from('therapy_sessions')
        .update({
          transcript: input.transcript || null,
          notes: input.notes || null,
          duration_seconds: Math.max(0, Math.round(input.dureeSecondes)),
          draft: input.draft,
          status: 'brouillon',
        })
        .eq('id', sessionId)
      if (error) return { ok: false, message: "Le brouillon n'a pas pu être conservé." }
      return { ok: true, message: '' }
    },
    [cabinetId],
  )

  const envoyerSeance = useCallback(
    async (sessionId: string, patientId: PatientId, input: Envoi): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }

      // Les modules retenus prennent la suite du parcours existant.
      const { data: dernier } = await db
        .from('patient_modules')
        .select('position')
        .eq('patient_id', patientId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle<{ position: number }>()
      let position = (dernier?.position ?? -1) + 1
      if (input.modules.length) {
        const { error } = await db.from('patient_modules').insert(
          input.modules.map((m) => ({
            cabinet_id: cabinetId,
            patient_id: patientId,
            title: m.title,
            meta: m.meta,
            kind: m.kind,
            source: 'seance',
            position: position++,
          })),
        )
        if (error) return { ok: false, message: "Les modules n'ont pas pu être envoyés." }
      }

      // Les audios : seulement ceux qui existent en base (identifiants UUID).
      const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const audios = input.audioIds.filter((id) => UUID.test(id))
      if (audios.length) {
        await db
          .from('patient_audios')
          .upsert(
            audios.map((audio_id) => ({ cabinet_id: cabinetId, patient_id: patientId, audio_id })),
            { onConflict: 'patient_id,audio_id', ignoreDuplicates: true },
          )
      }

      const { error: e2 } = await db
        .from('therapy_sessions')
        .update({ sent_at: new Date().toISOString(), status: 'envoye' })
        .eq('id', sessionId)
      if (e2) return { ok: false, message: "La séance n'a pas pu être clôturée." }

      // Une séance de plus au compteur de la fiche.
      const { data: fiche } = await db
        .from('patients')
        .select('sessions_done')
        .eq('id', patientId)
        .maybeSingle<{ sessions_done: number }>()
      await db
        .from('patients')
        .update({ sessions_done: (fiche?.sessions_done ?? 0) + 1 })
        .eq('id', patientId)

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
      /* Le déclencheur du plafond ne joue qu'à l'insertion : une réouverture
         est une mise à jour, et passerait au-dessus. On compte donc ici, avec
         les droits de l'appelante — la fonction refuse à qui n'est pas du
         cabinet. */
      const { data: droits } = await db.rpc('mes_droits')
      const d = (droits ?? {}) as { max_patients?: number | null; patients_actives?: number }
      if (d.max_patients !== null && d.max_patients !== undefined && (d.patients_actives ?? 0) >= d.max_patients) {
        return {
          ok: false,
          message: `Votre offre permet ${d.max_patients} fiches actives, et elles le sont toutes. Closez un autre suivi, ou demandez à votre revendeur de relever le plafond.`,
        }
      }
      const { error } = await db
        .from('patients')
        .update({ archived_at: null })
        .eq('id', patientId)
        .not('archived_at', 'is', null)
      if (error) return { ok: false, message: "Le suivi n'a pas pu être rouvert. Réessayez." }
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
        // La séance en cours compte : c'est d'elle que le profil est tiré.
        sessions_count: (fiche?.sessions_done ?? 0) + 1,
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
    recharger,
    creerPatiente,
    archiverPatiente,
    rouvrirPatiente,
    basculerModule,
    majFiche,
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
    assignerModule,
    publierAffirmations,
    reglerAffirmationsAuto,
    envoyerNotification,
    ouvrirSeance,
    enregistrerBrouillon,
    envoyerSeance,
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
