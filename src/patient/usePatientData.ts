/**
 * Les données du patient, lues sous son propre compte.
 *
 * Aucune de ces requêtes ne nomme un cabinet ni un autre patient : la RLS
 * borne déjà chaque table à ses propres lignes. Si une requête rendait la
 * fiche de quelqu'un d'autre, ce serait un défaut de la base, pas d'ici.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRetour } from '@/lib/useRetour'
import { supabase } from '@/lib/supabase'
import { jourDeParis } from '@/lib/assiduite'
import type { NoteDuSoir } from '@/lib/echelle'
import type { ModuleKind, QuizQuestion } from '@/types/domain'

/* Le jour de Paris vit désormais avec l'assiduité, qui en a besoin des deux
   côtés ; il reste exporté d'ici pour ceux qui l'y cherchent. */
export { jourDeParis }

export interface PatientModuleRow {
  id: string
  title: string
  meta: string
  kind: ModuleKind
  position: number
  /** L'instant du dernier jour fait, tenu par la base (0051). */
  done_at: string | null
  /**
   * Fait AUJOURD'HUI, au jour de Paris.
   *
   * Les exercices entre les séances se refont chaque jour : une case cochée
   * hier ne l'est plus ce matin. Déduit à la lecture, jamais écrit.
   */
  faitAujourdhui: boolean
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
    /**
     * Le quiz de compréhension, quand l'exercice en porte un.
     *
     * La colonne le conservait déjà : le champ manquait ICI, et son absence
     * suffisait à ce qu'aucun écran patient ne puisse l'ouvrir.
     */
    quiz?: QuizQuestion[]
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
  title: string
  body: string
  /**
   * Quand le mot est devenu visible : sa date d'envoi s'il était programmé,
   * sinon celle de son écriture. Un mot programmé « demain, 8 h » se datait
   * de la veille, jour où il avait été écrit.
   */
  du_le: string
}

/** Combien de pages du journal se lisent d'un coup. */
export const PAGES_PAR_LOT = 60

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
  /** Son journal, de la plus récente à la plus ancienne — les premières pages seulement. */
  journal: JournalPageRow[]
  /**
   * Combien de pages il compte en tout.
   *
   * La lecture s'arrêtait à soixante sans le dire : au-delà, les plus
   * anciennes disparaissaient, et le compteur restait bloqué à « 60 pages ».
   */
  journalTotal: number
  /** Lire le lot de pages suivant. */
  voirPlusDePages: () => Promise<void>
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
  /**
   * Ses dernières notes du soir, pour sa propre courbe.
   *
   * La thérapeute voyait la courbe ; le patient qui la remplissait chaque
   * soir, jamais. La politique « le patient relit son échelle » le permettait
   * depuis le début.
   */
  notesDuSoir: NoteDuSoir[]
  scaleQuestion: string
  /**
   * La prochaine séance, telle que la thérapeute l'a écrite sur la fiche
   * (« Jeudi 10 septembre, 14 h »). `null` quand rien n'est planifié.
   */
  prochaineSeance: string | null
  /** Page de réservation du cabinet, si la thérapeute l'a réglée. */
  bookingUrl: string | null
  /** « bouton » ouvre la page, « widget » l'encadre ici même. */
  bookingMode: 'bouton' | 'widget'
  /** Adresse du widget quand elle diffère de celle de la page. */
  bookingWidgetUrl: string | null
  /** La boutique est ouverte par la thérapeute. */
  shopEnabled: boolean
  /**
   * Ses réponses au quiz de compréhension, par `moduleId:question`.
   *
   * Le quiz était écrit par l'IA, payé, rangé dans la consigne — et jamais
   * montré : le seul écran du produit qui l'affichait était l'aperçu de
   * démonstration de l'espace cabinet. Les réponses, elles, ne quittaient pas
   * la mémoire du navigateur.
   */
  reponsesQuiz: Record<string, number>
  /** Répondre à une question. Rend faux si la réponse n'a pas été écrite. */
  repondreQuiz: (moduleId: string, question: number, choix: number) => Promise<boolean>
  chargement: boolean
  erreur: string
  recharger: () => Promise<void>
}

/** Combien de notes du soir la courbe du patient relit : un mois de soirées. */
const NOTES_DE_LA_COURBE = 30

