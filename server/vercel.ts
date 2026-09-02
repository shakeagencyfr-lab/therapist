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
import { jetonDe } from './auth.js'
import { describeError, handleAi, type AiRoute } from './ai.js'

export function aiFunction(route: AiRoute) {
  return async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      res.status(405).json({ error: 'Méthode non autorisée.' })
      return
    }
    try {
      res.status(200).json(await handleAi(route, req.body, jetonDe(req.headers.authorization)))
    } catch (err) {
      const { status, message } = describeError(err)
      // Journal technique seulement : aucune donnée patient n'y figure.
      //
      // Une 500 est, par définition, une erreur que describeError n'a pas su
      // nommer : son message est générique et ne dit rien de la cause. Sans
      // la trace, un défaut a pu rester invisible des semaines, chaque appel
      // réel échouant sans laisser d'indice. On journalise donc l'erreur
      // brute dans ce seul cas — le nom, le message et la pile viennent du
      // code, jamais du contenu d'une séance.
      if (status === 500) {
        const cause = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
        console.error(`[ia] ${route} — 500 · ${cause}`)
        if (err instanceof Error && err.stack) console.error(err.stack)
      } else {
        console.error(`[ia] ${route} — ${status} · ${message}`)
      }
      res.status(status).json({ error: message })
    }
  }
}
