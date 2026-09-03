/**
 * Déplacer une page dans une liste, au doigt.
 *
 * Toute la difficulté d'un glisser-déposer tient dans une question : à quel
 * rang la page est-elle rendue quand le doigt est ICI ? Le reste — capturer
 * le pointeur, suivre le mouvement, écrire en base — est de la plomberie.
 * Cette question-là est du calcul, et le calcul se teste, ce qui évite de
 * vérifier au doigt sur un téléphone à chaque changement.
 */

/** Le rectangle d'une page dans la liste, tel que le navigateur le donne. */
export interface Boite {
  haut: number
  hauteur: number
}

/**
 * Le rang visé, le doigt étant à `y`.
 *
 * On compare le CENTRE de la page déplacée au centre de chacune des autres :
 * comparer les bords ferait sauter la page d'un rang dès qu'elle effleure sa
 * voisine, et l'ordre changerait sous le doigt sans qu'on l'ait voulu.
 *
 * La boîte de la page déplacée est exclue de la comparaison — elle bouge avec
 * le doigt, se comparer à soi-même n'apprend rien.
 */
export function rangVise(depart: number, centre: number, boites: Boite[]): number {
  let rang = 0
  for (let i = 0; i < boites.length; i++) {
    if (i === depart) continue
    const milieu = boites[i].haut + boites[i].hauteur / 2
    // Une page dont le milieu est au-dessus du doigt est passée derrière nous.
    if (milieu < centre) rang++
  }
  return Math.max(0, Math.min(boites.length - 1, rang))
}

/** Sort l'élément de `depart` et le remet à `arrivee`. */
export function deplacer<T>(liste: T[], depart: number, arrivee: number): T[] {
  if (depart === arrivee || depart < 0 || depart >= liste.length) return liste
  const copie = liste.slice()
  const [pris] = copie.splice(depart, 1)
  copie.splice(Math.max(0, Math.min(copie.length, arrivee)), 0, pris)
  return copie
}
