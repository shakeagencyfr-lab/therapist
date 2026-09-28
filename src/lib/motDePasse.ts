/**
 * Changer son mot de passe — la part qui se raisonne sans réseau.
 *
 * Le même raisonnement tient des deux côtés : l'écran s'en sert pour savoir
 * s'il doit demander l'ancien mot de passe, le serveur pour l'exiger. Écrit
 * une seule fois, il ne peut pas dire oui ici et non là-bas.
 *
 * DEUX PREUVES VALENT. Pour changer un mot de passe, il faut montrer qu'on
 * est bien la personne du compte — pas seulement quelqu'un devant un
 * navigateur resté ouvert. Soit on connaît le mot de passe actuel ; soit on
 * vient de prouver qu'on tient la boîte aux lettres, en entrant par un lien
 * reçu par courriel. La seconde preuve est celle de « mot de passe oublié »,
 * et celle de qui n'en a jamais choisi : c'est la même porte.
 */

/**
 * La longueur minimale, et le SEUL endroit qui la décide.
 *
 * Elle était écrite trois fois : dix ici, huit dans le placeholder de l'espace
 * patient, huit dans la garde de son bouton. Le patient tapait donc neuf
 * caractères, le bouton s'activait, l'enregistrement était refusé.
 */
export const LONGUEUR_MOT_DE_PASSE = 10

/**
 * Au-delà, bcrypt ne lit plus rien : deux mots de passe qui ne diffèrent
 * qu'après le 72e octet seraient le même. Le service d'authentification les
 * refuse ; on le dit avant lui, en français.
 */
export const OCTETS_MAX_MOT_DE_PASSE = 72

/**
 * Combien de temps une entrée par lien dispense de l'ancien mot de passe.
 *
 * Vingt-quatre heures, comme le « changement de mot de passe sécurisé » du
 * service d'authentification : assez pour choisir son mot de passe sans se
 * presser, trop peu pour qu'un ordinateur oublié ouvert une semaine suffise.
 */
export const FRAICHEUR_LIEN_MS = 24 * 60 * 60 * 1000

/**
 * Les façons d'entrer qui passent par la boîte aux lettres : lien magique,
 * code reçu par courriel, lien de récupération, invitation, confirmation
 * d'inscription. « password » n'en est pas : il ne prouve rien de plus que
 * ce qu'on prétend changer.
 */
const PAR_COURRIEL = new Set(['otp', 'magiclink', 'recovery', 'invite', 'email/signup', 'email_change'])

/** Une façon d'entrer, telle que le jeton la raconte (champ `amr`). */
export interface Entree {
  method: string
  /** En secondes, comme tout horodatage de jeton. */
  timestamp: number
}

/**
 * Ce que le jeton d'accès dit de la façon dont la session est née.
 *
 * On ne VÉRIFIE rien ici : on lit. Côté serveur, le jeton a déjà été éprouvé
 * par la base avant qu'on en lise une ligne ; côté écran, ce qu'on lit ne
 * décide que de l'affichage — le serveur tranchera de toute façon.
 */
export function lireEntrees(jeton: string | null | undefined): Entree[] {
  if (!jeton) return []
  const partie = jeton.split('.')[1]
  if (!partie) return []
  try {
    const base64 = partie.replace(/-/g, '+').replace(/_/g, '/')
    const complet = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const charge = JSON.parse(atob(complet)) as { amr?: unknown }
    if (!Array.isArray(charge.amr)) return []
    return charge.amr.filter(
      (e): e is Entree =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as Entree).method === 'string' &&
        typeof (e as Entree).timestamp === 'number',
    )
  } catch {
    return []
  }
}

/**
 * La session vient-elle d'un lien reçu par courriel, il y a peu ?
 *
 * Un horodatage dans le futur ne compte pas : une horloge déréglée ne doit
 * pas ouvrir la porte plus longtemps qu'elle ne doit.
 */
export function entreeParLienRecente(entrees: Entree[], maintenantMs: number): boolean {
  return entrees.some((e) => {
    if (!PAR_COURRIEL.has(e.method)) return false
    const age = maintenantMs - e.timestamp * 1000
    return age >= -60_000 && age <= FRAICHEUR_LIEN_MS
  })
}

/** Longueur en octets, comme bcrypt la compte. */
function octets(texte: string): number {
  return new TextEncoder().encode(texte).length
}

/**
 * Ce qui ne va pas dans le nouveau mot de passe, ou null.
 *
 * Les phrases sont celles que l'écran affiche : le serveur les renvoie telles
 * quelles, et l'écran les dit avant même d'appeler.
 */
export function refusDuNouveau(nouveau: string, email?: string | null): string | null {
  if (nouveau.trim().length === 0 || nouveau.length < LONGUEUR_MOT_DE_PASSE) {
    return `Choisissez un mot de passe d'au moins ${LONGUEUR_MOT_DE_PASSE} caractères.`
  }
  if (octets(nouveau) > OCTETS_MAX_MOT_DE_PASSE) {
    return 'Ce mot de passe est trop long : 72 caractères au plus (moins avec des accents).'
  }
  if (email && nouveau.trim().toLowerCase() === email.trim().toLowerCase()) {
    return "Votre adresse courriel ne peut pas servir de mot de passe : c'est la première chose qu'on essaierait."
  }
  return null
}
