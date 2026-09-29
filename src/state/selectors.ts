/**
 * Sélecteurs partagés : tout ce qui se déduit de l'état, et qui est utilisé
 * par plus d'un écran.
 *
 * Les fiches sont lues dans l'état (state.patients), jamais importées : selon
 * qu'un compte est connecté ou non, ce sont celles du cabinet ou celles de la
 * démonstration, et rien ici n'a besoin de le savoir.
 */
import { seFaitParLePatient } from '@/lib/typesDeModules'
import { mesurable, tacheEnRetard } from '@/lib/assiduite'
import { parProchaineSeance, sansProchaineSeance } from '@/lib/agenda'
import type { AppState } from './state'
import type { Patient, PatientId, PatientModule, PsychProfile } from '@/types/domain'

/**
 * Fiche du patient sélectionné.
 *
 * Peut être absente : un cabinet qui vient d'ouvrir n'a aucune fiche, et
 * c'est son état normal, pas un cas limite. Les écrans doivent le prévoir.
 */
export function patientOf(state: AppState): Patient | undefined {
  return state.patients[state.sel]
}

/** Modules du programme + modules ajoutés depuis la séance ou l'atelier. */
export function allModules(state: AppState, key: PatientId): PatientModule[] {
  const fiche = state.patients[key]
  return (fiche?.modules ?? []).concat(state.extra[key] ?? [])
}

/** État coché d'un module : la valeur locale l'emporte sur celle du programme. */
export function isModuleDone(state: AppState, key: PatientId, index: number, fallback: boolean): boolean {
  const local = state.done[`${key}:${index}`]
  return local === undefined ? fallback : local
}

/** Correctif d'état inversant la case d'un module. */
export function toggleModulePatch(key: PatientId, index: number, fallback: boolean) {
  const id = `${key}:${index}`
  return (prev: AppState): Partial<AppState> => ({
    done: { ...prev.done, [id]: !(prev.done[id] === undefined ? fallback : prev.done[id]) },
  })
}

/**
 * Rendre la case au dossier.
 *
 * La valeur locale l'emporte sur celle de la base — c'est ce qui fait tenir
 * la case pendant l'aller-retour du réseau. Mais elle ne s'effaçait jamais :
 * une fois la thérapeute ayant coché un exercice, l'écran gardait SON avis
 * pour toute la session, et ce que le patient faisait ensuite — le cocher,
 * le décocher — n'apparaissait plus. Le correctif est provisoire par nature :
 * il se retire dès que la base a répondu, dans un sens comme dans l'autre.
 */
export function releaseModulePatch(key: PatientId, index: number) {
  const id = `${key}:${index}`
  return (prev: AppState): Partial<AppState> => {
    if (prev.done[id] === undefined) return {}
    const done = { ...prev.done }
    delete done[id]
    return { done }
  }
}

/**
 * Nombre de tâches faites AUJOURD'HUI sur le total, pour un patient.
 *
 * La case d'un module dit « fait aujourd'hui » : chaque jour se coche
 * (0051). La semaine se lit ailleurs — l'assiduité, et « fait N jours sur 7 ».
 *
 * Les tâches seulement : un module « Audio » ou « Échelle » ne s'affiche
 * jamais comme tel chez le patient et ne peut pas être coché
 * (src/lib/typesDeModules.ts). Compté, il faisait baisser l'assiduité et
 * déclenchait l'alerte de décrochage pour ce que personne ne lui a montré.
 * Le rang, lui, reste celui de la liste entière : c'est la clé des cases
 * cochées localement.
 */
export function moduleProgress(state: AppState, key: PatientId): { done: number; total: number } {
  const taches = allModules(state, key)
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => seFaitParLePatient(m.kind))
  return {
    done: taches.filter(({ m, i }) => isModuleDone(state, key, i, m.done)).length,
    total: taches.length,
  }
}

/**
 * Profil affiché : la version actualisée par l'IA si elle existe, sinon
 * celle du dossier.
 */
export function profileOf(state: AppState, key: PatientId): PsychProfile | undefined {
  return state.profNew[key] ?? state.patients[key]?.profile
}

/**
 * Règle de précision du profil psychologique — le cœur du composant.
 * Après une actualisation, une séance de plus est comptée : la bande
 * d'incertitude se resserre et le palier de maturité peut changer.
 */
export interface ProfilePrecision {
  sessions: number
  /** Marge en points, ± autour de la valeur d'un axe. */
  margin: number
  maturity: 'Ébauche' | 'Se précise' | 'Consolidé' | 'Stabilisé'
  /** « Consolidé · 4 séances » */
  label: string
  /** Le profil affiché vient d'une actualisation IA. */
  fresh: boolean
}

