/**
 * Les jetons d'analyse du cabinet, vus du navigateur.
 *
 * Quatre gestes derrière le volet « jetons » de /api/cabinet : lire l'état,
 * démarrer un achat (une recharge, ou le pass Hypnose), le vérifier au retour
 * de Stripe, demander si l'actualisation du profil d'une séance est comprise. Rien ne passe par la base directement : le solde se lit par une
 * fonction qui vérifie l'appartenance, et un achat ne se crédite que sur la
 * parole de Stripe, relue par le serveur.
 *
 * LE RETOUR DE STRIPE. La page de paiement renvoie à la racine de l'espace
 * avec `?jetons=<identifiant de session>` (commençant par « cs_ »), ou
 * `?jetons=annule` quand la praticienne a renoncé. `lireRetourDePaiement`
 * le lit ; `verifierAchat` le fait créditer.
 */
import { supabase } from '@/lib/supabase'
import type { AchatDemarre, AchatVerifie, DevisDuProfil, EtatJetons } from '@/types/jetons'

export type { AchatDemarre, AchatVerifie, DevisDuProfil, EtatJetons }
export { EVENEMENT_JETONS } from '@/services/aiClient'

async function jeton(): Promise<string> {
  const db = supabase()
  if (!db) throw new Error("L'application n'est pas reliée à sa base.")
  const { data } = await db.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Connectez-vous pour voir vos jetons.')
  return token
}

async function appel<T>(body?: Record<string, unknown>): Promise<T> {
  const token = await jeton()
  let reponse: Response
  try {
    reponse = await fetch(body ? '/api/cabinet' : '/api/cabinet?volet=jetons', {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify({ volet: 'jetons', ...body }) : undefined,
    })
  } catch {
    throw new Error('Le serveur est injoignable. Réessayez dans un instant.')
  }
  const corps = (await reponse.json().catch(() => ({}))) as { error?: string }
  if (!reponse.ok) throw new Error(corps.error ?? `Le serveur a répondu ${reponse.status}.`)
  return corps as T
}

/** L'état des jetons du cabinet : mode, solde, forfait, recharges, option Hypnose, historique. */
export function lireJetons(): Promise<EtatJetons> {
  return appel<EtatJetons>()
}

/**
 * Démarrer l'achat d'une recharge, ou du pass Hypnose. Rend l'adresse de la
 * page de paiement, où envoyer la praticienne (`window.location.assign`).
 * Réservé à la titulaire du cabinet.
 */
export function acheterJetons(choix: { recharge: string } | { option: 'hypnose' }): Promise<AchatDemarre> {
  return appel<AchatDemarre>({ action: 'acheter', ...choix })
}

/** Au retour de Stripe : faire créditer l'achat. Sans effet la seconde fois. */
export function verifierAchat(session: string): Promise<AchatVerifie> {
  return appel<AchatVerifie>({ action: 'verifier', session })
}

/**
 * L'actualisation du profil tirée de cette séance serait-elle comprise dans
 * son forfait ? Un devis : rien n'est réservé ni écrit.
 */
export function devisDuProfil(seance: string): Promise<DevisDuProfil> {
  return appel<DevisDuProfil>({ action: 'devis', seance })
}

/**
 * Ce que l'adresse dit d'un retour de paiement — pure.
 *
 * `{ session }` : à vérifier. `{ annule: true }` : la praticienne a renoncé,
 * rien n'est débité. `null` : ce n'est pas un retour de paiement.
 */
export function lireRetourDePaiement(recherche: string): { session: string } | { annule: true } | null {
  const valeur = new URLSearchParams(recherche.replace(/^\?/, '')).get('jetons')
  if (!valeur) return null
  if (valeur === 'annule') return { annule: true }
  return /^cs_[A-Za-z0-9_]+$/.test(valeur) ? { session: valeur } : null
}
