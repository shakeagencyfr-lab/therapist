/**
 * Boutique, côté patient.
 *
 * Le paiement ne se fait pas ici : le navigateur demande au serveur d'ouvrir
 * une session Stripe Checkout avec la clé de la thérapeute, puis y envoie la
 * patient. Au retour, il demande au serveur de vérifier le paiement — jamais
 * il ne se déclare payé lui-même.
 */
import { supabase } from '@/lib/supabase'

async function jeton(): Promise<string> {
  const db = supabase()
  if (!db) throw new Error("L'application n'est pas reliée à sa base.")
  const { data } = await db.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Connectez-vous pour acheter.')
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

/** Au retour de Stripe : le paiement est-il confirmé, et qu'a-t-elle acheté ? */
export function verifierPaiement(
  sessionId: string,
): Promise<{ payee: boolean; title: string | null; livre: boolean }> {
  return appel({ action: 'verifier', sessionId })
}