export function profilePrecision(state: AppState, key: PatientId): ProfilePrecision {
  const p = state.patients[key] ?? { sessions: 0, totalSessions: 0 }
  /*
   * Le « +1 » d'une actualisation IA ne vaut QUE tant que la séance n'est pas
   * versée au dossier. Le profil est tiré de la séance en cours, que le
   * compteur ne connaît pas encore : on l'ajoute donc à la main.
   *
   * Dès l'envoi de la séance, le compteur la connaît — et `profNew` est vidé
   * au même moment. Sans cela le badge annonçait « 2 séances » à un patient
   * qui n'en avait fait qu'une : la séance était comptée deux fois.
   */
  const fresh = !!state.profNew[key]
  const sessions = (p.sessions || 0) + (fresh ? 1 : 0)
  const margin = Math.max(3, Math.round(26 - sessions * 3))
  const maturity =
    sessions <= 1
      ? 'Ébauche'
      : sessions <= 3
        ? 'Se précise'
        : // « Stabilisé » veut dire « le suivi prévu est allé à son terme ».
          // Sans nombre de séances prévu, ce terme n'existe pas : on ne peut
          // pas l'avoir atteint.
          p.totalSessions > 0 && sessions >= p.totalSessions
          ? 'Stabilisé'
          : 'Consolidé'
  return {
    sessions,
    margin,
    maturity,
    label: `${maturity} · ${sessions} ${sessions > 1 ? 'séances' : 'séance'}`,
    fresh,
  }
}

/** Bornes de la bande d'incertitude d'un axe, en pourcentage. */
export function axisBand(value: number, margin: number): { lo: number; hi: number } {
  return { lo: Math.max(0, value - margin), hi: Math.min(100, value + margin) }
}

/**
 * Correctif d'état remettant la captation de séance à zéro.
 *
 * Une séance appartient à une fiche : en changer, c'est en recommencer une.
 * Tout ce qu'une captation accumule — consentement, minuteur, transcription,
 * notes, brouillon — repart donc d'ici, sans qu'un écran ait à énumérer les
 * champs et à en oublier un.
 */
export function nouvelleSeance(patient: PatientId = ''): Partial<AppState> {
  return {
    sessionPatient: patient,
    sessionId: null,
    consent: false,
    sansEnregistrement: false,
    recording: false,
    elapsed: 0,
    transcript: '',
    interim: '',
    notice: '',
    sessionNotes: '',
    generating: false,
    draft: null,
    draftMaquette: false,
    syntheseOk: false,
    proposalOff: {},
    sent: false,
    msgOk: false,
    msgEnvoye: '',
    sugOff: {},
    sugSent: '',
  }
}

/** Couleur de la pastille d'assiduité. */
export function riskColor(adherence: number): string {
  return adherence < 50
    ? 'var(--c-risk-high)'
    : adherence < 75
      ? 'var(--c-risk-mid)'
      : 'var(--c-risk-low)'
}

/**
 * Patients de la barre latérale, filtrés par la recherche — et, au choix,
 * réduits à ceux qui n'ont pas de prochaine séance, ou rangés par prochaine
 * séance (0059). Les deux se lisent sur la VRAIE date : src/lib/agenda.ts.
 */
export function sidebarPatients(
  state: AppState,
  maintenant: Date = new Date(),
): Array<{ id: PatientId; patient: Patient }> {
  const query = state.q.trim().toLowerCase()
  const rows = state.patientOrder.filter((k) => {
    if (state.pSansSeance && !sansProchaineSeance(state.patients[k], maintenant)) return false
    if (!query) return true
    /* Le prototype cherche dans le nom ET le sous-titre : le programme et la
       semaine (« Liberté · semaine 3 / 6 ») sont donc des critères valides. */
    const haystack = `${state.patients[k].name} ${state.patients[k].subtitle}`.toLowerCase()
    return haystack.includes(query)
  }).map((k) => ({ id: k, patient: state.patients[k], prochaineSeanceLe: state.patients[k].prochaineSeanceLe }))
  return (state.pParSeance ? parProchaineSeance(rows, maintenant) : rows).map(({ id, patient }) => ({ id, patient }))
}

/**
 * Patients qui décrochent : moins de la moitié des jours faits sur la semaine.
 *
 * CHAQUE JOUR SE COCHE (0051). Compter les cases du jour mettait tout le
 * monde en décrochage chaque matin, avant qu'il ait eu le temps de rien
 * faire : c'est l'assiduité — les jours faits sur les sept derniers
 * (src/lib/assiduite.ts) — qui le dit. Les tâches seules : une fiche dont le
 * parcours n'a qu'un audio ou une échelle n'a rien à décrocher. Et une fiche
 * dont aucun exercice n'a encore eu un jour possible — tout vient d'être
 * confié — n'a pas pu décrocher non plus. Sur la démonstration, sans jours,
 * l'assiduité est celle que porte la fiche.
 */
