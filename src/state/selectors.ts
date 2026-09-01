/**
 * Sélecteurs partagés : tout ce qui se déduit de l'état, et qui est utilisé
 * par plus d'un écran.
 *
 * Les fiches sont lues dans l'état (state.patients), jamais importées : selon
 * qu'un compte est connecté ou non, ce sont celles du cabinet ou celles de la
 * démonstration, et rien ici n'a besoin de le savoir.
 */
import type { AppState } from './state'
import type { Patient, PatientId, PatientModule, PsychProfile } from '@/types/domain'

/** Fiche du patient sélectionné. */
export function patientOf(state: AppState): Patient {
  return state.patients[state.sel]
}

/** Modules du programme + modules ajoutés depuis la séance ou l'atelier. */
export function allModules(state: AppState, key: PatientId): PatientModule[] {
  return state.patients[key].modules.concat(state.extra[key] ?? [])
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

/** Nombre de modules réalisés sur le total, pour un patient. */
export function moduleProgress(state: AppState, key: PatientId): { done: number; total: number } {
  const mods = allModules(state, key)
  return {
    done: mods.filter((m, i) => isModuleDone(state, key, i, m.done)).length,
    total: mods.length,
  }
}

/**
 * Profil affiché : la version actualisée par l'IA si elle existe, sinon
 * celle du dossier.
 */
export function profileOf(state: AppState, key: PatientId): PsychProfile {
  return state.profNew[key] ?? state.patients[key].profile
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
  const p = state.patients[key]
  const fresh = !!state.profNew[key]
  const sessions = (p.sessions || 0) + (fresh ? 1 : 0)
  const margin = Math.max(3, Math.round(26 - sessions * 3))
  const maturity =
    sessions <= 1
      ? 'Ébauche'
      : sessions <= 3
        ? 'Se précise'
        : sessions < p.totalSessions
          ? 'Consolidé'
          : 'Stabilisé'
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

/** Couleur de la pastille d'assiduité. */
export function riskColor(adherence: number): string {
  return adherence < 50
    ? 'var(--c-risk-high)'
    : adherence < 75
      ? 'var(--c-risk-mid)'
      : 'var(--c-risk-low)'
}

/** Patients de la barre latérale, filtrés par la recherche. */
export function sidebarPatients(state: AppState): Array<{ id: PatientId; patient: Patient }> {
  const query = state.q.trim().toLowerCase()
  return state.patientOrder.filter((k) => {
    if (!query) return true
    /* Le prototype cherche dans le nom ET le sous-titre : le programme et la
       semaine (« Liberté · semaine 3 / 6 ») sont donc des critères valides. */
    const haystack = `${state.patients[k].name} ${state.patients[k].subtitle}`.toLowerCase()
    return haystack.includes(query)
  }).map((k) => ({ id: k, patient: state.patients[k] }))
}

/** Patients qui décrochent : moins de 50 % de modules réalisés. */
export function slippingPatients(state: AppState): PatientId[] {
  return state.patientOrder.filter((k) => {
    const { done, total } = moduleProgress(state, k)
    return total > 0 && done / total < 0.5
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
export function notifRows(state: AppState): NotifRow[] {
  const progs = Object.keys(state.nProgs).filter((k) => state.nProgs[k])
  const sits = Object.keys(state.nSits).filter((k) => state.nSits[k])

  return state.patientOrder.map((k) => {
    const d = state.patients[k]
    const mods = allModules(state, k)
    const late = mods.filter((m, i) => !isModuleDone(state, k, i, m.done)).length
    const noNext = d.nextSession.indexOf('Aucune') === 0
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
  return state.patients[key].scale.concat(state.scaleLog[key] ?? [])
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
