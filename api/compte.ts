import type { VercelRequest, VercelResponse } from '@vercel/node'
import { jetonDe } from '../server/auth.js'
import { gesteDuCompte } from '../server/compte.js'
import { describeError } from '../server/ai.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ message: 'Méthode non autorisée.' })
    return
  }
  // Un mot de passe traverse cette route : aucune réponse n'est gardée.
  res.setHeader('Cache-Control', 'no-store')
  try {
    res.status(200).json(await gesteDuCompte(jetonDe(req.headers.authorization), req.body))
  } catch (err) {
    const { status, message } = describeError(err)
    res.status(status).json({ message })
  }
}
