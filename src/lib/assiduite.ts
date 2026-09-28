/**
 * La pratique de chaque jour, et ce que l'assiduité peut en dire.
 *
 * LES EXERCICES ENTRE LES SÉANCES SE REFONT CHAQUE JOUR. Respirer, s'ancrer,
 * écrire trois lignes : c'est la répétition qui fait le travail. La base
 * garde donc un jour fait par ligne (`module_completions`, 0051), au fuseau
 * de Paris — celui que vit le patient, et celui de la note du soir.
 *
 * Avant, une case cochée l'était pour toujours : l'assiduité comptait les
 * exercices « faits une fois », et un patient qui avait tout coché le
 * premier soir restait à 100 % trois semaines plus tard sans avoir rien
 * refait. Elle devient la part des jours faits sur les sept derniers.
 *
 * Logique pure, sans import de l'application.
 */
import { plural } from './format'

/** Combien de jours l'assiduité regarde en arrière. */
export const JOURS_SUIVIS = 7

/**
 * La date d'un instant dans le fuseau où la base range les jours faits et
 * les notes du soir : « AAAA-MM-JJ ».
 *
 * `fr-CA` parce que son format est précisément AAAA-MM-JJ : c'est le seul
 * moyen d'obtenir une date comparable sans reconstruire l'arithmétique des
 * fuseaux à la main — et donc de se retromper au prochain changement d'heure.
 */
export function jourDeParis(instant?: string | number | Date): string {
  const d = instant === undefined ? new Date() : new Date(instant)
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d)
}

/**
 * Le jour « AAAA-MM-JJ » décalé de `n` jours.
 *
 * Calculé en UTC sur la seule date : un jour de calendrier n'a pas d'heure,
 * et le passage à l'heure d'été ne doit pas le faire glisser d'une case.
 */
export function decalerJour(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10)
}

/** Ce qu'un exercice a donné sur la semaine. */
export interface SeptJours {
  /** Jours faits dans la fenêtre. */
  faits: number
  /**
   * Jours où il pouvait l'être : sept, ou moins pour un exercice confié
   * dans la semaine. Zéro le jour même où il est confié, tant qu'il n'est
   * pas fait.
   */
  possibles: number
}

/**
 * Les jours faits sur les sept derniers.
 *
 * AUJOURD'HUI NE COMPTE QUE S'IL EST FAIT. À neuf heures du matin, la
 * journée n'est pas finie : la compter comme manquée ferait baisser
 * l'assiduité de tout le monde chaque matin. La fenêtre est donc la semaine
 * qui finit aujourd'hui si l'exercice est fait, hier sinon.
 *
 * LE JOUR OÙ L'EXERCICE EST CONFIÉ NE COMPTE QUE S'IL EST FAIT, lui aussi :
 * donné à 19 h en fin de séance, il n'était pas manqué ce soir-là. Et un
 * exercice confié il y a trois jours ne peut pas avoir été fait sept fois —
 * lui demander « 3 jours sur 7 » le dirait en retard pour ce qui n'existait
 * pas encore.
 *
 * @param jours    les jours faits, « AAAA-MM-JJ » (l'ordre est indifférent)
 * @param confieLe le jour de Paris où l'exercice a été confié
 * @param aujourdhui le jour de Paris d'aujourd'hui
 */
export function septJours(jours: Iterable<string>, confieLe: string, aujourdhui: string): SeptJours {
  const faits = new Set(jours)
  const fin = faits.has(aujourdhui) ? aujourdhui : decalerJour(aujourdhui, -1)
  let nFaits = 0
  let possibles = 0
  for (let i = 0; i < JOURS_SUIVIS; i += 1) {
    const jour = decalerJour(fin, -i)
    if (faits.has(jour)) {
      nFaits += 1
      possibles += 1
    } else if (jour > confieLe) {
      possibles += 1
    }
  }
  return { faits: nFaits, possibles }
}

/**
 * L'assiduité, en pourcentage : les jours faits sur les jours possibles, pour
 * toutes les tâches ensemble.
 *
 * Une somme, pas une moyenne de pourcentages : un exercice confié hier (un
 * jour possible) ne pèse pas autant qu'un exercice suivi depuis une semaine.
 * Rien de mesurable encore — aucune tâche, ou toutes confiées aujourd'hui —
 * donne 0, comme une fiche sans parcours ; `mesurable` permet de ne pas y
 * voir un décrochage.
 */
export function assiduite(suivis: readonly SeptJours[]): number {
  const faits = suivis.reduce((n, s) => n + s.faits, 0)
  const possibles = suivis.reduce((n, s) => n + s.possibles, 0)
  return possibles ? Math.round((faits / possibles) * 100) : 0
}

/** Y a-t-il au moins un jour sur lequel juger ? */
export function mesurable(suivis: readonly SeptJours[]): boolean {
  return suivis.some((s) => s.possibles > 0)
}

/**
 * Une tâche en retard : il pouvait la faire, et ne l'a pas faite.
 *
 * Avec les jours, « pas faite » veut dire PAS UNE FOIS sur ses jours
 * possibles de la semaine — pas « pas encore ce matin », qui mettrait tout
 * le parcours en retard chaque jour avant midi. Sans eux (démonstration,
 * exercice tout juste ajouté depuis la séance), la case fait foi.
 */
export function tacheEnRetard(semaine: SeptJours | undefined, faitAujourdhui: boolean): boolean {
  if (faitAujourdhui) return false
  return semaine ? semaine.possibles > 0 && semaine.faits === 0 : true
}

/**
 * « fait 3 jours sur 7 », « fait 1 jour sur 2 », « tout juste confié ».
 *
 * Le dénominateur est celui des jours possibles : « 2 jours sur 7 » pour un
 * exercice confié avant-hier et fait deux fois dirait un retard qui n'existe
 * pas. Sans aucun jour possible — confié aujourd'hui, ou hier soir et pas
 * encore fait —, il n'y a rien à compter, et « 0 jour sur 0 » ne se lit pas.
 */
export function libelleSeptJours(s: SeptJours): string {
  if (s.possibles === 0) return 'tout juste confié'
  return `fait ${plural(s.faits, 'jour', 'jours')} sur ${s.possibles}`
}
