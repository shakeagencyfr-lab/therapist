/**
 * Quand part une notification.
 *
 * Deux choses vivent côte à côte, et c'est voulu. Le LIBELLÉ, « Ce soir,
 * 20 h », est ce que la thérapeute lit et reconnaît. L'HORODATAGE est ce
 * qui décide de l'envoi. Un libellé seul ne s'ordonne pas ; un horodatage
 * seul ne se lit pas.
 *
 * Les trois raccourcis couvrent la quasi-totalité des envois. La date
 * précise existe pour le reste : un rappel la veille d'un rendez-vous, un
 * message de rentrée, un mot le jour d'un anniversaire de sevrage.
 */

export const RACCOURCIS = ['Maintenant', 'Ce soir, 20 h', 'Demain, 8 h'] as const
export type Raccourci = (typeof RACCOURCIS)[number]

/** Le moment réel visé par un raccourci, calculé à l'instant du clic. */
export function momentDuRaccourci(raccourci: string, maintenant: Date = new Date()): Date {
  const d = new Date(maintenant)
  switch (raccourci) {
    case 'Ce soir, 20 h': {
      d.setHours(20, 0, 0, 0)
      // Passé 20 h, « ce soir » est derrière nous : c'est demain soir.
      if (d.getTime() <= maintenant.getTime()) d.setDate(d.getDate() + 1)
      return d
    }
    case 'Demain, 8 h': {
      d.setDate(d.getDate() + 1)
      d.setHours(8, 0, 0, 0)
      return d
    }
    default:
      return d
  }
}

/**
 * Le libellé d'un moment choisi à la main : « mardi 9 septembre, 14 h 30 ».
 *
 * On écrit l'heure comme on la dit en français — « 14 h » sans minutes quand
 * il n'y en a pas, « 14 h 30 » sinon.
 */
export function libelleDuMoment(quand: Date): string {
  const jour = quand.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const h = quand.getHours()
  const m = quand.getMinutes()
  return `${jour}, ${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`
}

/**
 * Lit la valeur d'un champ `datetime-local`.
 *
 * Rend `null` sur une saisie vide ou incomplète : le navigateur laisse
 * volontiers passer une date à moitié tapée, et une notification programmée
 * pour « Invalid Date » ne partirait jamais sans que personne le sache.
 */
export function momentSaisi(valeur: string): Date | null {
  if (!valeur) return null
  const d = new Date(valeur)
  return Number.isNaN(d.getTime()) ? null : d
}

/** La valeur d'un champ `datetime-local`, dans l'heure locale du navigateur. */
export function valeurChamp(quand: Date): string {
  const deuxChiffres = (n: number) => String(n).padStart(2, '0')
  return (
    `${quand.getFullYear()}-${deuxChiffres(quand.getMonth() + 1)}-${deuxChiffres(quand.getDate())}` +
    `T${deuxChiffres(quand.getHours())}:${deuxChiffres(quand.getMinutes())}`
  )
}
