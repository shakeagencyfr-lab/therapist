import type { VercelRequest, VercelResponse } from '@vercel/node'
import { jetonDe } from '../server/auth.js'
import { describeError } from '../server/ai.js'
import { demarrerAchatCredits, etatCredits, verifierAchatCredits } from '../server/revente.js'

/**
 * Les crédits, côté thérapeute.
 *
 * GET : le solde, les paquets de son revendeur, l'historique.
 * POST { action: 'acheter', packId } ou { action: 'verifier', sessionId }.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = jetonDe(req.headers.authorization)
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { action?: string }
  try {
    if (req.method === 'GET') {
      res.status(200).json(await etatCredits(token))
      return
    }
    if (req.method === 'POST') {
      if (body.action === 'acheter') {
        res.status(200).json(await demarrerAchatCredits(token, req.body))
        return
      }
      if (body.action === 'verifier') {
        res.status(200).json(await verifierAchatCredits(token, req.body))
        return
      }
      res.status(400).json({ error: 'Action inconnue.' })
      return
    }
    res.setHeader('Allow', 'GET, POST')
    res.status(405).json({ error: 'Méthode non autorisée.' })
  } catch (err) {
    const { status, message } = describeError(err)
    console.error(`[credits] ${req.method} ${body.action ?? ''} — ${status} · ${message}`)
    res.status(status).json({ error: message })
  }
}