export function usePatientData(patientId: string | null): PatientData {
  const [modules, setModules] = useState<PatientModuleRow[]>([])
  const [mots, setMots] = useState<MotRow[]>([])
  const [journal, setJournal] = useState<JournalPageRow[]>([])
  const [journalTotal, setJournalTotal] = useState(0)
  const [journalIllisible, setJournalIllisible] = useState(false)
  /* Combien de pages lire : un lot, puis un de plus à chaque « Voir les pages
     plus anciennes ». Une référence, pas un état : chaque rechargement — après
     une page écrite, au retour sur l'appli — doit garder les pages déjà
     dépliées, sans que la fonction de rechargement change à chaque lot. */
  const pagesLues = useRef(PAGES_PAR_LOT)
  const [affirmations, setAffirmations] = useState<string[]>([])
  const [audios, setAudios] = useState<PatientAudioRow[]>([])
  const [scaleToday, setScaleToday] = useState<number | null>(null)
  const [notesDuSoir, setNotesDuSoir] = useState<NoteDuSoir[]>([])
  const [prochaineSeance, setProchaineSeance] = useState<string | null>(null)
  const [scaleQuestion, setScaleQuestion] = useState('Où en êtes-vous ce soir ?')
  const [bookingUrl, setBookingUrl] = useState<string | null>(null)
  const [bookingMode, setBookingMode] = useState<'bouton' | 'widget'>('bouton')
  const [bookingWidgetUrl, setBookingWidgetUrl] = useState<string | null>(null)
  const [shopEnabled, setShopEnabled] = useState(false)
  const [reponsesQuiz, setReponsesQuiz] = useState<Record<string, number>>({})
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  const recharger = useCallback(async () => {
    const db = supabase()
    if (!db || !patientId) {
      setChargement(false)
      return
    }
    setErreur('')
    const aujourdhui = jourDeParis()

    const [mods, faitsDuJour, affs, auds, fiche, echelle, reglages, pages, courriers, quiz] = await Promise.all([
      /* Les exercices ENCORE à son parcours. La RLS les borne déjà pour le
         patient ; le filtre compte pour un compte qui est aussi membre d'un
         cabinet, que sa politique à lui laisserait voir les retirés. */
      db
        .from('patient_modules')
        .select('id, title, meta, kind, position, done_at, patient_note, consigne')
        .eq('patient_id', patientId)
        .is('archived_at', null)
        .order('position'),
      // Ce qui est fait AUJOURD'HUI, au jour de Paris (0051).
      db.from('module_completions').select('module_id').eq('patient_id', patientId).eq('jour', aujourdhui),
      db.from('affirmations').select('text, position').eq('patient_id', patientId).not('published_at', 'is', null).order('position'),
      db.from('patient_audios').select('id, listens, audio:audio_library (title, duration_seconds, meta, storage_path)').eq('patient_id', patientId),
      db.from('patients').select('scale_question, next_session').eq('id', patientId).maybeSingle(),
      db
        .from('scale_entries')
        .select('value, recorded_at')
        .eq('patient_id', patientId)
        .order('recorded_at', { ascending: false })
        .limit(NOTES_DE_LA_COURBE),
      // Ce que le patient voit de son cabinet : l'agenda et la boutique, rien
      // des clés. Un échec ici ne bloque pas le reste de l'espace.
      db.rpc('patient_cabinet_settings'),
      db
        .from('journal_pages')
        .select('id, title, body, shared, written_at, position', { count: 'exact' })
        .eq('patient_id', patientId)
        /* L'ordre choisi d'abord, la chronologie ensuite : tant que rien n'a
           été déplacé, la position est nulle partout et le journal se lit du
           plus récent au plus ancien, comme un journal. */
        .order('position', { ascending: true, nullsFirst: false })
        .order('written_at', { ascending: false })
        .range(0, pagesLues.current - 1),
      /* Les mots du cabinet, TRIÉS EN BASE (0051). On lisait vingt lignes
         sans ordre avant de trier ici : au-delà de vingt mots, le plus récent
         pouvait ne pas être dans le lot. Un échec ici ne barre pas la
         journée. */
      db.rpc('patient_mots', { p_patient: patientId, p_limite: 20 }),
      /* Ses réponses au quiz, lues dans leur table : la fonction qu'on
         appelait ici n'a jamais existé, et son échec était tu — le quiz se
         reposait vierge à chaque retour. La RLS borne la table aux exercices
         de son parcours ; la jointure la borne à SA fiche, pour un compte
         qui serait aussi membre d'un cabinet. */
      db
        .from('module_quiz_answers')
        .select('module_id, question_index, answer_index, patient_modules!inner(patient_id)')
        .eq('patient_modules.patient_id', patientId),
    ])

    const premiere = [mods.error, affs.error, auds.error, fiche.error, echelle.error].find(Boolean)
    if (premiere) {
      setErreur("Vos données n'ont pas pu être chargées. Réessayez dans un instant.")
      setChargement(false)
      return
    }

    /* FAIT AUJOURD'HUI. Les jours lus font foi ; faute de les avoir lus, la
       base tient `done_at` à l'instant du dernier jour fait — son jour de
       Paris dit la même chose, par un autre chemin. */
    const faits = faitsDuJour.error
      ? null
      : new Set(((faitsDuJour.data ?? []) as Array<{ module_id: string }>).map((f) => f.module_id))
    if (faitsDuJour.error) console.warn('[patient] jours faits illisibles', faitsDuJour.error.message)
    setModules(
      ((mods.data ?? []) as Array<Omit<PatientModuleRow, 'faitAujourdhui'>>).map((m) => ({
        ...m,
        faitAujourdhui: faits ? faits.has(m.id) : m.done_at !== null && jourDeParis(m.done_at) === aujourdhui,
      })),
    )
    /* L'échec du journal ne barre pas l'espace — les tâches du jour restent
       lisibles — mais il se dit, au lieu de passer pour un journal vide. */
    setJournalIllisible(Boolean(pages.error))
    const lues = (pages.data ?? []) as JournalPageRow[]
    setJournal(lues)
    setJournalTotal(pages.count ?? lues.length)
    if (courriers.error) {
      // Les mots déjà à l'écran y restent : un échec n'est pas « aucun mot ».
      console.warn('[patient] mots du cabinet illisibles', courriers.error.message)
    } else {
      setMots((courriers.data ?? []) as MotRow[])
    }
    setAffirmations(((affs.data ?? []) as Array<{ text: string }>).map((a) => a.text))
    setAudios((auds.data ?? []) as unknown as PatientAudioRow[])
    if (fiche.data?.scale_question) setScaleQuestion(fiche.data.scale_question)
    setProchaineSeance(fiche.data?.next_session?.trim() || null)
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

    const notes = (echelle.data ?? []) as Array<{ value: number; recorded_at: string }>
    setNotesDuSoir(notes.map((n) => ({ valeur: n.value, le: n.recorded_at })))
    const derniere = notes[0]
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
    setScaleToday(derniere && jourDeParis(derniere.recorded_at) === aujourdhui ? derniere.value : null)

    if (quiz.error) {
      /* Les réponses déjà à l'écran y restent : les effacer sur un échec de
         lecture ferait croire qu'elles n'ont jamais été données, et la
         prochaine réponse écraserait la vraie. */
      console.warn('[patient] réponses au quiz illisibles', quiz.error.message)
    } else {
      const reponses: Record<string, number> = {}
      for (const q of (quiz.data ?? []) as Array<{ module_id: string; question_index: number; answer_index: number }>) {
        reponses[`${q.module_id}:${q.question_index}`] = q.answer_index
      }
      setReponsesQuiz(reponses)
    }
    setChargement(false)
  }, [patientId])

  /**
   * Répondre à une question du quiz.
   *
   * L'écran suit tout de suite — une réponse doit se voir au doigt posé — et
   * l'écriture derrière. Si elle échoue, on retire la réponse plutôt que de
   * laisser croire qu'elle est partie : c'est ce que sa thérapeute lira sur
   * la fiche, et une bonne réponse fantôme y vaudrait un contresens.
   *
   * `upsert` sur (module, question) : se reprendre est permis, et la dernière
   * réponse est la sienne. Le cabinet de la ligne est posé par le déclencheur
   * de 0033 — il n'est jamais envoyé d'ici.
   */
  const repondreQuiz = useCallback(
    async (moduleId: string, question: number, choix: number): Promise<boolean> => {
      const db = supabase()
      if (!db) return false
      const clef = `${moduleId}:${question}`
      let avant: number | undefined
      setReponsesQuiz((prev) => {
        avant = prev[clef]
        return { ...prev, [clef]: choix }
      })
      const { error } = await db
        .from('module_quiz_answers')
        .upsert(
          { module_id: moduleId, question_index: question, answer_index: choix },
          { onConflict: 'module_id,question_index' },
        )
      if (error) {
        console.warn('[patient] réponse au quiz non enregistrée', error.message)
        setReponsesQuiz((prev) => {
          const suite = { ...prev }
          if (avant === undefined) delete suite[clef]
          else suite[clef] = avant
          return suite
        })
        return false
      }
      return true
    },
    [],
  )

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

  /**
   * Lire le lot de pages suivant.
   *
   * On relit tout plutôt que d'ajouter à la liste : le rang d'une page peut
   * avoir changé entre-temps, et deux lots lus à deux moments différents se
   * chevaucheraient ou laisseraient un trou.
   */
  const voirPlusDePages = useCallback(async () => {
    pagesLues.current += PAGES_PAR_LOT
    await recharger()
  }, [recharger])

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
    journalTotal,
    voirPlusDePages,
    journalIllisible,
    affirmations,
    audios,
    scaleToday,
    notesDuSoir,
    prochaineSeance,
    scaleQuestion,
    bookingUrl,
    bookingMode,
    bookingWidgetUrl,
    shopEnabled,
    reponsesQuiz,
    repondreQuiz,
    chargement,
    erreur,
    recharger,
  }
}
