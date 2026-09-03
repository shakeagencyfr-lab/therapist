/**
 * Les réglages du cabinet, derrière une seule route.
 *
 * Quatre volets — l'offre, le domaine, l'envoi de courriels, le site vitrine —
 * servis par une porte unique plutôt que par quatre fonctions. Ce n'est pas
 * de l'économie de style : l'hébergement plafonne le nombre de fonctions, et
 * quatre volets qui se lisent chacun une fois par écran n'ont pas besoin de
 * quatre déploiements séparés.
 *
 * Chaque volet garde sa logique dans son propre module ; ce fichier ne fait
 * que router, et refuser ce qu'il ne connaît pas.
 */
import { HttpError } from './errors.js'
import { mesDroits } from './droits.js'
import { etatDomaine, poserDomaine, retirerDomaine, verifierDomaine } from './domaines.js'
import { etatSmtp, reglerSmtp, retirerSmtp } from './courriel.js'
import { chercherFicheGoogle, enregistrerSite, etatSite, importerFicheGoogle } from './sites.js'

export const VOLETS = ['droits', 'domaine', 'smtp', 'site'] as const
export type Volet = (typeof VOLETS)[number]

function volet(valeur: unknown): Volet {
  const nom = String(valeur ?? '')
  if ((VOLETS as readonly string[]).includes(nom)) return nom as Volet
  throw new HttpError(400, 'Réglage inconnu.')
}

/** Lecture d'un volet. */
export async function lireVolet(valeur: unknown, token: string | null): Promise<unknown> {
  switch (volet(valeur)) {
    case 'droits':
      return mesDroits(token)
    case 'domaine':
      return etatDomaine(token)
    case 'smtp':
      return etatSmtp(token)
    case 'site':
      return etatSite(token)
  }
}

/** Action sur un volet. Le corps porte `volet` et `action`. */
export async function agirVolet(raw: unknown, token: string | null): Promise<unknown> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as { volet?: string; action?: string }
  const action = String(body.action ?? '')
  switch (volet(body.volet)) {
    case 'domaine':
      if (action === 'poser') return poserDomaine(token, body)
      if (action === 'verifier') return verifierDomaine(token)
      if (action === 'retirer') return retirerDomaine(token)
      break
    case 'smtp':
      if (action === 'regler') return reglerSmtp(token, body)
      if (action === 'retirer') return retirerSmtp(token)
      break
    case 'site':
      if (action === 'enregistrer') return enregistrerSite(token, body)
      if (action === 'chercher') return { fiches: await chercherFicheGoogle(token, body) }
      if (action === 'importer') return importerFicheGoogle(token, body)
      break
    case 'droits':
      // L'offre se règle depuis l'espace du revendeur, pas depuis celui du
      // cabinet : un cabinet qui pourrait relever son propre plafond n'aurait
      // pas de plafond.
      throw new HttpError(403, "Votre offre se règle depuis l'espace de votre revendeur.")
  }
  throw new HttpError(400, 'Action inconnue.')
}
