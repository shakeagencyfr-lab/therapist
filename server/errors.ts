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

/**
 * Le niveau de journal d'une réponse refusée : `error` pour une panne,
 * `warn` pour tout le reste.
 *
 * Seule une 5xx dit que le serveur a failli. Une 401 dit qu'un visiteur
 * n'est pas connecté, une 403 qu'il n'a pas le droit, une 405 qu'on a frappé
 * à la mauvaise porte : c'est le produit qui fonctionne. Toutes partaient
 * pourtant en `console.error`, et l'hébergeur les rangeait parmi les
 * erreurs — une semaine de journaux comptait vingt et une « 401 ·
 * Connectez-vous » pour la seule route du cabinet. Une vraie panne s'y
 * serait noyée.
 */
export function niveauDuJournal(status: number): 'error' | 'warn' {
  return status >= 500 ? 'error' : 'warn'
}

/**
 * Une ligne de journal technique pour une réponse refusée, au bon niveau.
 *
 * Le motif est celui que l'écran reçoit, déjà en français : jamais un corps
 * de requête, jamais un secret.
 */
export function journaliserRefus(origine: string, status: number, message: string): void {
  console[niveauDuJournal(status)](`${origine} — ${status} · ${message}`)
}
