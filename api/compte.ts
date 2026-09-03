import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supprimerCompte } from '../server/compte.js'
import { describeError } from '../server/ai.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ message: 'Méthode non autorisée.' })
    return
  }
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  const geste = String((req.body as { geste?: string } | undefined)?.geste ?? '')
  if (geste !== 'supprimer') {
    res.status(400).json({ message: 'Geste inconnu.' })
    return
  }
  try {
    res.status(200).json(await supprimerCompte(token))
  } catch (err) {
    const { status, message } = describeError(err)
    res.status(status).json({ message })
  }
}
