/**
 * La double authentification — la part qui se raisonne sans réseau.
 *
 * Un compte de praticienne ou de revendeur peut exiger, en plus du lien, du
 * code reçu par courriel ou du mot de passe, un code à six chiffres tiré
 * d'une application d'authentification (TOTP, l'API MFA de Supabase Auth).
 * Le service le dit dans le jeton : `aal1` après la première preuve, `aal2`
 * après le code.
 *
 * LE MÊME RAISONNEMENT DES DEUX CÔTÉS. L'écran s'en sert pour savoir s'il
 * doit demander le code avant d'ouvrir l'espace ; le serveur, pour refuser
 * les gestes sensibles à une session qui ne l'a pas donné. Écrit une fois,
 * il ne peut pas ouvrir ici ce qu'il ferme là-bas. La base, elle, tient la
 * même règle de son côté (0056, is_cabinet_member).
 */

import { chargeDuJeton } from './jeton.js'

/** Le niveau d'assurance d'une session. */
export type Niveau = 'aal1' | 'aal2'

/** Un facteur tel que le service le décrit, réduit à ce qu'on lit. */
export interface FacteurLu {
  id?: string
  status?: string
  factor_type?: string
  created_at?: string
  updated_at?: string
}

/**
 * Le niveau que porte le jeton.
 *
 * Un jeton sans `aal`, ou illisible, vaut `aal1` : c'est la règle du service,
 * et c'est la lecture prudente — dans le doute, on redemande le code plutôt
 * que d'ouvrir.
 */
export function niveauDuJeton(jeton: string | null | undefined): Niveau {
  return chargeDuJeton(jeton)?.aal === 'aal2' ? 'aal2' : 'aal1'
}

/**
 * Le compte a-t-il un facteur VÉRIFIÉ ?
 *
 * Un facteur « unverified » est une inscription commencée puis abandonnée
 * avant le premier code : il n'a jamais protégé quoi que ce soit, et ne doit
 * pas fermer la porte à sa titulaire.
 */
export function aUnFacteurVerifie(facteurs: readonly FacteurLu[] | null | undefined): boolean {
  return (facteurs ?? []).some((f) => f.status === 'verified')
}

/** Les facteurs vérifiés d'application d'authentification, les plus anciens d'abord. */
export function facteursTotpVerifies<T extends FacteurLu>(facteurs: readonly T[] | null | undefined): T[] {
  return (facteurs ?? [])
    .filter((f) => f.status === 'verified' && (f.factor_type ?? 'totp') === 'totp')
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
}

/**
 * Faut-il demander le code avant d'ouvrir l'espace ?
 *
 * Seulement quand le compte a un facteur vérifié et que la session ne l'a
 * pas encore donné. Un compte sans facteur entre comme avant.
 */
export function codeADemander(niveau: Niveau, facteurVerifie: boolean): boolean {
  return facteurVerifie && niveau !== 'aal2'
}

/** Ce que le serveur répond à un geste sensible tenté sans le code. */
export const REFUS_SANS_CODE =
  "Votre compte est protégé par une double authentification : ce réglage demande le code de votre application. Rechargez la page, puis saisissez-le."

/**
 * Le refus à opposer à un geste sensible, ou null.
 *
 * Les gestes sensibles — poser une clé, régler l'envoi de courriels, inviter
 * l'équipe, changer de mot de passe — ne se font, pour un compte protégé,
 * que depuis une session qui a donné son code.
 */
export function refusSansCode(niveau: Niveau, facteurVerifie: boolean): string | null {
  return codeADemander(niveau, facteurVerifie) ? REFUS_SANS_CODE : null
}

/* ------------------------------------------------------------------ *
 * Inscrire l'application d'authentification
 * ------------------------------------------------------------------ */

/**
 * L'image du QR code, en adresse `data:` pour une balise <img>.
 *
 * Le service rend un SVG. On ne l'injecte JAMAIS dans la page : un SVG est
 * du balisage, et du balisage injecté peut porter du script. Dans une
 * <img>, un SVG est une image et rien d'autre — le navigateur n'y exécute
 * rien. On ré-encode donc le SVG, quelle que soit la forme reçue (brut, ou
 * déjà préfixé par la bibliothèque, sans encodage — un `#` y couperait
 * l'adresse), et on refuse tout ce qui n'en est pas un.
 */
