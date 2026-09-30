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
import { journaliserRefus } from './errors.js'
import { envoyerInvitation } from './invitations.js'
import { deposerDemande, estUneDemande, ipDuVisiteur } from './demandes.js'
import { cronAutorise, publierLesAffirmationsDeLaSemaine } from './affirmationsHebdo.js'
import { gesteDuCompte } from './compte.js'
import { appliquerIntegration, etatIntegrations } from './integrations.js'
import { agirVolet, lireVolet } from './cabinet.js'
import { agirRevendeur, etatRevendeur } from './revendeur.js'
import {
  demarrerPaiement,
  hoteDeLaRequete,
  recuDeCommande,
  rembourserCommande,
  verifierEnAttente,
  verifierPaiement,
} from './shop.js'
import { clePubliqueDuServeur, pousserLesRappelsDus } from './push.js'

const PORT = Number(process.env.PORT) || 8787
const PRODUCTION = process.env.NODE_ENV === 'production'

const app = express()

// Une transcription de séance est longue : le corps JSON doit tenir.
app.use(express.json({ limit: '2mb' }))
// Comme en production : les réponses de l'API ne se gardent pas en cache
// (la clé publique VAPID, seule, repose son propre en-tête).
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store')
  next()
})

// En développement le client tourne sur le port de Vite ; en production il est
// servi par la même origine que l'API.
if (!PRODUCTION) app.use(cors())

for (const route of AI_ROUTES) {
  app.post(`/api/ai/${route}`, async (req: Request, res: Response): Promise<void> => {
    try {
      // L'enveloppe telle quelle : { mock, data }, et { jetons } en mode jetons.
      res.json(await handleAi(route as AiRoute, req.body, jetonDe(req.headers.authorization)))
    } catch (err) {
      const { status, message } = describeError(err)
      // Journal technique seulement : aucune donnée patient n'y figure.
      journaliserRefus(`[ia] ${route}`, status, message)
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
    journaliserRefus('[integrations]', status, message)
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
    res.json(await agirVolet(req.body, jetonDe(req.headers.authorization), hoteDeLaRequete(req.headers)))
  } catch (err) {
    const { status, message } = describeError(err)
    // Journal technique seulement : jamais un secret, jamais un corps de requête.
    journaliserRefus('[cabinet]', status, message)
    res.status(status).json({ error: message })
  }
})

/** Les jetons du revendeur : l'état pour son équipe, les gestes pour son propriétaire. */
app.get('/api/revendeur', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await etatRevendeur(jetonDe(req.headers.authorization)))
  } catch (err) {
    const { status, message } = describeError(err)
    res.status(status).json({ error: message })
  }
})
app.post('/api/revendeur', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await agirRevendeur(jetonDe(req.headers.authorization), req.body))
  } catch (err) {
    const { status, message } = describeError(err)
    // Journal technique seulement : jamais une clé, jamais un corps de requête.
    journaliserRefus('[revendeur]', status, message)
    res.status(status).json({ error: message })
  }
})

/** Boutique : démarrer un paiement, le vérifier au retour, reprendre ce qui attend, rembourser, imprimer un reçu. */
app.post('/api/shop', async (req: Request, res: Response): Promise<void> => {
  const token = jetonDe(req.headers.authorization)
  const action = (req.body as { action?: string } | undefined)?.action
  try {
    if (action === 'demarrer') res.json(await demarrerPaiement(token, req.body, hoteDeLaRequete(req.headers)))
    else if (action === 'verifier') res.json(await verifierPaiement(token, req.body))
    else if (action === 'verifier-en-attente') res.json(await verifierEnAttente(token, req.body))
    else if (action === 'rembourser') res.json(await rembourserCommande(token, req.body))
    else if (action === 'recu') res.json(await recuDeCommande(token, req.body))
    else res.status(400).json({ error: 'Action inconnue.' })
  } catch (err) {
    const { status, message } = describeError(err)
    journaliserRefus(`[boutique] ${action ?? '?'}`, status, message)
    res.status(status).json({ error: message })
  }
})

app.post('/api/invitations', async (req: Request, res: Response): Promise<void> => {
  // La demande d'essai de la page d'accueil, comme en production (api/invitations.ts).
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
    // Journal technique seulement. Une exception ne doit pas emporter l'API.
    console.error('[invitation] exception —', (err as Error).message)
    res.status(500).json({ message: "L'invitation n'a pas pu être envoyée." })
  }
})

app.post('/api/compte', async (req: Request, res: Response): Promise<void> => {
  const token = jetonDe(req.headers.authorization)
  const geste = (req.body as { geste?: string } | undefined)?.geste
  res.setHeader('Cache-Control', 'no-store')
  try {
    res.json(await gesteDuCompte(token, req.body))
  } catch (err) {
    const { status, message } = describeError(err)
    journaliserRefus(`[compte] ${geste ?? '?'}`, status, message)
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
    journaliserRefus('[affirmations] lundi', status, message)
    res.status(status).json({ message })
  }
})

/* Les rappels : la clé publique pour le téléphone qui s'inscrit, et le
   passage que la base déclenche en production. Même secret, même refus. */
app.get('/api/push/cle', (_req: Request, res: Response): void => {
  try {
    res.json({ cle: clePubliqueDuServeur() })
  } catch (err) {
    const { status, message } = describeError(err)
    res.status(status).json({ message })
  }
})

app.all('/api/cron/rappels', async (req: Request, res: Response): Promise<void> => {
  if (!cronAutorise(req.headers.authorization ?? null)) {
    res.status(401).json({ message: 'Cette adresse est réservée au planificateur.' })
    return
  }
  try {
    res.json(await pousserLesRappelsDus())
  } catch (err) {
    const { status, message } = describeError(err)
    journaliserRefus('[rappels]', status, message)
    res.status(status).json({ message })
  }
})

app.listen(PORT, () => {
  console.log(`[ia] API à l'écoute sur le port ${PORT} · mode ${currentMode()}`)
})
