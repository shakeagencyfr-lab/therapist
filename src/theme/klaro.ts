/**
 * La marque Klaro : ses fichiers et ses couleurs, en un seul endroit.
 *
 * ELLE NE SE MONTRE QUE CHEZ ELLE. La page d'accueil, la porte des
 * praticiennes, les pages légales, la porte d'un espace dont on ne connaît
 * pas encore le cabinet. Jamais sur la page publique d'un cabinet, ni dans
 * l'espace de ses patients, ni sur les icônes de leur écran d'accueil : la
 * marque blanche est ce que les cabinets paient. C'est aussi pourquoi l'icône
 * d'onglet n'est pas écrite dans index.html, servi identique à tous les
 * domaines : elle est posée par les pages Klaro (useIconeKlaro).
 *
 * LES FICHIERS (public/marque/) sont vectorisés depuis le logo fourni le
 * 29 septembre 2026 — tracé potrace, suréchantillonné trois fois — dans l'or
 * de la marque, #DBAA59.
 *
 * LES COULEURS. L'or de la marque ne tient que 1,9:1 sur le fond crème : il
 * habille (logo, filets, pastilles, boutons à texte sombre), il n'écrit pas.
 * Les textes, liens et boutons à texte clair prennent un or profond de la
 * même teinte, éprouvé à 4,5:1 au moins (src/vente/contraste.test.ts).
 */
import type { CSSProperties } from 'react'

export const KLARO = {
  nom: 'Klaro',
  /** Le K seul : l'en-tête, la porte, l'onglet. */
  monogramme: '/marque/klaro-monogramme.svg',
  /** « Klaro », dont le K porte ses feuilles : les bandeaux. */
  logotype: '/marque/klaro-logotype.svg',
  /** Le K au-dessus du nom : les grandes surfaces. */
  logo: '/marque/klaro-logo.svg',
  icone: '/marque/klaro-icone.svg',
  iconePng: '/marque/klaro-icone-48.png',
  iconeEcranAccueil: '/marque/klaro-icone-180.png',
  imagePartage: '/marque/klaro-partage.png',
} as const

/** La palette de la planche de marque, et ses dérivés lisibles. */
export const COULEURS_KLARO = {
  /** L'or de la marque (planche : « primary »). Décor seulement. */
  or: '#dbaa59',
  /** Or profond : texte, liens, boutons à texte clair (5,2:1 sur le crème). */
  accent: '#8c6520',
  accentHover: '#76551a',
  /** Or le plus appuyé : surtitres et liens (6,2:1 sur le crème). */
  accentDeep: '#6f5019',
  accentSoft: '#f3e3c3',
  accentSoft2: '#f7ecd6',
  accentTint: '#fbf3e3',
} as const

/**
 * Les variables CSS de la marque Klaro, à poser sur la racine d'une page
 * Klaro : les jetons du produit (--c-accent…) y prennent l'or.
 */
export function variablesKlaro(): CSSProperties {
  return {
    '--c-accent': COULEURS_KLARO.accent,
    '--c-accent-hover': COULEURS_KLARO.accentHover,
    '--c-accent-deep': COULEURS_KLARO.accentDeep,
    '--c-accent-soft': COULEURS_KLARO.accentSoft,
    '--c-accent-soft-2': COULEURS_KLARO.accentSoft2,
    '--c-accent-tint': COULEURS_KLARO.accentTint,
    '--c-or': COULEURS_KLARO.or,
  } as CSSProperties
}

/**
 * Le logo d'une carte de porte : celui du cabinet quand il en a un, sinon —
 * sur la porte de Klaro seulement — le monogramme. Un cabinet sans logo
 * garde ses initiales : jamais le K de son fournisseur.
 */
export function logoDePorte(cabinet: string, logoUrl: string | null | undefined): string | null {
  if (logoUrl) return logoUrl
  return cabinet === KLARO.nom ? KLARO.monogramme : null
}
