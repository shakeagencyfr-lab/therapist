/**
 * La courbe de ses notes du soir, vue par le patient.
 *
 * La thérapeute la lisait en séance ; celui qui la remplissait chaque soir ne
 * la voyait jamais. Elle est SOBRE à dessein : une ligne, ses points, deux
 * dates. Pas de moyenne, pas de tendance colorée en vert ou en rouge — une
 * baisse est un progrès pour « l'envie de fumer » et un recul pour « la
 * confiance » (voir src/lib/echelle.ts) : c'est à sa thérapeute d'en parler
 * avec lui, pas à un graphique de le juger.
 *
 * Logique pure, sans import de l'application.
 */
import { mesuresDatees, type NoteDuSoir } from '../lib/echelle'

/** Combien de soirées la courbe montre : deux semaines, lisibles au pouce. */
export const SOIREES_MONTREES = 14

export interface PointDeCourbe {
  x: number
  y: number
  valeur: number
  /** « AAAA-MM-JJ », le soir de la note. */
  date: string
}

/**
 * Les points de la courbe dans un cadre `largeur × hauteur`, du plus ancien
 * au plus récent. Une note haute est tracée en haut ; une marge garde les
 * points extrêmes (0 et 10) entiers dans le cadre.
 *
 * Moins de deux notes, pas de courbe : un point seul ne dit rien d'une
 * évolution, et l'écran la tait.
 */
export function courbeDuSoir(
  notes: readonly NoteDuSoir[],
  largeur = 300,
  hauteur = 80,
  n = SOIREES_MONTREES,
): PointDeCourbe[] {
  const serie = mesuresDatees(notes).slice(-n)
  if (serie.length < 2) return []
  const marge = 6
  const pas = (largeur - 2 * marge) / (serie.length - 1)
  return serie.map((m, i) => ({
    x: +(marge + i * pas).toFixed(1),
    y: +(marge + (1 - m.valeur / 10) * (hauteur - 2 * marge)).toFixed(1),
    valeur: m.valeur,
    date: m.date,
  }))
}

/**
 * Ce qu'un lecteur d'écran annonce à la place du dessin : « Vos 12 dernières
 * notes du soir, de 7 le 3 sept. à 4 le 14 sept. » — sans point final, que
 * l'abréviation du mois porte déjà.
 */
export function resumeCourbe(points: readonly PointDeCourbe[]): string {
  const premier = points[0]
  const dernier = points[points.length - 1]
  if (!premier || !dernier || points.length < 2) return ''
  return `Vos ${points.length} dernières notes du soir, de ${premier.valeur} le ${dateCourte(premier.date)} à ${dernier.valeur} le ${dateCourte(dernier.date)}`
}

/** « 3 sept. » depuis « 2026-09-03 ». Vide si la date est illisible. */
export function dateCourte(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number)
  if (!a || !m || !j) return ''
  return new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
