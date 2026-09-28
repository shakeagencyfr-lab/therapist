/**
 * Les couleurs de la marque d'un cabinet : une seule règle, partout.
 *
 * Elles deviennent des variables CSS (`--c-accent`, `--c-dark`…) sur l'espace
 * de la thérapeute, sur l'application des patients, sur le widget et sur la
 * page publique. Une valeur mal formée n'y lève aucune erreur : la propriété
 * devient simplement invalide, et les boutons, l'en-tête et les blocs sombres
 * deviennent transparents — sur des écrans que la personne qui a tapé
 * « #A17A4 » ne verra peut-être jamais.
 *
 * DEUX EXIGENCES, ET ELLES NE SONT PAS LES MÊMES.
 *
 *   - À l'ENREGISTREMENT, une seule forme : #RRGGBB. C'est ce que donne le
 *     sélecteur de couleur, ce que la base exige (contrainte sur `cabinets`,
 *     0048) et ce que `nuance()` sait éclaircir ou assombrir.
 *   - À l'AFFICHAGE, toute couleur hexadécimale que le CSS comprend (#rgb,
 *     #rgba, #rrggbb, #rrggbbaa), et rien d'autre. Une propriété
 *     personnalisée accepte presque n'importe quoi : une valeur du genre
 *     « red; background-image: url(https://tiers/x) » ferait charger une
 *     ressource chez un tiers. L'ancienne garde de la page publique acceptait
 *     aussi cinq et sept chiffres, que le CSS refuse — elle laissait donc
 *     passer exactement le cas qu'elle devait arrêter.
 */
import type { CSSProperties } from 'react'
import type { CabinetBranding } from '@/types/reseller'

/** Les quatre couleurs que porte une marque. */
export const CLES_COULEURS = ['accent', 'accentHover', 'accentDeep', 'dark'] as const
export type CleCouleur = (typeof CLES_COULEURS)[number]

/** Les couleurs livrées avec un cabinet neuf — le défaut de la base. */
export const COULEURS_ORIGINE: Record<CleCouleur, string> = {
  accent: '#A17A45',
  accentHover: '#856239',
  accentDeep: '#6E5230',
  dark: '#33291C',
}

/** La forme enregistrée : #RRGGBB. */
const ENREGISTRABLE = /^#[0-9a-f]{6}$/i

/** Ce que le CSS lit comme une couleur hexadécimale : 3, 4, 6 ou 8 chiffres. */
const AFFICHABLE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** La couleur peut-elle être enregistrée telle quelle ? */
export function couleurValide(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && ENREGISTRABLE.test(valeur)
}

/** Une couleur hexadécimale que le CSS comprend, ou undefined — jamais la chaîne brute. */
export function couleurSure(valeur: unknown): string | undefined {
  if (typeof valeur !== 'string') return undefined
  const propre = valeur.trim()
  return AFFICHABLE.test(propre) ? propre : undefined
}

/**
 * Les couleurs de la marque qui ne peuvent pas être publiées.
 *
 * Vide : on peut publier. Sinon, l'écran nomme ce qui cloche au lieu de
 * laisser partir une valeur qui rendrait les boutons invisibles.
 */
export function couleursInvalides(branding: Partial<CabinetBranding> | null | undefined): CleCouleur[] {
  return CLES_COULEURS.filter((cle) => !couleurValide(branding?.[cle]))
}

/** Le nom d'une couleur, tel que l'écran le dit. */
export const NOM_COULEUR: Record<CleCouleur, string> = {
  accent: "l'accent",
  accentHover: "l'accent au survol",
  accentDeep: "l'accent appuyé",
  dark: 'le sombre',
}

/**
 * Les variables CSS de la marque, pour un `style`.
 *
 * Une couleur illisible n'y entre pas : la variable n'est alors pas posée, et
 * c'est la couleur du produit qui s'applique — un bouton à la mauvaise teinte
 * se voit et se corrige, un bouton transparent ne se trouve plus.
 */
export function variablesDeMarque(
  branding: Partial<CabinetBranding> | null | undefined,
): CSSProperties | undefined {
  if (!branding) return undefined
  return {
    '--c-accent': couleurSure(branding.accent),
    '--c-accent-hover': couleurSure(branding.accentHover),
    '--c-accent-deep': couleurSure(branding.accentDeep),
    '--c-dark': couleurSure(branding.dark),
  } as CSSProperties
}

/**
 * Éclaircit ou assombrit une couleur #RRGGBB d'un facteur donné.
 *
 * L'accent choisi donne ainsi ses deux variantes, survol et appuyé. Une
 * couleur qui n'est pas au format revient telle quelle : c'est la validation,
 * pas cette fonction, qui dit qu'elle ne se publie pas.
 */
export function nuance(hex: string, facteur: number): string {
  if (!couleurValide(hex)) return hex
  const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `#${parts
    .map((v) => Math.max(0, Math.min(255, Math.round(v * facteur))))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase()
}