export function slippingPatients(state: AppState): PatientId[] {
  return state.patientOrder.filter((k) => {
    const taches = allModules(state, k).filter((m) => seFaitParLePatient(m.kind))
    if (!taches.length) return false
    const semaines = taches.flatMap((m) => (m.septJours ? [m.septJours] : []))
    if (semaines.length === taches.length && !mesurable(semaines)) return false
    return (state.patients[k]?.adherence ?? 0) < 50
  })
}

/** Une situation retenue par les filtres de notification. */
export type NotifSituation =
  | 'Modules en retard'
  | 'Sans prochaine séance'
  | "Peu d'écoutes"
  | 'Courbe qui stagne'

export const NOTIF_SITUATIONS: NotifSituation[] = [
  'Modules en retard',
  'Sans prochaine séance',
  "Peu d'écoutes",
  'Courbe qui stagne',
]

export interface NotifRow {
  key: PatientId
  name: string
  initials: string
  /** « Liberté · assiduité 86 % · 2 modules en retard » */
  reason: string
  /** Le patient passe les filtres actifs. */
  on: boolean
}

/**
 * Destinataires calculés en direct à partir des filtres. Les faits viennent
 * de ce que l'application sait déjà : programme, assiduité, modules en
 * retard, rendez-vous manquant, écoutes, courbe plate.
 */
export function notifRows(state: AppState, maintenant: Date = new Date()): NotifRow[] {
  const progs = Object.keys(state.nProgs).filter((k) => state.nProgs[k])
  const sits = Object.keys(state.nSits).filter((k) => state.nSits[k])

  return state.patientOrder.map((k) => {
    const d = state.patients[k]
    const mods = allModules(state, k)
    // Une tâche en retard est une tâche qu'il pouvait faire — et qu'il n'a
    // pas faite de la semaine, pas seulement pas encore ce matin.
    const late = mods.filter(
      (m, i) => seFaitParLePatient(m.kind) && tacheEnRetard(m.septJours, isModuleDone(state, k, i, m.done)),
    ).length
    // Sur la vraie date (0059) ; la démonstration, qui n'a que du texte, se lit sur son texte.
    const noNext = sansProchaineSeance(d, maintenant)
    const tail = d.scale.slice(-3)
    const flat = tail.length === 3 && tail[0] === tail[2]

    const facts: Record<string, boolean> = {
      'Modules en retard': late > 0,
      'Sans prochaine séance': noNext,
      "Peu d'écoutes": d.listens < 3,
      'Courbe qui stagne': flat,
    }

    const okProg = !progs.length || progs.some((pg) => d.program.indexOf(pg) > -1)
    const okAdh =
      state.nAdh === 'all' ||
      (state.nAdh === 'low' && d.adherence < 50) ||
      (state.nAdh === 'mid' && d.adherence >= 50 && d.adherence < 75) ||
      (state.nAdh === 'high' && d.adherence >= 75)
    const okSit = !sits.length || sits.every((s) => facts[s])

    const reasons = [d.program.replace('Programme ', ''), `assiduité ${d.adherence} %`]
    if (facts['Modules en retard']) {
      reasons.push(`${late} ${late > 1 ? 'modules en retard' : 'module en retard'}`)
    }
    if (facts['Sans prochaine séance']) reasons.push('sans rendez-vous')

    return {
      key: k,
      name: d.name,
      initials: d.initials,
      reason: reasons.join(' · '),
      on: okProg && okAdh && okSit,
    }
  })
}

/** Série de l'auto-évaluation : programme + valeurs saisies dans la session. */
export function scaleSeries(state: AppState, key: PatientId): number[] {
  return (state.patients[key]?.scale ?? []).concat(state.scaleLog[key] ?? [])
}

/**
 * Points d'une polyligne SVG pour une série 0–10, dans le repère 300 × 90
 * de la courbe d'auto-évaluation (une valeur haute est tracée en haut).
 */
export function chartPoints(
  values: number[],
  width = 300,
): Array<{ x: number; y: number }> {
  const stepX = values.length > 1 ? width / (values.length - 1) : width
  return values.map((v, i) => ({
    x: +(i * stepX).toFixed(1),
    y: +(86 - (v / 10) * 80).toFixed(1),
  }))
}

/** Attribut `points` d'un `<polyline>`. */
export function polylinePoints(points: Array<{ x: number; y: number }>): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ')
}
