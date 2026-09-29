/**
 * La déconnexion après inactivité — la part qui se raisonne sans navigateur.
 *
 * Le poste d'un cabinet est souvent partagé : secrétariat, consœur, salle
 * d'attente à portée d'écran. Une session laissée ouverte y montre les
 * dossiers à qui passe. La praticienne et le revendeur choisissent donc,
 * dans « Mon compte », au bout de combien de temps sans geste la session se
 * ferme sur cet appareil : jamais, 15, 30 ou 60 minutes — 30 par défaut.
 *
 * TROIS RÈGLES, et le reste en découle :
 *
 *   1. On PRÉVIENT une minute avant. Une saisie en cours ne se perd pas sans
 *      qu'on l'ait dit ; un geste suffit à rester.
 *   2. On ne ferme JAMAIS pendant une captation. Micro ouvert, la séance
 *      s'écrit toute seule pendant que la praticienne ne touche à rien :
 *      c'est l'inverse d'une absence. Micro fermé, la captation est déjà
 *      déposée en base au fil de l'eau (toutes les quinze secondes quand
 *      elle change, src/views/session/RecordStep.tsx) : après une demi-heure
 *      sans un geste, il ne reste rien à perdre.
 *   3. L'activité se PARTAGE entre les onglets. La session est commune à
 *      tous les onglets du navigateur : fermer celui qu'on a oublié fermerait
 *      aussi celui où l'on travaille — ou celui où le micro tourne. Chaque
 *      onglet dépose l'heure de son dernier geste ; chacun compte à partir
 *      du plus récent.
 */

/** Les délais proposés, en minutes. 0 : jamais. */
export const DELAIS_INACTIVITE = [0, 15, 30, 60] as const
export type DelaiInactivite = (typeof DELAIS_INACTIVITE)[number]

/** Le délai de qui n'a rien choisi. */
export const DELAI_PAR_DEFAUT: DelaiInactivite = 30

/** Combien de temps avant la fermeture on prévient. */
export const PREAVIS_MS = 60_000

/**
 * Où le choix est rangé : les métadonnées du compte (user_metadata).
 *
 * Pas une table : c'est un réglage de confort de la personne, qui la suit
 * d'un appareil à l'autre, et que rien ne lit côté serveur. Il ne décide
 * d'aucun droit — personne ne gagne un accès en le modifiant.
 */
export const CLE_METADONNEE = 'deconnexion_inactivite'

/** La clé partagée entre onglets : l'heure du dernier geste, en millisecondes. */
export const CLE_ACTIVITE = 'klaro:derniere-activite'

/** La clé qui dit à la porte pourquoi on y revient. */
export const CLE_SORTIE = 'klaro:sortie-inactivite'

/** On n'écrit l'heure partagée qu'au plus une fois par intervalle. */
export const ECRITURE_PARTAGEE_MS = 5_000

/** Le délai choisi, lu dans les métadonnées du compte — tout autre valeur vaut le défaut. */
export function lireDelai(metadonnees: unknown): DelaiInactivite {
  const brut = (metadonnees as Record<string, unknown> | null | undefined)?.[CLE_METADONNEE]
  const n = typeof brut === 'number' ? brut : typeof brut === 'string' ? Number(brut) : NaN
  return (DELAIS_INACTIVITE as readonly number[]).includes(n) ? (n as DelaiInactivite) : DELAI_PAR_DEFAUT
}

/** Le délai tel que l'écran le dit. */
export function libelleDelai(minutes: DelaiInactivite): string {
  if (minutes === 0) return 'Jamais'
  if (minutes === 60) return '1 heure'
  return `${minutes} minutes`
}

/** Où en est la veille. */
export type EtatVeille =
  /** Rien à dire : la session reste ouverte au moins `resteMs`. */
  | { etat: 'actif'; resteMs: number }
  /** Moins d'une minute : on prévient, avec le temps qui reste. */
  | { etat: 'preavis'; resteMs: number }
  /** Le délai est passé : on ferme. */
  | { etat: 'expire' }
  /** Jamais, ou captation en cours : on ne compte pas. */
  | { etat: 'suspendu' }

/**
 * L'état de la veille, à un instant donné.
 *
 * `derniereActivite` est le geste le plus récent, tous onglets confondus. Une
 * horloge qui recule (heure changée à la main) ne fait pas expirer : un
 * écart négatif compte pour zéro.
 */
export function etatVeille(p: {
  derniereActivite: number
  maintenant: number
  delaiMinutes: DelaiInactivite
  captation: boolean
}): EtatVeille {
  if (p.delaiMinutes === 0 || p.captation) return { etat: 'suspendu' }
  const ecoule = Math.max(0, p.maintenant - p.derniereActivite)
  const reste = p.delaiMinutes * 60_000 - ecoule
  if (reste <= 0) return { etat: 'expire' }
  if (reste <= PREAVIS_MS) return { etat: 'preavis', resteMs: reste }
  return { etat: 'actif', resteMs: reste }
}

/** Les secondes du préavis, arrondies vers le haut : « 1 seconde », jamais « 0 ». */
export function secondesRestantes(resteMs: number): number {
  return Math.max(1, Math.ceil(resteMs / 1000))
}

/**
 * L'heure partagée par les autres onglets, ou null.
 *
 * Une valeur illisible, négative, ou dans le futur (plus d'une minute
 * d'avance : une autre horloge, ou une valeur posée à la main pour ne jamais
 * être déconnecté) est ignorée — elle ne doit pas tenir la session ouverte.
 */
export function lireActivitePartagee(valeur: string | null, maintenant: number): number | null {
  if (!valeur) return null
  const n = Number(valeur)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n > maintenant + 60_000) return null
  return n
}

/** Le plus récent des deux gestes. */
export function plusRecente(locale: number, partagee: number | null): number {
  return partagee !== null && partagee > locale ? partagee : locale
}

/**
 * La note laissée à la porte : combien de minutes, si la sortie est récente.
 *
 * Douze heures : au-delà, dire « vous avez été déconnectée » le lendemain
 * matin n'apprend plus rien à personne.
 */
export function lireSortie(valeur: string | null, maintenant: number): DelaiInactivite | null {
  if (!valeur) return null
  const [quand, minutes] = valeur.split(':').map(Number)
  if (!Number.isFinite(quand) || maintenant - quand > 12 * 60 * 60_000 || quand > maintenant + 60_000) return null
  return (DELAIS_INACTIVITE as readonly number[]).includes(minutes) && minutes > 0
    ? (minutes as DelaiInactivite)
    : null
}

/** Ce qu'on range pour la porte : l'heure et le délai. */
export function noteDeSortie(maintenant: number, minutes: DelaiInactivite): string {
  return `${maintenant}:${minutes}`
}

/** La phrase de la porte, après une fermeture pour inactivité. */
export function phraseDeSortie(minutes: DelaiInactivite): string {
  const duree = minutes === 60 ? 'une heure' : `${minutes} minutes`
  return `Votre session s'est fermée après ${duree} sans activité : personne ne peut la reprendre sur cet appareil. Reconnectez-vous pour continuer.`
}
