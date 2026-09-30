import type { VercelRequest, VercelResponse } from '@vercel/node'
import { jetonDe } from '../server/auth.js'
import { describeError } from '../server/ai.js'
import { journaliserRefus } from '../server/errors.js'
import { agirRevendeur, etatRevendeur } from '../server/revendeur.js'

/**
 * Les jetons du revendeur : sa clé d'analyse, son compte Stripe, son barème,
 * ses recharges, les jetons offerts à ses cabinets.
 *
 * GET — l'état, pour toute l'équipe. POST { action, … } — un geste, au
 * propriétaire seul (server/revendeur.ts).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = jetonDe(req.headers.authorization)
  // Des réglages d'un revendeur : ni cache partagé, ni cache du navigateur.
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method === 'GET') {
      res.status(200).json(await etatRevendeur(token))
      return
    }
    if (req.method === 'POST') {
      res.status(200).json(await agirRevendeur(token, req.body))
      return
    }
    res.setHeader('Allow', 'GET, POST')
    res.status(405).json({ error: 'Méthode non autorisée.' })
  } catch (err) {
    const { status, message } = describeError(err)
    // Journal technique seulement : jamais une clé, jamais un corps de requête.
    journaliserRefus(`[revendeur] ${req.method}`, status, message)
    res.status(status).json({ error: message })
  }
}
