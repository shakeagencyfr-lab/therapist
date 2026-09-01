import type { VercelRequest, VercelResponse } from '@vercel/node'
import { envoyerInvitation } from '../server/invitations.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }
  try {
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    const { status, body } = await envoyerInvitation(token, req.body)
    res.status(status).json(body)
  } catch (err) {
    // Journal technique seulement. Une exception ne doit pas emporter la fonction.
    console.error('[invitation] exception —', (err as Error).message)
    res.status(500).json({ message: "L'invitation n'a pas pu être envoyée." })
  }
}
