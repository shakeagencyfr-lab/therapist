/**
 * Les adresses des pages légales de la plateforme — et rien d'autre.
 *
 * CE MODULE N'IMPORTE RIEN. Il est lu par src/main.tsx avant tout
 * chargement, pour ne télécharger que la page légale quand c'est elle qu'on
 * ouvre ; et par les surfaces (porte, espace patient, widget, page d'un
 * cabinet) qui y renvoient. Aucune d'elles ne doit tirer le texte des pages
 * pour poser quelques liens.
 *
 * POURQUOI CES QUATRE MOTS-LÀ. La racine du domaine appartient aux cabinets
 * (klaroweb.site/son-identifiant). Une page du produit n'y vit sans risque
 * que sous un mot que la base refuse déjà comme identifiant : `confidentialite`,
 * `cgu`, `cgv` et `mentions` le sont depuis 0037 (contrainte
 * `cabinets_slug_forme`, relevée en production), et l'écran les refuse aussi
 * (CHEMINS_RESERVES). « /mentions-legales » ou « /conditions » auraient été
 * plus jolis, mais aucun des deux n'est réservé : les prendre demandait une
 * migration, et un cabinet pouvait déjà s'appeler ainsi. legal.test.ts tient
 * ces réservations.
 *
 * Ces chemins d'un seul segment sont déjà servis par index.html, sous le
 * refus d'encadrement (vercel.json) : aucune réécriture à ajouter.
 */

export type CleLegale = 'confidentialite' | 'conditions' | 'cgv' | 'mentions'

export interface LienLegal {
  cle: CleLegale
  chemin: string
  /** Le titre du document, tel qu'il se lit en pied de page. */
  libelle: string
  /** Pour les pieds étroits — le widget, l'espace patient au téléphone. */
  court: string
  /**
   * Réservé aux surfaces des professionnels : la page de vente, la porte des
   * thérapeutes, les pages légales elles-mêmes.
   *
   * LES CONDITIONS DE VENTE NE SE MONTRENT PAS AUX PATIENTS. Elles lient
   * l'éditrice et les cabinets ; une personne suivie n'achète rien à
   * l'éditrice. Posé au pied de son espace, ou de la page d'un cabinet qui a
   * sa boutique, un lien « Conditions générales de vente » se lirait comme
   * les conditions de SES achats — qui sont celles du cabinet, vendeur de sa
   * boutique. Et il ferait paraître l'éditrice sur une surface en marque
   * blanche.
   */
  pro?: boolean
}

export const LIENS_LEGAUX: readonly LienLegal[] = [
  { cle: 'confidentialite', chemin: '/confidentialite', libelle: 'Politique de confidentialité', court: 'Confidentialité' },
  { cle: 'conditions', chemin: '/cgu', libelle: 'Conditions générales d’utilisation', court: 'Conditions' },
  { cle: 'cgv', chemin: '/cgv', libelle: 'Conditions générales de vente', court: 'CGV', pro: true },
  { cle: 'mentions', chemin: '/mentions', libelle: 'Mentions légales', court: 'Mentions légales' },
]

/** Les liens d'une surface : tous chez les professionnels, sans les conditions de vente ailleurs. */
export function liensLegauxPour(pro: boolean): readonly LienLegal[] {
  return pro ? LIENS_LEGAUX : LIENS_LEGAUX.filter((l) => !l.pro)
}

/** Le chemin d'une page légale. */
export function cheminLegal(cle: CleLegale): string {
  return LIENS_LEGAUX.find((l) => l.cle === cle)?.chemin ?? '/'
}

/**
 * La page légale désignée par un chemin, ou null.
 *
 * Avec ou sans barre finale, et sans égard à la casse : une adresse recopiée
 * à la main depuis un courriel ou un papier ne doit pas tomber sur la vitrine
 * d'un cabinet — ni sur rien.
 */
export function pageLegaleDuChemin(chemin: string): CleLegale | null {
  const propre = chemin.trim().toLowerCase().replace(/\/+$/, '')
  return LIENS_LEGAUX.find((l) => l.chemin === propre)?.cle ?? null
}
