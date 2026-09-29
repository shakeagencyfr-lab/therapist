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

/**
 * Le tarif de l'analyse qui rédige brouillons et hypnoses, en dollars par
 * million de jetons (server/ai.ts, REGLAGES et TARIFS). Le nom du modèle
 * n'a rien à faire à l'écran ni ici : la thérapeute paie un prix, pas une
 * référence technique.
 */
export const TARIF = { entree: 4, sortie: 20 }

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

/**
 * Ce qu'un brouillon envoie avant la moindre matière, MESURÉ.
 *
 * Le gabarit du prompt n'en fait que 633. Les brouillons réellement facturés
 * (table ai_usage, septembre 2026) en montrent bien plus : 2 388 jetons
 * envoyés pour 259 caractères de transcription, 2 630 pour 879 — soit 2 320
 * à 2 400 jetons avant tout mot du patient. Le reste vient de ce que l'appel
 * ajoute autour du prompt (schéma de sortie imposé, consignes de format), que
 * l'API facture aussi. On retient le haut de la fourchette : sous-estimer
 * est ce qui a été reproché à ce calcul.
 */
export const JETONS_FIXES_BROUILLON = 2_400

/**
 * Ce qu'un brouillon rend, au moins, MESURÉ.
 *
 * Les cinq brouillons facturés ont rendu de 1 884 à 2 535 jetons,
 * raisonnement compris, pour des matières de quelques centaines de mots :
 * la sortie ne dépend presque pas de la longueur de la séance. Base prise en
 * haut de la fourchette, pente modeste au-dessus — et le plafond borne tout.
 */
export const SORTIE_BASE_BROUILLON = 2_500

/**
 * Plafond de sortie du brouillon de séance (maxTokens, server/ai.ts).
 *
 * Il valait 3 000 quand le serveur en accordait déjà 4 000 : `eurosMax`, que
 * l'écran présente comme un maximum, en annonçait donc un quart de moins que
 * ce que l'appel pouvait réellement coûter. Un plafond faux vaut moins
 * qu'aucun plafond, puisqu'on s'y fie. `coutIA.test.ts` relit désormais le
 * chiffre dans server/ai.ts.
 */
export const PLAFOND_SORTIE = 6000

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
 *
 * RECALÉE SUR LES APPELS FACTURÉS. L'ancienne formule — gabarit seul en
 * entrée, 700 jetons de base en sortie — avait été posée avant qu'aucun
 * appel n'existe : elle ignorait ce que l'appel ajoute autour du prompt et
 * les jetons de raisonnement, facturés au tarif de sortie. La thérapeute
 * voyait entre le tiers et la moitié du prix réel : 0,02 € annoncé pour un
 * brouillon facturé 0,07 €.
 * Les constantes viennent maintenant de la table ai_usage ; `coutIA.test.ts`
 * vérifie que l'estimation ne repasse pas sous les montants mesurés.
 *
 * ESTIMATION GROSSIÈRE, et l'écran le dit : cinq brouillons ne font pas une
 * statistique. Il affiche donc « jusqu'à » `eurosMax` — une vraie borne, la
 * sortie étant plafonnée par le serveur — plutôt qu'un chiffre précis qui
 * serait faux dans un sens ou dans l'autre. À recaler quand les brouillons
 * se compteront par dizaines : l'onglet « Revente IA » donne la mesure.
 */
export function estimationBrouillon(transcript: string, notes = ''): Estimation {
  const matiere = jetonsDe(transcript) + jetonsDe(notes)
  if (matiere === 0) return { entree: 0, sortie: 0, euros: 0, eurosMax: 0 }
  const entree = JETONS_FIXES_BROUILLON + matiere
  const sortie = Math.min(PLAFOND_SORTIE, Math.round(SORTIE_BASE_BROUILLON + matiere * 0.2))
  return {
    entree,
    sortie,
    euros: euros(entree, sortie),
    eurosMax: euros(entree, PLAFOND_SORTIE),
  }
}

/**
 * Plafond de sortie d'un mouvement d'hypnose (maxTokens, server/ai.ts).
 * `coutIA.test.ts` relit le chiffre dans le serveur.
 */
export const PLAFOND_MOUVEMENT = 7000

/** Les quatre mouvements d'une hypnose : un appel chacun. */
const MOUVEMENTS_HYPNOSE = 4

/**
 * Ce que le premier mouvement envoie, mesuré (2 018 et 2 226 jetons sur les
 * hypnoses facturées). Chaque mouvement suivant renvoie ce même socle, plus
 * le texte des mouvements précédents.
 */
const SOCLE_MOUVEMENT = 2_300

/**
 * Ce que coûte une hypnose de trente minutes, en euros — MESURÉ.
 *
 * Les deux hypnoses facturées (table ai_usage, septembre 2026) ont envoyé
 * 19 755 et 18 734 jetons, et en ont rendu 8 827 et 9 094, sur leurs quatre
 * appels : 0,29 € et 0,30 €. L'ancien chiffre, 0,24 €, était posé avant le
 * premier appel et ignorait que le contexte grossit d'un mouvement à
 * l'autre — le prix de la continuité entre eux.
 */
export const COUT_HYPNOSE = euros(19_300, 9_000)

/**
 * Ce qu'une hypnose ne peut pas dépasser : chaque mouvement bute sur son
 * plafond de sortie, et chacun renvoie au suivant tout ce qui a été écrit
 * avant lui. C'est ce chiffre que l'écran annonce en « jusqu'à » : deux
 * hypnoses mesurées ne suffisent pas à promettre mieux.
 */
export const COUT_HYPNOSE_MAX = euros(
  MOUVEMENTS_HYPNOSE * SOCLE_MOUVEMENT + ((MOUVEMENTS_HYPNOSE * (MOUVEMENTS_HYPNOSE - 1)) / 2) * PLAFOND_MOUVEMENT,
  MOUVEMENTS_HYPNOSE * PLAFOND_MOUVEMENT,
)
