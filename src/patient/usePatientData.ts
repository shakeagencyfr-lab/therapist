/**
 * Les données du patient, lues sous son propre compte.
 *
 * Aucune de ces requêtes ne nomme un cabinet ni un autre patient : la RLS
 * borne déjà chaque table à ses propres lignes. Si une requête rendait la
 * fiche de quelqu'un d'autre, ce serait un défaut de la base, pas d'ici.
 */
import { useCallback, useEffect, useState } from 'react'
import { useRetour } from '@/lib/useRetour'
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
  /**
   * La consigne, quand elle existe.
   *
   * Un module de l'atelier en porte une complète — durée, moment, étapes,
   * pourquoi. Un module issu d'une séance ne porte que le « pourquoi » que
   * la séance a dicté : le brouillon ne produit pas d'étapes, et en inventer
   * serait pire que de n'en pas donner.
   */
  consigne: {
    duree?: string
    quand?: string
    steps?: string[]
    why?: string
  } | null
}

export interface PatientAudioRow {
  id: string
  listens: number
  audio: { title: string; duration_seconds: number; meta: string | null; storage_path: string } | null
}

/**
 * Un mot du cabinet, adressé à ce patient.
 *
 * La thérapeute les écrit depuis l'écran Notifications. Ils étaient
 * enregistrés, adressés, et jamais lus : aucun écran de l'espace ne les
 * ouvrait. Ils s'affichent maintenant en haut de la journée, et se marquent
 * lus à l'ouverture.
 */
export interface MotRow {
  push_id: string
  read_at: string | null
  push: { title: string; body: string; created_at: string } | null
}

/** Une page du journal, telle que le patient l'a écrite. */
export interface JournalPageRow {
  id: string
  title: string
  body: string
  shared: boolean
  written_at: string
  /** Rang choisi par le patient. null tant qu'il n'a rien déplacé. */
  position: number | null
}

export interface PatientData {
  modules: PatientModuleRow[]
  /** Les mots de son cabinet, du plus récent au plus ancien. */
  mots: MotRow[]
  /** Marque un mot comme lu. La pastille disparaît, le mot reste. */
  marquerMotLu: (pushId: string) => Promise<void>
  /** Son journal, de la plus récente à la plus ancienne. */
  journal: JournalPageRow[]
  /**
   * Vrai quand le journal n'a PAS pu être lu.
   *
   * Un journal illisible et un journal vide se ressemblent à l'écran, et ne
   * se ressemblent pas du tout pour celle qui l'a écrit : « rien d'écrit pour
   * l'instant » lui dit que ses pages ont disparu.
   */
  journalIllisible: boolean
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

/**
 * La date d'un instant dans le fuseau où la base range les notes du soir.
 *
 * `fr-CA` parce que son format est précisément AAAA-MM-JJ : c'est le seul
 * moyen d'obtenir une date comparable sans reconstruire l'arithmétique des
 * fuseaux à la main — et donc de se retromper au prochain changement d'heure.
 */
export function jourDeParis(instant?: string): string {
  const d = instant ? new Date(instant) : new Date()
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d)
}

