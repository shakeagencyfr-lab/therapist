import type { VercelRequest, VercelResponse } from '@vercel/node'
import { envoyerInvitation } from '../server/invitations.js'
import { deposerDemande, estUneDemande, ipDuVisiteur } from '../server/demandes.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }
  /* LA DEMANDE D'ESSAI DE LA PAGE D'ACCUEIL passe par cette fonction plutôt
     que par une nouvelle : l'hébergement plafonne leur nombre, et une demande
     d'essai est une demande d'invitation (server/demandes.ts). */
  if (estUneDemande(req.body)) {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const { status, body } = await deposerDemande(req.body, ipDuVisiteur(req.headers))
      res.status(status).json(body)
    } catch (err) {
      console.error('[demande-essai] exception —', (err as Error).message)
      res.status(500).json({ message: 'Votre demande n’a pas pu être enregistrée. Réessayez dans un instant.' })
    }
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
