/**
 * L'échelle du soir, lue dans le temps.
 *
 * `patients.scale_delta` devait porter l'évolution — « 8 → 3 en trois
 * semaines » — et aucun code ne l'a jamais écrite : l'en-tête de la courbe
 * restait vide, le prompt du profil écrivait « Auto-évaluation suivie :
 * Envie () », et l'IA n'a jamais vu une seule note du soir. L'écart se
 * DÉDUIT des notes : il se calcule donc à l'assemblage de la fiche, au lieu
 * d'être une phrase stockée qui vieillirait dès la note suivante.
 *
 * Logique pure, sans import de l'application.
 */
import type { MesureEchelle } from '../types/domain'
import { plural } from './format'

/** Une note du soir, telle que la base la rend : sa valeur, et son instant. */
export interface NoteDuSoir {
  valeur: number
  /** Instant ISO de l'enregistrement. */
  le: string
}

/**
 * Combien de notes l'IA relit : deux semaines de soirées.
 *
 * Assez pour qu'un mouvement se voie, pas au point de noyer le dossier sous
 * des chiffres — l'écart, lui, résume toute la série.
 */
export const NOTES_RELUES_PAR_L_IA = 14

const JOUR_MS = 86_400_000

/** L'instant d'une note, ou `NaN` s'il est illisible. */
function instant(note: NoteDuSoir): number {
  return Date.parse(note.le)
}

/**
 * Le jour d'un instant, « AAAA-MM-JJ », À L'HEURE LOCALE.
 *
 * Pas la date UTC de la chaîne : une note posée à 0 h 30 à Paris est à
 * 22 h 30 UTC la veille, et la couper à dix caractères la rangerait au
 * mauvais soir. Vide si l'instant est illisible.
 */
export function jourDe(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const deux = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
}

/** Les notes lisibles, de la plus ancienne à la plus récente. */
function enOrdre(notes: readonly NoteDuSoir[]): NoteDuSoir[] {
  return notes
    .filter((n) => Number.isFinite(n.valeur))
    .slice()
    .sort((a, b) => (instant(a) || 0) - (instant(b) || 0))
}

function moyenne(notes: readonly NoteDuSoir[]): number {
  return notes.reduce((somme, n) => somme + n.valeur, 0) / notes.length
}

/** « 12 jours », « 3 semaines », « 4 mois » — vide sous un jour. */
function dureeEntre(debut: NoteDuSoir, fin: NoteDuSoir): string {
  const jours = Math.round((instant(fin) - instant(debut)) / JOUR_MS)
  if (!Number.isFinite(jours) || jours < 1) return ''
  if (jours < 14) return plural(jours, 'jour', 'jours')
  if (jours < 60) return plural(Math.round(jours / 7), 'semaine', 'semaines')
  return `${Math.round(jours / 30)} mois`
}

/**
 * L'évolution de la série, en une ligne : « 8 → 3 en 3 semaines ».
 *
 * LES PREMIÈRES CONTRE LES DERNIÈRES, EN MOYENNE. Comparer la première note
 * à la dernière, c'est confier le verdict à deux soirées : une mauvaise nuit
 * en bout de série, et la courbe a l'air de s'effondrer. On compare la
 * moyenne des premières à celle des dernières — trois de chaque côté au
 * plus, et jamais les mêmes : sur une série courte, les deux bouts ne se
 * chevauchent pas.
 *
 * AUCUN SENS DONNÉ AU MOUVEMENT. Une baisse est un progrès pour « l'envie de
 * fumer » et un recul pour « la confiance » : la ligne dit ce qui a bougé,
 * pas si c'est bien. C'est la question du soir qui le dit, et la thérapeute
 * qui le lit.
 */
export function ecartEchelle(notes: readonly NoteDuSoir[]): string {
  const serie = enOrdre(notes)
  const premiere = serie[0]
  const derniere = serie[serie.length - 1]
  if (!premiere || !derniere) return ''
  if (serie.length === 1) return `Première note : ${premiere.valeur}`

  const bout = Math.min(3, Math.floor(serie.length / 2))
  const debut = Math.round(moyenne(serie.slice(0, bout)))
  const fin = Math.round(moyenne(serie.slice(-bout)))
  const duree = dureeEntre(premiere, derniere)

  if (debut === fin) return duree ? `Stable autour de ${fin} sur ${duree}` : `Stable autour de ${fin}`
  return duree ? `${debut} → ${fin} en ${duree}` : `${debut} → ${fin}`
}

/**
 * La série datée, telle que la fiche la garde et que l'IA la relit : le jour
 * et la valeur, de la plus ancienne à la plus récente.
 */
export function mesuresDatees(notes: readonly NoteDuSoir[]): MesureEchelle[] {
  return enOrdre(notes).map((n) => ({ date: jourDe(n.le), valeur: n.valeur }))
}
