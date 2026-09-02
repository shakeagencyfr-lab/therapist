/**
 * Ce que coûtera l'analyse d'une séance, estimé avant de la lancer.
 *
 * La thérapeute paie ces appels sur son propre compte : elle a le droit de
 * savoir ce qu'elle engage AVANT de cliquer, et sur la matière réelle — sa
 * transcription — et non sur le temps écoulé. Un chronomètre qui monte
 * pendant les silences n'estime rien : il annonce une dépense qui n'aura pas
 * lieu.
 *
 * Ce module ne sait rien du serveur et n'appelle rien : c'est de
 * l'arithmétique sur du texte, éprouvée par ses tests. Les constantes qui
 * viennent d'ailleurs — le tarif, le gabarit du prompt, le plafond de sortie —
 * portent chacune l'endroit d'où elles sortent, et un test côté serveur
 * vérifie que le gabarit n'a pas dérivé.
 */

/** Le modèle qui rédige les brouillons (server/ai.ts, CLAUDE_MODEL). */
export const MODELE_ANALYSE = 'claude-opus-5'

/** Son tarif, en dollars par million de jetons (server/ai.ts, TARIFS). */
export const TARIF = { entree: 5, sortie: 25 }

/**
 * Taux de conversion, fixe et volontairement grossier.
 *
 * Anthropic facture en dollars ; le reste de l'application parle en euros.
 * Suivre un taux réel demanderait un service de change pour un chiffre qui
 * n'a besoin que d'être du bon ordre de grandeur.
 */
export const TAUX_EURO = 0.92

/**
 * Caractères par jeton, en français.
 *
 * Approximation assumée : le vrai découpage dépend du tokeniseur du modèle,
 * qu'on ne peut pas exécuter dans un navigateur. Compter les caractères vaut
 * mieux que compter les mots — « anticonstitutionnellement » et « à » ne
 * pèsent pas pareil.
 */
const CARACTERES_PAR_JETON = 3.8

/**
 * Le gabarit du prompt de séance : consigne système et consignes de sortie,
 * sans la transcription (server/prompts.ts, 2 402 caractères mesurés).
 * server/prompts.test.ts échoue si ce chiffre s'éloigne de la réalité.
 */
export const JETONS_GABARIT = 633

/** Plafond de sortie du brouillon de séance (maxTokens, server/ai.ts). */
export const PLAFOND_SORTIE = 3000

/** Jetons d'un texte, arrondis au supérieur. */
export function jetonsDe(texte: string): number {
  return Math.ceil(texte.length / CARACTERES_PAR_JETON)
}

export interface Estimation {
  /** Jetons envoyés : gabarit, transcription et notes. */
  entree: number
  /** Jetons attendus en retour. */
  sortie: number
  /** Coût attendu, en euros. */
  euros: number
  /** Ce qu'il ne dépassera pas : la sortie bute sur son plafond. */
  eurosMax: number
}

/** Le coût d'un appel, en euros, aux tarifs ci-dessus. */
function euros(entree: number, sortie: number): number {
  return ((entree * TARIF.entree + sortie * TARIF.sortie) / 1_000_000) * TAUX_EURO
}

/**
 * L'estimation pour un brouillon de séance.
 *
 * La sortie ne suit pas l'entrée proportionnellement : le brouillon a des
 * rubriques de taille à peu près fixe — synthèse, induction, questions — et
 * s'allonge un peu avec la matière avant de buter sur son plafond. D'où une
 * base et une pente modeste, plutôt qu'une règle de trois qui surestimerait
 * grossièrement les séances longues.
 */
export function estimationBrouillon(transcript: string, notes = ''): Estimation {
  const matiere = jetonsDe(transcript) + jetonsDe(notes)
  if (matiere === 0) return { entree: 0, sortie: 0, euros: 0, eurosMax: 0 }
  const entree = JETONS_GABARIT + matiere
  const sortie = Math.min(PLAFOND_SORTIE, Math.round(700 + matiere * 0.2))
  return {
    entree,
    sortie,
    euros: euros(entree, sortie),
    eurosMax: euros(entree, PLAFOND_SORTIE),
  }
}
