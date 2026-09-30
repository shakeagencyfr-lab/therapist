/**
 * L'acceptation des conditions générales, à l'entrée de l'espace — la part
 * qui se raisonne sans réseau.
 *
 * DEUX DOCUMENTS, UNE VERSION. Un compte de cabinet ou de revendeur entre
 * quand il a accepté, dans la version en cours (src/legal/version.ts), les
 * conditions générales de vente ET d'utilisation. `accepter_conditions()`
 * (0067) pose toujours les deux d'un coup ; n'en trouver qu'un signifie une
 * acceptation incomplète, qu'on redemande.
 *
 * UNE PANNE NE FERME PAS LA PORTE. Une lecture qui échoue se retente ; si
 * elle échoue encore, l'espace s'ouvre quand même, et la question sera
 * reposée à la connexion suivante. Enfermer une praticienne dehors, un soir
 * de séance, parce que la base a hoqueté, coûterait bien plus qu'une
 * acceptation différée d'un jour.
 */

/** Les documents qu'une acceptation couvre, tels que la base les nomme. */
export const DOCUMENTS_ACCEPTES = ['cgv', 'cgu'] as const

/** Une ligne de `conditions_acceptees`, telle que le compte la lit. */
export interface LigneAcceptation {
  document: string
  version: string
}

export interface EtatDesConditions {
  /** Les deux documents sont acceptés dans la version en cours. */
  acceptee: boolean
  /** Le compte en avait accepté une version antérieure : c'est une mise à jour. */
  miseAJour: boolean
}

/** Où en est le compte, au vu de ses acceptations. */
export function etatDesConditions(lignes: readonly LigneAcceptation[], version: string): EtatDesConditions {
  const courantes = new Set(lignes.filter((l) => l.version === version).map((l) => l.document))
  const acceptee = DOCUMENTS_ACCEPTES.every((d) => courantes.has(d))
  return { acceptee, miseAJour: !acceptee && lignes.some((l) => l.version !== version) }
}

/** Au-delà, une lecture est tenue pour manquée : rien ne doit retenir l'entrée sans fin. */
export const DELAI_LECTURE_CONDITIONS_MS = 8_000

/** Combien de lectures avant d'ouvrir quand même. */
export const LECTURES_AVANT_OUVERTURE = 2

/** L'attente entre deux lectures. */
export const PAUSE_ENTRE_LECTURES_MS = 1_500

/**
 * Combien d'enregistrements manqués avant de proposer d'entrer quand même.
 * La personne a coché, elle a cliqué : c'est la base qui n'a pas suivi.
 */
export const ECHECS_AVANT_PASSAGE = 2

/** Le libellé de la case, mot pour mot celui des conditions de vente (article « acceptation »). */
export const LIBELLE_CASE = 'J’ai lu et j’accepte les conditions générales de vente et d’utilisation'
