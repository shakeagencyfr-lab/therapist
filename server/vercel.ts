/**
 * Adaptateur des fonctions serverless Vercel vers server/ai.ts.
 *
 * Chaque fichier api/ai/*.ts est une fonction distincte — Vercel les déploie
 * séparément, et une seule est réveillée par appel. Elles ne contiennent que
 * le nom de leur route : toute la logique reste dans server/ai.ts, partagée
 * avec l'enveloppe Express du développement local.
 *
 * L'adaptateur vit ici plutôt que dans api/ : ce dossier est un espace de
 * routage pour Vercel, pas un endroit où ranger du code partagé.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { describeError, handleAi, type AiRoute } from './ai.js'

export function aiFunction(route: AiRoute) {
  return async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      res.status(405).json({ error: 'Méthode non autorisée.' })
      return
    }
    try {
      res.status(200).json(await handleAi(route, req.body))
    } catch (err) {
      const { status, message } = describeError(err)
      // Journal technique seulement : aucune donnée patient n'y figure.
      console.error(`[ia] ${route} — ${status} · ${message}`)
      res.status(status).json({ error: message })
    }
  }
}
