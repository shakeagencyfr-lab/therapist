/**
 * Ce qu'on dit à quelqu'un dont le lien de connexion n'est pas parti.
 *
 * Un message d'erreur qui se trompe de coupable coûte plus cher qu'un
 * message vague. « Vérifiez l'adresse et réessayez » envoyait la praticienne
 * relire une adresse parfaitement correcte, puis recliquer — ce qui, sur un
 * refus pour cadence, ne fait qu'enfoncer le clou.
 *
 * Le service d'envoi est plafonné par heure et pour TOUT le projet : deux
 * liens partis suffisent à refuser le troisième, même s'il vient de
 * quelqu'un d'autre. Ce n'est ni l'adresse, ni la personne devant l'écran.
 */

/** La forme d'une erreur d'authentification Supabase, réduite à l'utile. */
export interface ErreurAuth {
  status?: number
  code?: string
  message?: string
}

/** Ce qu'on dit quand la case anti-robot n'a pas été acceptée. */
const MESSAGE_CAPTCHA =
  "La vérification anti-robot n'a pas abouti — votre adresse n'est pas en cause. Refaites la vérification anti-robot, puis réessayez."

/**
 * Le refus vient-il du CAPTCHA ?
 *
 * Il arrive avec un statut 400, le même que pour une adresse mal formée ou
 * un mot de passe faux : lu au seul statut, un jeton expiré devenait « cette
 * adresse n'est pas acceptée », et la praticienne relisait une adresse
 * juste. Le code le dit (`captcha_failed`) ; le message aussi, pour les
 * versions du service qui n'envoient pas encore de code.
 */
export function refusCaptcha(err: ErreurAuth | null | undefined): boolean {
  if (!err) return false
  return /captcha/i.test(err.code ?? '') || /captcha/i.test(err.message ?? '')
}

export function messageEnvoiLien(err: ErreurAuth | null | undefined): string {
  if (!err) return ''

  // Le CAPTCHA d'abord : son refus porte le même statut qu'une adresse refusée.
  if (refusCaptcha(err)) return MESSAGE_CAPTCHA

  // Cadence : le service d'envoi a atteint son quota. Réessayer tout de
  // suite ne peut pas marcher — on le dit, plutôt que de l'inviter à le faire.
  if (err.status === 429 || err.code === 'over_email_send_rate_limit') {
    return "Le service d'envoi a atteint sa limite pour l'instant. Votre adresse n'est pas en cause : patientez quelques minutes avant de redemander un lien."
  }

  // Adresse refusée : là, et là seulement, il y a quelque chose à relire.
  if (err.status === 400 || err.status === 422 || err.code === 'validation_failed') {
    return "Cette adresse électronique n'est pas acceptée. Vérifiez qu'elle est complète et sans faute de frappe."
  }

  return "L'envoi a échoué. Réessayez dans un instant ; si cela persiste, prévenez votre revendeur."
}

/**
 * Ce qu'on dit à qui n'a pas pu entrer par le code reçu.
 *
 * Le service répond la même chose (403, `otp_expired`) pour un code faux, un
 * code périmé et un code remplacé par un plus récent : il ne sait pas les
 * distinguer sans révéler quelque chose, et nous non plus. On dit donc les
 * trois, et le geste qui les règle tous — le dernier courriel, ou un code
 * neuf.
 */
export function messageCode(err: ErreurAuth | null | undefined): string {
  if (!err) return ''
  // Trop d'essais : le service suspend les vérifications un moment. Retaper
  // tout de suite ne ferait que prolonger l'attente.
  if (err.status === 429 || err.code === 'over_request_rate_limit') {
    return "Trop d'essais en peu de temps. Patientez quelques minutes avant de saisir de nouveau votre code."
  }
  if (err.status === 403 || err.status === 400 || err.status === 422 || err.code === 'otp_expired') {
    return "Ce code ne fonctionne pas : il est inexact, a expiré, ou un code plus récent l'a remplacé. Reprenez le dernier courriel reçu, ou demandez un nouveau code."
  }
  return "La vérification du code a échoué. Réessayez dans un instant ; si cela persiste, demandez un nouveau code."
}

/** Ce qu'on dit à qui n'a pas pu entrer par son mot de passe. */
export function messageConnexionMotDePasse(err: ErreurAuth | null | undefined): string {
  if (!err) return ''
  if (refusCaptcha(err)) return MESSAGE_CAPTCHA
  // On ne distingue jamais « adresse inconnue » de « mot de passe faux » :
  // ce serait dire à un inconnu quelles adresses existent chez nous.
  if (err.status === 400) {
    return 'Adresse ou mot de passe incorrect. Vous pouvez aussi demander un lien de connexion.'
  }
  return messageEnvoiLien(err)
}
