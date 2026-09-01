/**
 * Erreur HTTP portant son statut et son message, en français, prêt à
 * afficher. Partagée par toutes les routes du serveur : l'enveloppe (Express
 * en développement, fonction Vercel en production) la traduit telle quelle.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}
