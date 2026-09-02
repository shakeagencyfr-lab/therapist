/**
 * Les données du patient, lues sous son propre compte.
 *
 * Aucune de ces requêtes ne nomme un cabinet ni un autre patient : la RLS
 * borne déjà chaque table à ses propres lignes. Si une requête rendait la
 * fiche de quelqu'un d'autre, ce serait un défaut de la base, pas d'ici.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ModuleKind } from '@/types/domain'

export interface PatientModuleRow {
  id: string
  title: string
  meta: string
  kind: ModuleKind
  position: number
  done_at: string | null
  patient_note: string | null
}

export interface PatientAudioRow {
  id: string
  listens: number
  audio: { title: string; duration_seconds: number; meta: string | null; storage_path: string } | null
}

/** Une page du journal, telle que la patiente l'a écrite. */
export interface JournalPageRow {
  id: string
  title: string
  body: string
  shared: boolean
  written_at: string
}

export interface PatientData {
  modules: PatientModuleRow[]
  /** Son journal, de la plus récente à la plus ancienne. */
  journal: JournalPageRow[]
  affirmations: string[]
  audios: PatientAudioRow[]
  /** Dernière valeur d'échelle enregistrée aujourd'hui, s'il y en a une. */
  scaleToday: number | null
  scaleQuestion: string
  /** Page de réservation du cabinet, si la thérapeute l'a réglée. */
  bookingUrl: string | null
  /** « bouton » ouvre la page, « widget » l'encadre ici même. */
  bookingMode: 'bouton' | 'widget'
  /** Adresse du widget quand elle diffère de celle de la page. */
  bookingWidgetUrl: string | null
  /** La boutique est ouverte par la thérapeute. */
  shopEnabled: boolean
  chargement: boolean
  erreur: string
  recharger: () => Promise<void>
}

export function usePatientData(patientId: string | null): PatientData {
  const [modules, setModules] = useState<PatientModuleRow[]>([])
  const [journal, setJournal] = useState<JournalPageRow[]>([])
  const [affirmations, setAffirmations] = useState<string[]>([])
  const [audios, setAudios] = useState<PatientAudioRow[]>([])
  const [scaleToday, setScaleToday] = useState<number | null>(null)
  const [scaleQuestion, setScaleQuestion] = useState('Où en êtes-vous ce soir ?')
  const [bookingUrl, setBookingUrl] = useState<string | null>(null)
  const [bookingMode, setBookingMode] = useState<'bouton' | 'widget'>('bouton')
  const [bookingWidgetUrl, setBookingWidgetUrl] = useState<string | null>(null)
  const [shopEnabled, setShopEnabled] = useState(false)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  const recharger = useCallback(async () => {
    const db = supabase()
    if (!db || !patientId) {
      setChargement(false)
      return
    }
    setErreur('')

    const [mods, affs, auds, fiche, echelle, reglages, pages] = await Promise.all([
      db.from('patient_modules').select('id, title, meta, kind, position, done_at, patient_note').order('position'),
      db.from('affirmations').select('text, position').not('published_at', 'is', null).order('position'),
      db.from('patient_audios').select('id, listens, audio:audio_library (title, duration_seconds, meta, storage_path)'),
      db.from('patients').select('scale_question').limit(1).maybeSingle(),
      db.from('scale_entries').select('value, recorded_at').order('recorded_at', { ascending: false }).limit(1),
      // Ce que la patiente voit de son cabinet : l'agenda et la boutique, rien
      // des clés. Un échec ici ne bloque pas le reste de l'espace.
      db.rpc('patient_cabinet_settings'),
      db
        .from('journal_pages')
        .select('id, title, body, shared, written_at')
        .order('written_at', { ascending: false })
        .limit(60),
    ])

    const premiere = [mods.error, affs.error, auds.error, fiche.error, echelle.error].find(Boolean)
    if (premiere) {
      setErreur("Vos données n'ont pas pu être chargées. Réessayez dans un instant.")
      setChargement(false)
      return
    }

    setModules((mods.data ?? []) as PatientModuleRow[])
    setJournal((pages.data ?? []) as JournalPageRow[])
    setAffirmations(((affs.data ?? []) as Array<{ text: string }>).map((a) => a.text))
    setAudios((auds.data ?? []) as unknown as PatientAudioRow[])
    if (fiche.data?.scale_question) setScaleQuestion(fiche.data.scale_question)
    const r = (reglages.data ?? null) as {
      booking_url?: string | null
      booking_mode?: string | null
      booking_widget_url?: string | null
      shop_enabled?: boolean
    } | null
    setBookingUrl(r?.booking_url ?? null)
    setBookingMode(r?.booking_mode === 'widget' ? 'widget' : 'bouton')
    setBookingWidgetUrl(r?.booking_widget_url ?? null)
    setShopEnabled(Boolean(r?.shop_enabled))

    const derniere = (echelle.data ?? [])[0] as { value: number; recorded_at: string } | undefined
    const aujourdhui = new Date().toISOString().slice(0, 10)
    setScaleToday(derniere && derniere.recorded_at.slice(0, 10) === aujourdhui ? derniere.value : null)
    setChargement(false)
  }, [patientId])

  useEffect(() => {
    void recharger()
  }, [recharger])

  return {
    modules,
    journal,
    affirmations,
    audios,
    scaleToday,
    scaleQuestion,
    bookingUrl,
    bookingMode,
    bookingWidgetUrl,
    shopEnabled,
    chargement,
    erreur,
    recharger,
  }
}
