/**
 * Enveloppe Express des quatre fonctions IA — pour le développement local
 * (`npm run dev`). En production, ce sont les fonctions api/ai/*.ts qui
 * servent les mêmes routes ; la logique est commune, dans server/ai.ts.
 */
import express from 'express'
import cors from 'cors'
import type { Request, Response } from 'express'

import { AI_ROUTES, currentMode, describeError, handleAi, type AiRoute } from './ai.js'

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
      res.json(await handleAi(route as AiRoute, req.body))
    } catch (err) {
      const { status, message } = describeError(err)
      // Journal technique seulement : aucune donnée patient n'y figure.
      console.error(`[ia] ${route} — ${status} · ${message}`)
      res.status(status).json({ error: message })
    }
  })
}

app.listen(PORT, () => {
  console.log(`[ia] API à l'écoute sur le port ${PORT} · mode ${currentMode()}`)
})
