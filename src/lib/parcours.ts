/**
 * Le parcours d'un patient, tel que la thérapeute le corrige.
 *
 * Logique pure, sortie des écrans pour être éprouvée sans eux.
 */
import type { Consigne } from '@/types/domain'

/** Ce que l'éditeur de consigne laisse saisir : quatre champs, rien d'autre. */
export interface SaisieConsigne {
  duree: string
  quand: string
  why: string
  /** Les étapes, une par ligne, telles que tapées. */
  etapes: string
}

/** Une étape par ligne ; une ligne vide ne fait pas une étape. */
export function etapesDe(texte: string): string[] {
  return texte
    .split('\n')
    .map((e) => e.trim())
    .filter(Boolean)
}

/**
 * La consigne corrigée, À PARTIR DE CELLE QUI EXISTE.
 *
 * L'éditeur envoyait une consigne neuve de quatre champs, et la base
 * remplace la colonne entière : corriger une faute de frappe dans le
 * « pourquoi » d'un module de l'atelier effaçait son quiz — deux questions
 * écrites, payées, que le patient ne voyait plus. On repart donc de ce qui
 * est stocké, et on n'y remplace que ce que l'écran laisse modifier : ce
 * qu'il ne montre pas, il n'a pas à l'effacer.
 */
export function consigneCorrigee(avant: Consigne | undefined, saisie: SaisieConsigne): Consigne {
  return {
    ...avant,
    duree: saisie.duree.trim(),
    quand: saisie.quand.trim(),
    steps: etapesDe(saisie.etapes),
    why: saisie.why.trim(),
  }
}
