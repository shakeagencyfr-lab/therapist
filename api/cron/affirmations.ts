import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cronAutorise, publierLesAffirmationsDeLaSemaine } from '../../server/affirmationsHebdo.js'
import { describeError } from '../../server/ai.js'

/**
 * Le lundi matin de l'hébergeur.
 *
 * L'appel dépense la clé Anthropic des cabinets : il n'est donc ouvert qu'au
 * planificateur, qui se signe avec CRON_SECRET. Sans ce secret configuré, la
 * route refuse tout le monde — c'est le seul état où « ouvert » signifierait
 * « ouvert à qui connaît l'adresse ».
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!cronAutorise(req.headers.authorization ?? null)) {
    res.status(401).json({ message: 'Cette adresse est réservée au planificateur.' })
    return
  }
  try {
    const bilan = await publierLesAffirmationsDeLaSemaine()
    console.log(
      `[affirmations] lundi — ${bilan.publiees} publiées, ${bilan.sautees} sautées, ${bilan.restantes} laissées au prochain passage, ${bilan.echecs} en échec sur ${bilan.candidates} fiches`,
    )
    res.status(200).json(bilan)
  } catch (err) {
    const { status, message } = describeError(err)
    console.error(`[affirmations] lundi — ${status} ${message}`)
    res.status(status).json({ message })
  }
}
