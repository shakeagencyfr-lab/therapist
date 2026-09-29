import type { VercelRequest, VercelResponse } from '@vercel/node'
import { AI_ROUTES, type AiRoute } from '../../server/ai.js'
import { aiFunction, routeDeLAppel } from '../../server/vercel.js'

/**
 * Les cinq analyses, en une seule fonction.
 *
 * Elles étaient cinq fichiers d'une ligne chacun — cinq fonctions pour
 * Vercel. Or l'offre gratuite plafonne un déploiement à douze fonctions, et
 * le treizième fichier a fait échouer la mise en ligne des rappels. Toute la
 * logique vivait déjà dans server/ai.ts ; seul le routage change.
 */
const ANALYSES = new Map(AI_ROUTES.map((route) => [route, aiFunction(route)]))

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Une analyse porte sur un dossier de patient : jamais en cache.
  res.setHeader('Cache-Control', 'private, no-store')
  const route = routeDeLAppel(req.query.route, req.url) as AiRoute
  const analyse = ANALYSES.get(route)
  if (!analyse) {
    res.status(404).json({ error: "Cette analyse n'existe pas." })
    return
  }
  await analyse(req, res)
}
