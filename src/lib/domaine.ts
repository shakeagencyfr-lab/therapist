/**
 * L'adresse publique des cabinets.
 *
 * Un cabinet a un identifiant court — son « slug » — et une adresse qui en
 * découle : klaroweb.site/son-slug. Ouverte par un patient qui n'est pas
 * connecté, cette page porte déjà le nom et les couleurs du cabinet.
 *
 * Un chemin plutôt qu'un sous-domaine, délibérément : pas d'enregistrement
 * DNS à poser ni de certificat à émettre pour chaque cabinet, et une adresse
 * qui marche le jour même où le revendeur ouvre le cabinet.
 *
 * À LA RACINE, ET PLUS SOUS /c/. Une adresse s'imprime sur une carte de
 * visite ; le préfixe technique y disait le fournisseur, ce qu'une marque
 * blanche est censée taire. Les anciennes adresses redirigent à demeure.
 *
 * Le domaine change ici, et nulle part ailleurs.
 */

/** Le domaine sous lequel vivent les espaces des cabinets. */
export const DOMAINE_CABINETS = 'klaroweb.site'

/** « klaroweb.site/cabinet-fontaine », telle qu'on l'écrit à l'écran. */
export function adresseCabinet(slug: string): string {
  const propre = slug.trim()
  return propre ? `${DOMAINE_CABINETS}/${propre}` : DOMAINE_CABINETS
}

/** La même, cliquable. */
export function lienCabinet(slug: string): string {
  return `https://${adresseCabinet(slug)}`
}

/**
 * L'adresse de l'espace patient d'un cabinet, sur notre domaine.
 *
 * C'est celle qu'une thérapeute sans domaine à elle donne à ses patients :
 * elle ouvre la même application que `/mon`, avec SA marque sur la porte. Le
 * domaine personnalisé reste l'option supérieure ; celle-ci ne coûte rien et
 * ne demande aucun réglage.
 */
export function adresseEspacePatient(slug: string): string {
  const propre = slug.trim()
  return propre ? `${DOMAINE_CABINETS}/${propre}/mon` : `${DOMAINE_CABINETS}/mon`
}

/** La même, cliquable. */
export function lienEspacePatient(slug: string): string {
  return `https://${adresseEspacePatient(slug)}`
}

/** L'adresse du widget de connexion, celle qu'un site tiers encadre. */
export function lienEmbed(slug: string): string {
  return `https://${DOMAINE_CABINETS}/e/${slug.trim()}`
}

/**
 * Le code que la thérapeute colle sur son propre site.
 *
 * Un iframe et rien d'autre : pas de script à charger, donc rien à mettre à
 * jour chez elle le jour où Klaro change, et rien qui puisse lire la page
 * qui l'accueille.
 */
export function codeEmbed(slug: string): string {
  return [
    '<!-- Espace patient — Klaro -->',
    `<iframe src="${lienEmbed(slug)}"`,
    '        title="Accès à votre espace"',
    '        width="100%" height="360" loading="lazy"',
    '        style="border:0;max-width:420px;"></iframe>',
  ].join('\n')
}
