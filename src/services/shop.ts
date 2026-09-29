/**
 * Boutique, côté patient.
 *
 * Le paiement ne se fait pas ici : le navigateur demande au serveur d'ouvrir
 * une session Stripe Checkout avec la clé de la thérapeute, puis y envoie le
 * patient. Au retour, il demande au serveur de vérifier le paiement — jamais
 * il ne se déclare payé lui-même.
 *
 * Et, une fois l'argent encaissé (0058) : le reçu, des deux côtés, et le
 * remboursement, côté cabinet. Le navigateur ne rembourse rien lui-même : la
 * clé Stripe du cabinet ne le quitte jamais, c'est le serveur qui s'en sert.
 */
import { supabase } from '@/lib/supabase'
import type { DonneesRecu, IssueRemboursement } from '@/lib/ventes'

async function jeton(): Promise<string> {
  const db = supabase()
  if (!db) throw new Error("L'application n'est pas reliée à sa base.")
  const { data } = await db.auth.getSession()
  const token = data.session?.access_token
  // Le même appel sert au patient qui achète et au cabinet qui rembourse.
  if (!token) throw new Error('Votre session a expiré. Reconnectez-vous pour continuer.')
  return token
}

async function appel<T>(body: Record<string, unknown>): Promise<T> {
  const token = await jeton()
  let reponse: Response
  try {
    reponse = await fetch('/api/shop', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Le serveur est injoignable. Réessayez dans un instant.')
  }
  const corps = (await reponse.json().catch(() => ({}))) as T & { error?: string }
  if (!reponse.ok) throw new Error(corps.error ?? `Le serveur a répondu ${reponse.status}.`)
  return corps
}

/** Ouvre le paiement d'un produit : rend l'adresse Stripe où envoyer le patient. */
export function demarrerPaiement(productId: string): Promise<{ url: string }> {
  return appel({ action: 'demarrer', productId })
}

/** Ce que le serveur dit d'un retour de Stripe. */
export interface Verification {
  /** La commande vérifiée : la reprise qui suit ne l'annonce pas une seconde fois. */
  id: string
  payee: boolean
  title: string | null
  /** Ce qui a été acheté est arrivé. Faux : la livraison sera reprise. */
  livre: boolean
  /** Non payée : un prélèvement en cours, une page abandonnée, un refus de la banque. */
  attente: 'reglement' | 'abandon' | 'echec' | 'rembourse' | null
}

/** Au retour de Stripe : le paiement est-il confirmé, et qu'a-t-on acheté ? */
export function verifierPaiement(sessionId: string): Promise<Verification> {
  return appel({ action: 'verifier', sessionId })
}

/** Une commande qui attend encore, telle que la reprise la rend. */
export interface CommandeEnAttente {
  id: string
  title: string
  amount_cents: number
  currency: string
  created_at: string
  /** Le nom de la fiche, pour l'écran du cabinet ; null côté patient. */
  patient: string | null
  /** `reglement` : la banque n'a pas encore confirmé. `inverifiable` : Stripe n'a pas répondu. */
  etat: 'reglement' | 'inverifiable'
}

export interface Reprise {
  /** `nouvelle` : confirmée à l'instant ; sinon payée plus tôt, livraison reprise. */
  confirmees: Array<{ id: string; title: string; livre: boolean; nouvelle: boolean }>
  echouees: Array<{ id: string; title: string }>
  enAttente: CommandeEnAttente[]
}

/**
 * La reprise : le serveur repasse chez Stripe ce qui attend encore, livre ce
 * qui a été payé, et rend ce qui reste en attente. Appelée à l'ouverture de
 * la boutique — celle du patient comme celle du cabinet — parce que le
 * retour de Stripe, lui, n'arrive pas toujours.
 */
export function verifierEnAttente(cote: 'patient' | 'cabinet'): Promise<Reprise> {
  return appel({ action: 'verifier-en-attente', cote })
}

/**
 * Rembourse une vente, en entier, avec la clé Stripe du cabinet. Réservé à
 * la personne titulaire ; le serveur le vérifie, comme le second facteur.
 */
export function rembourserVente(commandeId: string): Promise<IssueRemboursement> {
  return appel({ action: 'rembourser', commandeId })
}

/** De quoi imprimer le reçu d'un achat : le même pour le patient et pour le cabinet. */
export function lireRecu(commandeId: string, cote: 'patient' | 'cabinet'): Promise<DonneesRecu> {
  return appel({ action: 'recu', commandeId, cote })
}
