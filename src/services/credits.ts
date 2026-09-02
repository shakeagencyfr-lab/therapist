/**
 * Les crédits d'analyse, vus du navigateur de la thérapeute.
 *
 * Le solde n'est jamais calculé ici : il vient du serveur, qui le somme
 * depuis un grand livre en ajout seul. L'écran ne fait que l'afficher, et
 * ouvrir un paiement chez le revendeur.
 */
import { supabase } from '@/lib/supabase'

export interface MouvementCredit {
  id: string
  date: string
  delta: number
  reason: 'achat' | 'geste' | 'consommation' | 'ajustement'
  kind: string | null
  note: string | null
}

export interface PaquetOffert {
  id: string
  label: string
  credits: number
  prixCentimes: number
  devise: string
}

export interface EtatCredits {
  mode: 'cle_cabinet' | 'credits'
  solde: number
  decouvert: number
  paiementCarte: boolean
  paquets: PaquetOffert[]
  mouvements: MouvementCredit[]
}

export interface RetourAchat {
  payee: boolean
  credits?: number
  label?: string
}

async function jeton(): Promise<string> {
  const db = supabase()
  if (!db) throw new Error("L'application n'est pas reliée à sa base.")
  const { data } = await db.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Connectez-vous pour voir vos crédits.')
  return token
}

async function appel<T>(method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const token = await jeton()
  let reponse: Response
  try {
    reponse = await fetch('/api/credits', {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Le serveur est injoignable. Réessayez dans un instant.')
  }
  const corps = (await reponse.json().catch(() => ({}))) as { error?: string }
  if (!reponse.ok) throw new Error(corps.error ?? `Le serveur a répondu ${reponse.status}.`)
  return corps as T
}

/** Le solde, les paquets du revendeur, les derniers mouvements. */
export function lireCredits(): Promise<EtatCredits> {
  return appel<EtatCredits>('GET')
}

/** Ouvre le paiement du paquet chez le revendeur, et rend son adresse. */
export function acheterCredits(packId: string): Promise<{ url: string }> {
  return appel<{ url: string }>('POST', { action: 'acheter', packId })
}

/** Constate le paiement au retour de Stripe. Deux retours ne créditent qu'une fois. */
export function verifierAchat(sessionId: string): Promise<RetourAchat> {
  return appel<RetourAchat>('POST', { action: 'verifier', sessionId })
}
