import type { VercelRequest, VercelResponse } from '@vercel/node'
import { jetonDe } from '../server/auth.js'
import { describeError } from '../server/ai.js'
import { journaliserRefus } from '../server/errors.js'
import {
  demarrerPaiement,
  hoteDeLaRequete,
  recuDeCommande,
  rembourserCommande,
  verifierEnAttente,
  verifierPaiement,
} from '../server/shop.js'

/**
 * POST { action: 'demarrer', productId }, { action: 'verifier', sessionId },
 * { action: 'verifier-en-attente', cote: 'patient' | 'cabinet' },
 * { action: 'rembourser', commandeId } ou { action: 'recu', commandeId, cote }.
 *
 * Le remboursement et le reçu vivent ici plutôt que dans une fonction à eux :
 * le nombre de fonctions du déploiement est compté (server/fonctions.test.ts),
 * et c'est la boutique.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }
  const token = jetonDe(req.headers.authorization)
  // Reçus, ventes : rien de ce que rend la boutique ne se garde en cache.
  res.setHeader('Cache-Control', 'private, no-store')
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { action?: string }
  try {
    if (body.action === 'demarrer') {
      res.status(200).json(await demarrerPaiement(token, req.body, hoteDeLaRequete(req.headers)))
      return
    }
    if (body.action === 'verifier') {
      res.status(200).json(await verifierPaiement(token, req.body))
      return
    }
    if (body.action === 'verifier-en-attente') {
      res.status(200).json(await verifierEnAttente(token, req.body))
      return
    }
    if (body.action === 'rembourser') {
      res.status(200).json(await rembourserCommande(token, req.body))
      return
    }
    if (body.action === 'recu') {
      res.status(200).json(await recuDeCommande(token, req.body))
      return
    }
    res.status(400).json({ error: 'Action inconnue.' })
  } catch (err) {
    const { status, message } = describeError(err)
    journaliserRefus(`[boutique] ${body.action ?? '?'}`, status, message)
    res.status(status).json({ error: message })
  }
}
