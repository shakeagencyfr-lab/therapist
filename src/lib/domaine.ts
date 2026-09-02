/**
 * L'adresse publique des cabinets.
 *
 * Un cabinet a un identifiant court — son « slug » — et une adresse qui en
 * découle : klaroweb.site/c/son-slug. Ouverte par une patiente qui n'est pas
 * connectée, cette page porte déjà le nom et les couleurs du cabinet.
 *
 * Un chemin plutôt qu'un sous-domaine, délibérément : pas d'enregistrement
 * DNS à poser ni de certificat à émettre pour chaque cabinet, et une adresse
 * qui marche le jour même où le revendeur ouvre le cabinet.
 *
 * Le domaine change ici, et nulle part ailleurs.
 */

/** Le domaine sous lequel vivent les espaces des cabinets. */
export const DOMAINE_CABINETS = 'klaroweb.site'

/** « klaroweb.site/c/cabinet-fontaine », telle qu'on l'écrit à l'écran. */
export function adresseCabinet(slug: string): string {
  const propre = slug.trim()
  return propre ? `${DOMAINE_CABINETS}/c/${propre}` : DOMAINE_CABINETS
}

/** La même, cliquable. */
export function lienCabinet(slug: string): string {
  return `https://${adresseCabinet(slug)}`
}