export function usePatientData(patientId: string | null): PatientData {
  const [modules, setModules] = useState<PatientModuleRow[]>([])
  const [mots, setMots] = useState<MotRow[]>([])
  const [journal, setJournal] = useState<JournalPageRow[]>([])
  const [journalIllisible, setJournalIllisible] = useState(false)
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

    const [mods, affs, auds, fiche, echelle, reglages, pages, courriers] = await Promise.all([
      db.from('patient_modules').select('id, title, meta, kind, position, done_at, patient_note, consigne').eq('patient_id', patientId).order('position'),
      db.from('affirmations').select('text, position').eq('patient_id', patientId).not('published_at', 'is', null).order('position'),
      db.from('patient_audios').select('id, listens, audio:audio_library (title, duration_seconds, meta, storage_path)').eq('patient_id', patientId),
      db.from('patients').select('scale_question').eq('id', patientId).maybeSingle(),
      db.from('scale_entries').select('value, recorded_at').eq('patient_id', patientId).order('recorded_at', { ascending: false }).limit(1),
      // Ce que le patient voit de son cabinet : l'agenda et la boutique, rien
      // des clés. Un échec ici ne bloque pas le reste de l'espace.
      db.rpc('patient_cabinet_settings'),
      db
        .from('journal_pages')
        .select('id, title, body, shared, written_at, position')
        .eq('patient_id', patientId)
        /* L'ordre choisi d'abord, la chronologie ensuite : tant que rien n'a
           été déplacé, la position est nulle partout et le journal se lit du
           plus récent au plus ancien, comme un journal. */
        .order('position', { ascending: true, nullsFirst: false })
        .order('written_at', { ascending: false })
        .limit(60),
      // Les mots du cabinet. Un échec ici ne barre pas la journée.
      db
        .from('push_recipients')
        .select('push_id, read_at, push:push_notifications (title, body, created_at)')
        .eq('patient_id', patientId)
        .limit(20),
    ])

    const premiere = [mods.error, affs.error, auds.error, fiche.error, echelle.error].find(Boolean)
    if (premiere) {
      setErreur("Vos données n'ont pas pu être chargées. Réessayez dans un instant.")
      setChargement(false)
      return
    }

    setModules((mods.data ?? []) as PatientModuleRow[])
    /* L'échec du journal ne barre pas l'espace — les tâches du jour restent
       lisibles — mais il se dit, au lieu de passer pour un journal vide. */
    setJournalIllisible(Boolean(pages.error))
    setJournal((pages.data ?? []) as JournalPageRow[])
    /* Du plus récent au plus ancien : le tri se fait ici, la date étant sur
       la notification et non sur la ligne de destinataire. */
    setMots(
      ((courriers.data ?? []) as unknown as MotRow[])
        .filter((m) => m.push)
        .sort((a, b) => (b.push?.created_at ?? '').localeCompare(a.push?.created_at ?? '')),
    )
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
    /* LE MÊME JOUR QUE LA BASE, PAS UN AUTRE.
       `patient_note_echelle()` décide de créer ou de corriger la ligne du soir
       en comparant des dates d'EUROPE/PARIS. Ici on comparait des dates UTC —
       la base est en UTC, PostgREST sérialise donc en UTC. Les deux frontières
       de journée ne tombent pas au même instant : minuit à Paris, deux heures
       du matin en heure d'été côté UTC.
       Entre les deux, l'écran parlait d'un autre jour que celui sur lequel la
       base allait agir. Une patiente qui notait 7 à 00 h 30 voyait la question
       revenir deux heures plus tard, répondait 4 — et le RPC, toujours au même
       jour de Paris, CORRIGEAIT la ligne : le 7 disparaissait, sans que
       personne ne l'ait voulu, sur la courbe que la thérapeute lit en séance. */
    setScaleToday(derniere && jourDeParis(derniere.recorded_at) === jourDeParis() ? derniere.value : null)
    setChargement(false)
  }, [patientId])

  /**
   * Marquer un mot comme lu.
   *
   * L'état local suit sans attendre la base : la pastille doit disparaître au
   * doigt posé, pas au retour du réseau. Un échec d'écriture laisse le mot
   * non lu en base — il se remarquera à la prochaine ouverture, ce qui est
   * moins gênant que l'inverse.
   */
  const marquerMotLu = useCallback(async (pushId: string) => {
    setMots((prev) =>
      prev.map((m) => (m.push_id === pushId && !m.read_at ? { ...m, read_at: new Date().toISOString() } : m)),
    )
    const db = supabase()
    if (!db) return
    /* Par une fonction, plus par un UPDATE direct. La politique qui autorisait
       cet UPDATE ne contraignait que patient_id : push_id restait libre, et la
       lecture des notifications fait confiance à cette ligne. Un patient
       repointait sa propre ligne de destinataire sur la notification d'un
       autre cabinet, puis en lisait le titre et le corps. Une politique ne
       sait pas dire « cette colonne ne change pas » ; une fonction si. */
    const { error } = await db.rpc('patient_marquer_lue', { p_push: pushId })
    if (error) console.warn('[patient] marquage lu impossible', error.message)
  }, [])

  useEffect(() => {
    void recharger()
  }, [recharger])

  // L'autre côté écrit pendant que cet écran est ouvert : on relit au retour.
  useRetour(recharger)

  return {
    modules,
    mots,
    marquerMotLu,
    journal,
    journalIllisible,
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
