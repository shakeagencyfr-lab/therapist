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
import { cronAutorise, publierLesAffirmationsDeLaSemaine } from './affirmationsHebdo.js'
import { supprimerCompte } from './compte.js'
import { appliquerIntegration, etatIntegrations } from './integrations.js'
import { agirVolet, lireVolet } from './cabinet.js'
import { demarrerPaiement, verifierPaiement } from './shop.js'

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

/** Réglages du cabinet : offre, domaine, envoi de courriels, site vitrine. */
app.get('/api/cabinet', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await lireVolet(req.query.volet, jetonDe(req.headers.authorization)))
  } catch (err) {
    const { status, message } = describeError(err)
    res.status(status).json({ error: message })
  }
})
app.post('/api/cabinet', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await agirVolet(req.body, jetonDe(req.headers.authorization)))
  } catch (err) {
    const { status, message } = describeError(err)
    // Journal technique seulement : jamais un secret, jamais un corps de requête.
    console.error(`[cabinet] ${status} · ${message}`)
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

app.post('/api/compte', async (req: Request, res: Response): Promise<void> => {
  const token = jetonDe(req.headers.authorization)
  const geste = (req.body as { geste?: string } | undefined)?.geste
  try {
    if (geste !== 'supprimer') {
      res.status(400).json({ message: 'Geste inconnu.' })
      return
    }
    res.json(await supprimerCompte(token))
  } catch (err) {
    const { status, message } = describeError(err)
    console.error(`[compte] ${geste ?? '?'} — ${status} · ${message}`)
    res.status(status).json({ message })
  }
})

/* La même tâche qu'en production, joignable ici pour l'éprouver : elle exige
   le même secret, et sans lui elle refuse tout le monde. */
app.get('/api/cron/affirmations', async (req: Request, res: Response): Promise<void> => {
  if (!cronAutorise(req.headers.authorization ?? null)) {
    res.status(401).json({ message: 'Cette adresse est réservée au planificateur.' })
    return
  }
  try {
    const bilan = await publierLesAffirmationsDeLaSemaine()
    console.log(
      `[affirmations] lundi — ${bilan.publiees} publiées, ${bilan.sautees} sautées, ${bilan.restantes} laissées au prochain passage, ${bilan.echecs} en échec sur ${bilan.candidates} fiches`,
    )
    res.json(bilan)
  } catch (err) {
    const { status, message } = describeError(err)
    console.error(`[affirmations] lundi — ${status} · ${message}`)
    res.status(status).json({ message })
  }
})

app.listen(PORT, () => {
  console.log(`[ia] API à l'écoute sur le port ${PORT} · mode ${currentMode()}`)
})
