/**
 * Adaptateur des fonctions serverless Vercel vers server/ai.ts.
 *
 * Une seule fonction, api/ai/[route].ts, sert les cinq analyses : l'offre
 * gratuite de Vercel plafonne un déploiement à douze fonctions, et cinq
 * fichiers d'une ligne en prenaient cinq. Toute la logique reste dans
 * server/ai.ts, partagée avec l'enveloppe Express du développement local.
 *
 * L'adaptateur vit ici plutôt que dans api/ : ce dossier est un espace de
 * routage pour Vercel, pas un endroit où ranger du code partagé.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { jetonDe } from './auth.js'
import { describeError, handleAi, type AiRoute } from './ai.js'
import { journaliserRefus } from './errors.js'

export function aiFunction(route: AiRoute) {
  return async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      res.status(405).json({ error: 'Méthode non autorisée.' })
      return
    }
    try {
      /* L'enveloppe telle quelle : { mock, data } — et, en mode jetons,
         { jetons: { utilises, solde } }, que l'écran relaie (aiClient). */
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
        journaliserRefus(`[ia] ${route}`, status, message)
      }
      res.status(status).json({ error: message })
    }
  }
}

/**
 * La route demandée, lue dans le segment dynamique — et, à défaut, dans
 * l'adresse elle-même.
 *
 * Deux sources plutôt qu'une : si la plateforme cessait un jour de poser le
 * segment dans la requête, les cinq analyses tomberaient ensemble, en
 * production, sur l'outil que les cabinets paient.
 */
export function routeDeLAppel(segment: unknown, adresse: string | undefined): string {
  const lu = Array.isArray(segment) ? segment[0] : segment
  if (typeof lu === 'string' && lu) return lu
  try {
    const chemin = new URL(adresse ?? '', 'http://interne').pathname
    return decodeURIComponent(chemin.split('/').filter(Boolean).pop() ?? '')
  } catch {
    return ''
  }
}
