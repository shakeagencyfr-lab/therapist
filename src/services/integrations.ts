/**
 * Intégrations du cabinet, vues du navigateur.
 *
 * Le navigateur ne détient jamais une clé : il la transmet une fois au
 * serveur, qui la vérifie, la chiffre et n'en renvoie que les quatre
 * derniers caractères. Tout ici passe donc par /api/integrations avec le
 * jeton de session — jamais par la base directement.
 */
import { supabase } from '@/lib/supabase'

export interface CleAffichee {
  hint: string
  setAt: string
  label?: string
}

export interface EtatIntegrations {
  anthropic: CleAffichee | null
  stripe: CleAffichee | null
  bookingUrl: string | null
  bookingMode: 'bouton' | 'widget'
  bookingWidgetUrl: string | null
  shopEnabled: boolean
  chiffrement: boolean
  maquette: boolean
}

export type ActionIntegration =
  | { action: 'anthropic'; key: string }
  | { action: 'anthropic-retirer' }
  | { action: 'stripe'; key: string }
  | { action: 'stripe-retirer' }
  | { action: 'rdv'; mode: 'bouton'; url: string }
  | { action: 'rdv'; mode: 'widget'; embed: string }
  | { action: 'rdv-retirer' }
  | { action: 'boutique'; enabled: boolean }

async function jeton(): Promise<string> {
  const db = supabase()
  if (!db) throw new Error("L'application n'est pas reliée à sa base.")
  const { data } = await db.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Connectez-vous pour régler vos intégrations.')
  return token
}

async function appel(method: 'GET' | 'POST', body?: ActionIntegration): Promise<EtatIntegrations> {
  const token = await jeton()
  let reponse: Response
  try {
    reponse = await fetch('/api/integrations', {
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
  const corps = (await reponse.json().catch(() => ({}))) as Partial<EtatIntegrations> & { error?: string }
  if (!reponse.ok) throw new Error(corps.error ?? `Le serveur a répondu ${reponse.status}.`)
  return corps as EtatIntegrations
}

/** L'état courant des trois intégrations. */
export function lireIntegrations(): Promise<EtatIntegrations> {
  return appel('GET')
}

/** Une action, et l'état qui en résulte. */
export function agirIntegration(body: ActionIntegration): Promise<EtatIntegrations> {
  return appel('POST', body)
}
