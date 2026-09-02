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

export function messageEnvoiLien(err: ErreurAuth | null | undefined): string {
  if (!err) return ''

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
