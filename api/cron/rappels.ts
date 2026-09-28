import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cronAutorise } from '../../server/affirmationsHebdo.js'
import { describeError } from '../../server/ai.js'
import { pousserLesRappelsDus } from '../../server/push.js'

/**
 * La minute de la base.
 *
 * Ce n'est pas l'hébergeur qui appelle cette route : c'est la base elle-même
 * (0040, `declencher_rappels()`), et seulement quand un rappel est dû. Elle se
 * signe du même CRON_SECRET que le planificateur de l'hébergeur, rangé dans
 * son coffre. Sans ce secret, la route refuse tout le monde : elle écrit sur
 * les téléphones des patientes.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!cronAutorise(req.headers.authorization ?? null)) {
    res.status(401).json({ message: 'Cette adresse est réservée au planificateur.' })
    return
  }
  try {
    const bilan = await pousserLesRappelsDus()
    if (bilan.reclames) {
      console.log(
        `[rappels] ${bilan.envoyes} arrivés, ${bilan.sansAppareil} sans téléphone, ${bilan.echecs} en échec, ${bilan.appareilsRetires} téléphones périmés retirés — sur ${bilan.reclames}`,
      )
    }
    res.status(200).json(bilan)
  } catch (err) {
    const { status, message } = describeError(err)
    console.error(`[rappels] ${status} ${message}`)
    res.status(status).json({ message })
  }
}
