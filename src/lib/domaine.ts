/**
 * L'adresse publique des cabinets.
 *
 * Un cabinet a un identifiant court — son « slug » — qui lui sert de
 * sous-domaine. Le domaine, lui, est le même pour tous : il change quand la
 * plateforme change d'adresse, et il ne doit alors changer qu'ici.
 */

/** Le domaine sous lequel vivent les espaces des cabinets. */
export const DOMAINE_CABINETS = 'klaroweb.site'

/** « cabinet-fontaine.klaroweb.site », ou le domaine seul si le slug manque. */
export function adresseCabinet(slug: string): string {
  const propre = slug.trim()
  return propre ? `${propre}.${DOMAINE_CABINETS}` : DOMAINE_CABINETS
}
