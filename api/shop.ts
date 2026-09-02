import type { VercelRequest, VercelResponse } from '@vercel/node'
import { jetonDe } from '../server/auth.js'
import { describeError } from '../server/ai.js'
import { demarrerPaiement, verifierPaiement } from '../server/shop.js'

/** POST { action: 'demarrer', productId } ou { action: 'verifier', sessionId }. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }
  const token = jetonDe(req.headers.authorization)
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { action?: string }
  try {
    if (body.action === 'demarrer') {
      res.status(200).json(await demarrerPaiement(token, req.body))
      return
    }
    if (body.action === 'verifier') {
      res.status(200).json(await verifierPaiement(token, req.body))
      return
    }
    res.status(400).json({ error: 'Action inconnue.' })
  } catch (err) {
    const { status, message } = describeError(err)
    console.error(`[boutique] ${body.action ?? '?'} — ${status} · ${message}`)
    res.status(status).json({ error: message })
  }
}
