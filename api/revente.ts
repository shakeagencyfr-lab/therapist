import type { VercelRequest, VercelResponse } from '@vercel/node'
import { jetonDe } from '../server/auth.js'
import { describeError } from '../server/ai.js'
import { appliquerRevente, etatRevente } from '../server/revente.js'

/** GET : les réglages de revente IA du revendeur. POST : une action dessus. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = jetonDe(req.headers.authorization)
  try {
    if (req.method === 'GET') {
      res.status(200).json(await etatRevente(token))
      return
    }
    if (req.method === 'POST') {
      res.status(200).json(await appliquerRevente(token, req.body))
      return
    }
    res.setHeader('Allow', 'GET, POST')
    res.status(405).json({ error: 'Méthode non autorisée.' })
  } catch (err) {
    const { status, message } = describeError(err)
    // Journal technique seulement : jamais une clé, jamais un corps de requête.
    console.error(`[revente] ${req.method} — ${status} · ${message}`)
    res.status(status).json({ error: message })
  }
}
