import type { VercelRequest, VercelResponse } from '@vercel/node'
import { describeError } from '../../server/ai.js'
import { clePubliqueDuServeur } from '../../server/push.js'

/**
 * La clé publique VAPID, pour le téléphone qui s'inscrit aux rappels.
 *
 * Publique par nature : c'est elle que le navigateur transmet au service
 * d'envoi pour qu'il reconnaisse nos messages. Elle est servie plutôt que
 * compilée dans l'application, parce qu'elle se DÉDUIT de la clé privée —
 * une seule variable à poser, et jamais de paire dépareillée.
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Lecture seule.' })
    return
  }
  try {
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.status(200).json({ cle: clePubliqueDuServeur() })
  } catch (err) {
    const { status, message } = describeError(err)
    res.status(status).json({ message })
  }
}
