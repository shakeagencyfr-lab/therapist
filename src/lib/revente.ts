/**
 * L'arithmétique de la revente d'IA.
 *
 * Un revendeur qui fixe un prix sans connaître son coût fait un pari. Ce
 * module transforme ce que ses appels lui ont RÉELLEMENT coûté — relevé
 * appel par appel dans `ai_usage` — en un prix de revente conseillé, et dit
 * de chaque paquet quelle marge il dégage vraiment.
 *
 * Deux pièges y sont traités explicitement.
 *
 *   LE COÛT EST EN DOLLARS. Anthropic facture en dollars ; `cost_cents` est
 *   donc en centimes de dollar, et tout ce qui s'affiche en euros passe par
 *   le taux fixe de coutIA.ts.
 *
 *   LE COÛT MOYEN SE PONDÈRE. Quatre types d'action de poids très
 *   différents : un brouillon de séance coûte dix fois un jeu
 *   d'affirmations. Faire la moyenne des moyennes donnerait un chiffre faux
 *   dès que les volumes diffèrent — on pondère par le nombre d'appels.
 */
import { TAUX_EURO } from './coutIA'

/** Les quatre genres d'appel, tels que la base les nomme (enum ai_call_kind). */
export const GENRES: Record<string, string> = {
  brouillon_seance: 'Brouillon de séance',
  module: 'Module',
  affirmations: 'Affirmations',
  profil: 'Profil patiente',
}

/** Le nom lisible d'un genre, ou le genre brut si un nouveau apparaissait. */
export function nomDuGenre(kind: string): string {
  return GENRES[kind] ?? kind
}

export interface CoutConstate {
  kind: string
  appels: number
  /** Coût moyen d'un appel, en centimes de dollar. */
  moyenneCentimes: number
}

/** Centimes de dollar → euros. */
export function centimesEnEuros(centimes: number): number {
  return (centimes / 100) * TAUX_EURO
}

/**
 * Ce qu'une action coûte en moyenne au revendeur, en euros.
 *
 * `null` tant qu'aucun appel n'a été passé : on n'invente pas une moyenne
 * sur rien. L'écran affiche alors une estimation théorique plutôt qu'un
 * chiffre constaté, et le dit.
 */
export function coutMoyenEuros(couts: CoutConstate[]): number | null {
  let somme = 0
  let appels = 0
  for (const c of couts) {
    if (c.appels <= 0) continue
    somme += c.moyenneCentimes * c.appels
    appels += c.appels
  }
  if (appels === 0) return null
  return centimesEnEuros(somme / appels)
}

/** Le nombre total d'appels constatés. */
export function totalAppels(couts: CoutConstate[]): number {
  return couts.reduce((n, c) => n + Math.max(0, c.appels), 0)
}

/**
 * Le prix de revente conseillé d'un crédit, en centimes d'euro.
 *
 * Une marge de 100 % double le coût. Le résultat est arrondi au centime
 * supérieur : arrondir vers le bas ferait vendre en dessous de la marge
 * annoncée, ce qui est exactement le contraire du service rendu.
 */
export function prixConseilleCentimes(coutEuros: number, margePct: number): number {
  return Math.ceil(coutEuros * (1 + margePct / 100) * 100)
}

/**
 * La marge réelle d'un paquet, en pourcentage.
 *
 * `null` quand le coût n'est pas connu : mieux vaut ne rien afficher qu'un
 * pourcentage tiré d'une moyenne inexistante.
 */
export function margePaquet(prixCentimes: number, credits: number, coutEuros: number | null): number | null {
  if (coutEuros === null || coutEuros <= 0 || credits <= 0) return null
  const prixUnitaire = prixCentimes / 100 / credits
  return ((prixUnitaire - coutEuros) / coutEuros) * 100
}

/** Ce que le paquet rapporte au revendeur, en euros, une fois l'IA payée. */
export function beneficePaquet(prixCentimes: number, credits: number, coutEuros: number | null): number | null {
  if (coutEuros === null || credits <= 0) return null
  return prixCentimes / 100 - coutEuros * credits
}

/** « 0,047 € » — un coût unitaire mérite trois décimales, il est minuscule. */
export function euroFin(montant: number): string {
  return `${montant.toFixed(3).replace('.', ',')} €`
}

/** « +80 % » / « −12 % » */
export function pourcentage(valeur: number): string {
  const arrondi = Math.round(valeur)
  return `${arrondi > 0 ? '+' : arrondi < 0 ? '−' : ''}${Math.abs(arrondi)} %`
}
