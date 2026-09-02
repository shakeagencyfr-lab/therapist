/**
 * Enveloppe Express des quatre fonctions IA — pour le développement local
 * (`npm run dev`). En production, ce sont les fonctions api/ai/*.ts qui
 * servent les mêmes routes ; la logique est commune, dans server/ai.ts.
 */
import express from 'express'
import cors from 'cors'
import type { Request, Response } from 'express'

import { AI_ROUTES, currentMode, describeError, handleAi, type AiRoute } from './ai.js'
import { jetonDe } from './auth.js'
import { envoyerInvitation } from './invitations.js'
import { appliquerIntegration, etatIntegrations } from './integrations.js'
import { demarrerPaiement, verifierPaiement } from './shop.js'
import {
  appliquerRevente,
  demarrerAchatCredits,
  etatCredits,
  etatRevente,
  verifierAchatCredits,
} from './revente.js'

const PORT = Number(process.env.PORT) || 8787
const PRODUCTION = process.env.NODE_ENV === 'production'

const app = express()

// Une transcription de séance est longue : le corps JSON doit tenir.
app.use(express.json({ limit: '2mb' }))

// En développement le client tourne sur le port de Vite ; en production il est
// servi par la même origine que l'API.
if (!PRODUCTION) app.use(cors())

for (const route of AI_ROUTES) {
  app.post(`/api/ai/${route}`, async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await handleAi(route as AiRoute, req.body, jetonDe(req.headers.authorization)))
    } catch (err) {
      const { status, message } = describeError(err)
      // Journal technique seulement : aucune donnée patient n'y figure.
      console.error(`[ia] ${route} — ${status} · ${message}`)
      res.status(status).json({ error: message })
    }
  })
}

/** Intégrations du cabinet : lecture de l'état, puis actions. */
app.get('/api/integrations', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await etatIntegrations(jetonDe(req.headers.authorization)))
  } catch (err) {
    const { status, message } = describeError(err)
    res.status(status).json({ error: message })
  }
})
app.post('/api/integrations', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await appliquerIntegration(jetonDe(req.headers.authorization), req.body))
  } catch (err) {
    const { status, message } = describeError(err)
    // Journal technique seulement : jamais une clé, jamais un corps de requête.
    console.error(`[integrations] ${status} · ${message}`)
    res.status(status).json({ error: message })
  }
})

/** Boutique : démarrer un paiement, le vérifier au retour. */
app.post('/api/shop', async (req: Request, res: Response): Promise<void> => {
  const token = jetonDe(req.headers.authorization)
  const action = (req.body as { action?: string } | undefined)?.action
  try {
    if (action === 'demarrer') res.json(await demarrerPaiement(token, req.body))
    else if (action === 'verifier') res.json(await verifierPaiement(token, req.body))
    else res.status(400).json({ error: 'Action inconnue.' })
  } catch (err) {
    const { status, message } = describeError(err)
    console.error(`[boutique] ${action ?? '?'} — ${status} · ${message}`)
    res.status(status).json({ error: message })
  }
})

/** Revente IA, côté revendeur : ses clés, sa marge, ses paquets, ses cabinets. */
app.get('/api/revente', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await etatRevente(jetonDe(req.headers.authorization)))
  } catch (err) {
    const { status, message } = describeError(err)
    res.status(status).json({ error: message })
  }
})
app.post('/api/revente', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await appliquerRevente(jetonDe(req.headers.authorization), req.body))
  } catch (err) {
    const { status, message } = describeError(err)
    // Journal technique seulement : jamais une clé, jamais un corps de requête.
    console.error(`[revente] ${status} · ${message}`)
    res.status(status).json({ error: message })
  }
})

/** Crédits IA, côté thérapeute : le solde, puis l'achat. */
app.get('/api/credits', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await etatCredits(jetonDe(req.headers.authorization)))
  } catch (err) {
    const { status, message } = describeError(err)
    res.status(status).json({ error: message })
  }
})
app.post('/api/credits', async (req: Request, res: Response): Promise<void> => {
  const token = jetonDe(req.headers.authorization)
  const action = (req.body as { action?: string } | undefined)?.action
  try {
    if (action === 'acheter') res.json(await demarrerAchatCredits(token, req.body))
    else if (action === 'verifier') res.json(await verifierAchatCredits(token, req.body))
    else res.status(400).json({ error: 'Action inconnue.' })
  } catch (err) {
    const { status, message } = describeError(err)
    console.error(`[credits] ${action ?? '?'} — ${status} · ${message}`)
    res.status(status).json({ error: message })
  }
})

app.post('/api/invitations', async (req: Request, res: Response): Promise<void> => {
  try {
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    const { status, body } = await envoyerInvitation(token, req.body)
    res.status(status).json(body)
  } catch (err) {
    // Journal technique seulement. Une exception ne doit pas emporter l'API.
    console.error('[invitation] exception —', (err as Error).message)
    res.status(500).json({ message: "L'invitation n'a pas pu être envoyée." })
  }
})

app.listen(PORT, () => {
  console.log(`[ia] API à l'écoute sur le port ${PORT} · mode ${currentMode()}`)
})