export function adresseImageQr(qr: string | null | undefined): string | null {
  if (!qr) return null
  let svg = qr.trim()
  const prefixe = /^data:image\/svg\+xml(;charset=utf-8|;utf-8)?,/i
  if (/^data:image\/svg\+xml;base64,/i.test(svg)) {
    try {
      svg = atob(svg.replace(/^data:image\/svg\+xml;base64,/i, ''))
    } catch {
      return null
    }
  } else if (prefixe.test(svg)) {
    svg = svg.replace(prefixe, '')
    // Déjà encodé par quelqu'un d'autre ? On le décode une fois.
    if (/^%3Csvg/i.test(svg)) {
      try {
        svg = decodeURIComponent(svg)
      } catch {
        return null
      }
    }
  }
  if (!/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) return null
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * La clé secrète, lisible pour une saisie à la main : par groupes de quatre.
 *
 * Les applications acceptent les espaces ; un œil qui recopie trente-deux
 * caractères d'un bloc se perd au milieu.
 */
export function cleLisible(secret: string | null | undefined): string {
  return (secret ?? '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/(.{4})(?=.)/g, '$1 ')
}

/** Le nom du facteur, unique pour ce compte : le service refuse les doublons. */
export function nomDuFacteur(maintenant: Date): string {
  const d = maintenant.toISOString().slice(0, 16).replace('T', ' ')
  return `Klaro · ${d}`
}

/* ------------------------------------------------------------------ *
 * Le code saisi, et ce qu'on dit quand il ne passe pas
 * ------------------------------------------------------------------ */

/** Les six chiffres de l'application — ceux-là et aucun autre. */
export const LONGUEUR_CODE_TOTP = 6

/** Le code tel que le service l'attend : on colle souvent « 123 456 ». */
export function normaliserCodeTotp(saisie: string): string {
  return saisie.replace(/\D/g, '').slice(0, LONGUEUR_CODE_TOTP)
}

export function codeTotpComplet(saisie: string): boolean {
  return normaliserCodeTotp(saisie).length === LONGUEUR_CODE_TOTP
}

/** La forme d'une erreur du service, réduite à l'utile. */
export interface ErreurDoubleAuth {
  status?: number
  code?: string
  message?: string
}

/**
 * Ce qu'on dit quand le code ne passe pas.
 *
 * Le motif le plus fréquent d'un code refusé n'est pas une faute de frappe :
 * c'est l'heure du téléphone, décalée de plus d'une demi-minute. On le dit.
 */
export function messageDoubleAuth(err: ErreurDoubleAuth | null | undefined): string {
  if (!err) return ''
  const code = err.code ?? ''
  if (err.status === 429 || code === 'over_request_rate_limit') {
    return "Trop d'essais en peu de temps. Patientez quelques minutes avant de saisir un nouveau code."
  }
  if (code === 'mfa_verification_failed' || code === 'mfa_verification_rejected' || /invalid.*code|code.*invalid/i.test(err.message ?? '')) {
    return "Ce code n'est pas le bon. Prenez celui qui s'affiche maintenant dans votre application ; s'il est refusé encore, vérifiez que l'heure de votre téléphone est réglée automatiquement."
  }
  if (code === 'mfa_challenge_expired') {
    return 'Ce code a expiré pendant la saisie. Saisissez celui qui s’affiche maintenant.'
  }
  if (code === 'mfa_totp_enroll_not_enabled' || code === 'mfa_totp_verify_not_enabled') {
    return "La double authentification n'est pas ouverte sur ce service pour l'instant. Prévenez le support de la plateforme."
  }
  if (code === 'too_many_enrolled_mfa_factors') {
    return "Ce compte a trop d'inscriptions en attente. Désactivez la double authentification, puis recommencez."
  }
  if (code === 'insufficient_aal') {
    return 'Ce geste demande le code de votre application : rechargez la page et saisissez-le.'
  }
  if (code === 'mfa_factor_not_found') {
    return "Cette application d'authentification n'est plus reliée à votre compte. Rechargez la page."
  }
  if (err.status === 401 || code === 'session_not_found' || code === 'session_expired') {
    return 'Votre session a expiré. Reconnectez-vous.'
  }
  return 'La vérification a échoué. Réessayez dans un instant.'
}
