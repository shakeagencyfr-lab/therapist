/**
 * Le code de connexion reçu par courriel — la part qui se raisonne sans
 * réseau.
 *
 * POURQUOI UN CODE, EN PLUS DU LIEN. Sur iPhone, l'espace installé sur
 * l'écran d'accueil garde sa session à part de Safari : un lien reçu par
 * courriel s'ouvre dans Safari, connecte Safari, et laisse l'application
 * installée à la porte. Or c'est l'application installée, et elle seule, qui
 * reçoit les rappels. Un code se tape là où on en a besoin.
 *
 * Le même courriel porte les deux : le lien pour qui lit ses courriels sur le
 * même appareil, le code pour tous les autres cas.
 */

/**
 * La longueur que le service d'authentification donne à ses codes.
 *
 * Six par défaut ; le réglage va jusqu'à dix. On accepte donc de six à dix
 * chiffres, pour qu'un réglage changé au tableau de bord ne ferme pas la
 * porte sans qu'on touche au code.
 */
export const LONGUEUR_CODE = 6
const LONGUEUR_MAX = 10

/**
 * Le code tel que le service l'attend : des chiffres, et rien d'autre.
 *
 * On colle souvent « 123 456 » ou « 123-456 », avec l'espace que certaines
 * messageries ajoutent pour la lisibilité ; le refuser ferait croire le code
 * faux.
 */
export function normaliserCode(saisie: string): string {
  return saisie.replace(/\D/g, '').slice(0, LONGUEUR_MAX)
}

/** Assez de chiffres pour qu'essayer ait un sens. */
export function codeComplet(saisie: string): boolean {
  return normaliserCode(saisie).length >= LONGUEUR_CODE
}
