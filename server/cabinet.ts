/**
 * Les réglages du cabinet, derrière une seule route.
 *
 * Cinq volets — l'offre, le domaine, l'envoi de courriels, le site vitrine,
 * l'envoi des notes d'honoraires — servis par une porte unique plutôt que
 * par cinq fonctions. Ce n'est pas de l'économie de style : l'hébergement
 * plafonne le nombre de fonctions, et des volets qui se lisent chacun une
 * fois par écran n'ont pas besoin d'autant de déploiements séparés.
 *
 * Chaque volet garde sa logique dans son propre module ; ce fichier ne fait
 * que router, et refuser ce qu'il ne connaît pas.
 */
import { identifier } from './auth.js'
import { HttpError } from './errors.js'
import { mesDroits } from './droits.js'
import { etatDomaine, poserDomaine, retirerDomaine, verifierDomaine } from './domaines.js'
import { essayerSmtp, etatSmtp, reglerSmtp, retirerSmtp } from './courriel.js'
import { chercherFicheGoogle, depublierSite, enregistrerSite, etatSite, importerFicheGoogle } from './sites.js'
import { envoyerNoteHonoraires, etatEnvoiNotes } from './honoraires.js'

export const VOLETS = ['droits', 'domaine', 'smtp', 'site', 'honoraires'] as const
export type Volet = (typeof VOLETS)[number]

function volet(valeur: unknown): Volet | null {
  const nom = String(valeur ?? '')
  return (VOLETS as readonly string[]).includes(nom) ? (nom as Volet) : null
}

/**
 * Refuser une demande mal formée — à quelqu'un de reconnu seulement.
 *
 * La route répondait « Réglage inconnu. » avant même de regarder le jeton :
 * un appel sans session obtenait un 400 là où tout le reste du produit dit
 * 401, et la forme de la route se décrivait à n'importe qui. On identifie
 * donc d'abord. Cela ne coûte rien aux demandes bien formées : chaque volet
 * identifie déjà l'appelant, et ce détour ne sert qu'aux refus.
 */
async function refuser(token: string | null, refus: HttpError): Promise<never> {
  await identifier(token)
  throw refus
}

/** Lecture d'un volet. */
export async function lireVolet(valeur: unknown, token: string | null): Promise<unknown> {
  const nom = volet(valeur)
  if (!nom) return refuser(token, new HttpError(400, 'Réglage inconnu.'))
  switch (nom) {
    case 'droits':
      return mesDroits(token)
    case 'domaine':
      return etatDomaine(token)
    case 'smtp':
      return etatSmtp(token)
    case 'site':
      return etatSite(token)
    case 'honoraires':
      return etatEnvoiNotes(token)
  }
}

/** Action sur un volet. Le corps porte `volet` et `action`. */
export async function agirVolet(raw: unknown, token: string | null): Promise<unknown> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as { volet?: string; action?: string }
  const action = String(body.action ?? '')
  const nom = volet(body.volet)
  if (!nom) return refuser(token, new HttpError(400, 'Réglage inconnu.'))
  switch (nom) {
    case 'domaine':
      if (action === 'poser') return poserDomaine(token, body)
      if (action === 'verifier') return verifierDomaine(token)
      if (action === 'retirer') return retirerDomaine(token)
      break
    case 'smtp':
      if (action === 'regler') return reglerSmtp(token, body)
      if (action === 'retirer') return retirerSmtp(token)
      if (action === 'essayer') return essayerSmtp(token)
      break
    case 'site':
      if (action === 'enregistrer') return enregistrerSite(token, body)
      if (action === 'chercher') return { fiches: await chercherFicheGoogle(token, body) }
      if (action === 'importer') return importerFicheGoogle(token, body)
      /* Sans le droit du site, délibérément : voir `depublierSite`. */
      if (action === 'depublier') return depublierSite(token)
      break
    case 'honoraires':
      if (action === 'envoyer') return envoyerNoteHonoraires(token, body)
      break
    case 'droits':
      // L'offre se règle depuis l'espace du revendeur, pas depuis celui du
      // cabinet : un cabinet qui pourrait relever son propre plafond n'aurait
      // pas de plafond.
      return refuser(token, new HttpError(403, "Votre offre se règle depuis l'espace de votre revendeur."))
  }
  return refuser(token, new HttpError(400, 'Action inconnue.'))
}
