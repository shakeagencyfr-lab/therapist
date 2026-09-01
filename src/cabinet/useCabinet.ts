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
  ModuleKind,
  Patient,
  PatientAudio,
  PatientId,
  PatientModule,
  ProfileAxis,
  ProfileLever,
  PsychProfile,
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
    subtitle: p.subtitle || 'Programme à définir',
    weekLabel: p.week_label || 'Programme à définir',
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

export interface CabinetData {
  /** Vrai quand les fiches viennent de la base. */
  reel: boolean
  chargement: boolean
  erreur: string
  recharger: () => Promise<void>
  creerPatiente: (input: NouvellePatiente) => Promise<Resultat>
  /** Coche ou décoche un module du parcours. */
  basculerModule: (patientId: PatientId, position: number, fait: boolean) => Promise<Resultat>
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

    const [fiches, modules, audios, echelles, journal, profils] = await Promise.all([
      db.from('patients').select('*').is('archived_at', null).order('created_at'),
      db.from('patient_modules').select('id, patient_id, title, meta, kind, position, done_at'),
      db.from('patient_audios').select('patient_id, listens, last_listened_at, audio:audio_library (title, duration_seconds)'),
      db.from('scale_entries').select('patient_id, value, recorded_at'),
      db.from('journal_pages').select('patient_id, title, body, trigger_label, written_at'),
      db.from('psych_profiles').select('patient_id, version, sessions_count, portrait, axes, levers, care').order('version', { ascending: false }),
    ])

    const premiere = [fiches, modules, audios, echelles, journal, profils].find((r) => r.error)
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

    const ordre = lignes.map((l) => l.id)
    set((prev) => ({
      patients: assemblees,
      patientOrder: ordre,
      patientsReels: true,
      cabinetId,
      // Garder le patient ouvert s'il existe encore ; sinon prendre le premier.
      sel: ordre.includes(prev.sel) ? prev.sel : (ordre[0] ?? ''),
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

  return { reel, chargement, erreur, recharger, creerPatiente, basculerModule }
}

/** Durée d'un audio de la bibliothèque, pour les écrans qui l'affichent. */
export const dureeAudio = (mmss: string) => durationToSeconds(mmss)
