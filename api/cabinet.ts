import type { VercelRequest, VercelResponse } from '@vercel/node'
import { jetonDe } from '../server/auth.js'
import { describeError } from '../server/ai.js'
import { agirVolet, lireVolet } from '../server/cabinet.js'

/**
 * Réglages du cabinet : offre, domaine, envoi de courriels, site vitrine.
 *
 * GET ?volet=droits|domaine|smtp|site — l'état. POST — une action dessus.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = jetonDe(req.headers.authorization)
  try {
    if (req.method === 'GET') {
      res.status(200).json(await lireVolet(req.query.volet, token))
      return
    }
    if (req.method === 'POST') {
      res.status(200).json(await agirVolet(req.body, token))
      return
    }
    res.setHeader('Allow', 'GET, POST')
    res.status(405).json({ error: 'Méthode non autorisée.' })
  } catch (err) {
    const { status, message } = describeError(err)
    // Journal technique seulement : jamais un secret, jamais un corps de requête.
    console.error(`[cabinet] ${req.method} — ${status} · ${message}`)
    res.status(status).json({ error: message })
  }
}
