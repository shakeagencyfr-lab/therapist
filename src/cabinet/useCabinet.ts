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
import { supabase } from '@/lib/supabase'
import { demanderInvitation } from '@/services/invitations'
import { useStore } from '@/state/store'
import { durationToSeconds } from '@/lib/format'
import type {
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

interface ProfileRow {
  patient_id: string
  version: number
  sessions_count: number
  portrait: string
  axes: ProfileAxis[]
  levers: ProfileLever[]
  care: string[]
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
    profile: profil
      ? {
          updated: `Établi après ${profil.sessions_count} ${profil.sessions_count > 1 ? 'séances' : 'séance'}`,
          portrait: profil.portrait,
          axes: profil.axes ?? [],
          levers: profil.levers ?? [],
          care: profil.care ?? [],
        }
      : PROFIL_VIDE,
    modules: mods.map<PatientModule>((m) => ({
      title: m.title,
      meta: m.meta,
      kind: m.kind,
      done: Boolean(m.done_at),
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

/** Ce qui se règle depuis la fiche, une fois la patiente reçue. */
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
  care: string[]
  resume: string
}

export interface CabinetData {
  /** Vrai quand les fiches viennent de la base. */
  reel: boolean
  chargement: boolean
  erreur: string
  recharger: () => Promise<void>
  creerPatiente: (input: NouvellePatiente) => Promise<Resultat>
  /** Coche ou décoche un module du parcours. */
  basculerModule: (patientId: PatientId, position: number, fait: boolean) => Promise<Resultat>
  /** Règle la fiche : programme, échelle, question du soir, prochaine séance. */
  majFiche: (patientId: PatientId, input: ReglagesFiche) => Promise<Resultat>
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
  /* La séance ------------------------------------------------------ *
   * Elle s'ouvre à la signature du consentement — c'est la pièce qui
   * autorise la captation, elle est horodatée et conservée. Le brouillon
   * la complète, l'envoi la clôt et verse au dossier ce qui a été retenu. */
  ouvrirSeance: (patientId: PatientId) => Promise<Resultat & { id?: string }>
  enregistrerBrouillon: (sessionId: string, input: Brouillon) => Promise<Resultat>
  envoyerSeance: (sessionId: string, patientId: PatientId, input: Envoi) => Promise<Resultat>
  enregistrerProfil: (patientId: PatientId, sessionId: string | null, profil: ProfilGenere) => Promise<Resultat>
}

export function useCabinet(cabinetId: string | null): CabinetData {
  const { state, set } = useStore()
  const [chargement, setChargement] = useState(Boolean(cabinetId))
  const [erreur, setErreur] = useState('')
  const reel = state.patientsReels

  const recharger = useCallback(async () => {
    const db = supabase()
    if (!db || !cabinetId) {
      setChargement(false)
      return
    }
    setErreur('')
    setChargement(true)

    const [fiches, modules, audios, echelles, journal, profils, categories, bibliotheque] = await Promise.all([
      db.from('patients').select('*').is('archived_at', null).order('created_at'),
      db.from('patient_modules').select('id, patient_id, title, meta, kind, position, done_at'),
      db.from('patient_audios').select('patient_id, listens, last_listened_at, audio:audio_library (title, duration_seconds)'),
      db.from('scale_entries').select('patient_id, value, recorded_at'),
      db.from('journal_pages').select('patient_id, title, body, trigger_label, written_at'),
      db.from('psych_profiles').select('patient_id, version, sessions_count, portrait, axes, levers, care').order('version', { ascending: false }),
      db.from('audio_categories').select('id, label, position').order('position').order('label'),
      db.from('audio_library').select('id, category_id, title, meta, duration_seconds, storage_path, created_at').order('created_at', { ascending: false }),
    ])

    const premiere = [fiches, modules, audios, echelles, journal, profils, categories, bibliotheque].find((r) => r.error)
    if (premiere?.error) {
      setErreur("Le dossier du cabinet n'a pas pu être chargé. Réessayez dans un instant.")
      setChargement(false)
      return
    }

    const lignes = (fiches.data ?? []) as PatientRow[]
    // Une seule version par patient : la plus récente, l'ordre étant décroissant.
    const dernierProfil = new Map<string, ProfileRow>()
    for (const pr of (profils.data ?? []) as ProfileRow[]) {
      if (!dernierProfil.has(pr.patient_id)) dernierProfil.set(pr.patient_id, pr)
    }

    const assemblees: Record<PatientId, Patient> = {}
    for (const ligne of lignes) {
      assemblees[ligne.id] = assembler(
        ligne,
        (modules.data ?? []) as ModuleRow[],
        (audios.data ?? []) as unknown as AudioRow[],
        (echelles.data ?? []) as ScaleRow[],
        (journal.data ?? []) as JournalRow[],
        dernierProfil.get(ligne.id),
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

    const ordre = lignes.map((l) => l.id)
    set((prev) => ({
      patients: assemblees,
      patientOrder: ordre,
      patientsReels: true,
      cabinetId,
      // Garder le patient ouvert s'il existe encore ; sinon prendre le premier.
      sel: ordre.includes(prev.sel) ? prev.sel : (ordre[0] ?? ''),
      lib,
      cats: catLabels,
      libSel: lib.some((a) => a.id === prev.libSel) ? prev.libSel : (lib[0]?.id ?? null),
      libFilter: catLabels.includes(prev.libFilter) ? prev.libFilter : 'Toutes',
      upCat: catLabels.includes(prev.upCat) ? prev.upCat : (catLabels[0] ?? ''),
    }))
    setChargement(false)
  }, [cabinetId, set])

  useEffect(() => {
    void recharger()
  }, [recharger])

  /**
   * Créer une patiente, c'est écrire une fiche avec son adresse : c'est cette
   * adresse qui la connectera, au premier lien magique. Rien n'est envoyé ici —
   * le compte se crée quand elle demande son lien.
   */
  const creerPatiente = useCallback(
    async (input: NouvellePatiente): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) {
        return { ok: false, message: 'Connectez-vous à votre cabinet pour ajouter une patiente.' }
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
        return {
          ok: false,
          message: doublon
            ? `Une fiche porte déjà l'adresse ${email}.`
            : "La fiche n'a pas pu être créée. Réessayez.",
        }
      }

      // Sa fiche existe ; on lui envoie le lien qui ouvre son espace.
      let envoi = ''
      if (email) {
        const r = await demanderInvitation({ email, cabinetId, kind: 'patiente' })
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
    chargement,
    erreur,
    recharger,
    creerPatiente,
    basculerModule,
    majFiche,
    importerAudio,
    envoyerAudio,
    creerCategorie,
    renommerAudio,
    recategoriserAudio,
    urlEcoute,
    ouvrirSeance,
    enregistrerBrouillon,
    envoyerSeance,
    enregistrerProfil,
  }
}

/** Durée d'un audio de la bibliothèque, pour les écrans qui l'affichent. */
export const dureeAudio = (mmss: string) => durationToSeconds(mmss)
