/**
 * Les adresses des pages légales de la plateforme — et rien d'autre.
 *
 * CE MODULE N'IMPORTE RIEN. Il est lu par src/main.tsx avant tout
 * chargement, pour ne télécharger que la page légale quand c'est elle qu'on
 * ouvre ; et par les trois surfaces (porte, espace patient, widget) qui y
 * renvoient. Aucune d'elles ne doit tirer le texte des pages pour poser trois
 * liens.
 *
 * POURQUOI CES TROIS MOTS-LÀ. La racine du domaine appartient aux cabinets
 * (klaroweb.site/son-identifiant). Une page du produit n'y vit sans risque
 * que sous un mot que la base refuse déjà comme identifiant : `confidentialite`,
 * `cgu` et `mentions` le sont depuis 0037 (contrainte `cabinets_slug_forme`,
 * relevée en production), et l'écran les refuse aussi (CHEMINS_RESERVES).
 * « /mentions-legales » ou « /conditions » auraient été plus jolis, mais aucun
 * des deux n'est réservé : les prendre demandait une migration, et un cabinet
 * pouvait déjà s'appeler ainsi. legal.test.ts tient ces deux réservations.
 *
 * Ces chemins d'un seul segment sont déjà servis par index.html, sous le
 * refus d'encadrement (vercel.json) : aucune réécriture à ajouter.
 */

export type CleLegale = 'confidentialite' | 'conditions' | 'mentions'

export interface LienLegal {
  cle: CleLegale
  chemin: string
  /** Le titre du document, tel qu'il se lit en pied de page. */
  libelle: string
  /** Pour les pieds étroits — le widget, l'espace patient au téléphone. */
  court: string
}

export const LIENS_LEGAUX: readonly LienLegal[] = [
  { cle: 'confidentialite', chemin: '/confidentialite', libelle: 'Politique de confidentialité', court: 'Confidentialité' },
  { cle: 'conditions', chemin: '/cgu', libelle: "Conditions d'utilisation", court: 'Conditions' },
  { cle: 'mentions', chemin: '/mentions', libelle: 'Mentions légales', court: 'Mentions légales' },
]

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
