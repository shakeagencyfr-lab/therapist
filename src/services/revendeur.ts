/**
 * Les jetons du revendeur, vus du navigateur : sa clé d'analyse, son compte
 * Stripe, son barème, ses recharges, les jetons offerts à ses cabinets.
 *
 * Tout passe par /api/revendeur avec le jeton de session. Une clé ne fait
 * que l'aller : le serveur l'éprouve, la chiffre, et ne rend jamais que sa
 * date de pose. Lire est à toute l'équipe ; régler, au propriétaire.
 */
import { supabase } from '@/lib/supabase'
import type { ActionRevendeur, EtatRevendeurJetons } from '@/types/jetons'

export type { ActionRevendeur, EtatRevendeurJetons }

async function jeton(): Promise<string> {
  const db = supabase()
  if (!db) throw new Error("L'application n'est pas reliée à sa base.")
  const { data } = await db.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Connectez-vous pour régler vos jetons.')
  return token
}

async function appel(method: 'GET' | 'POST', body?: ActionRevendeur): Promise<EtatRevendeurJetons> {
  const token = await jeton()
  let reponse: Response
  try {
    reponse = await fetch('/api/revendeur', {
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
  const corps = (await reponse.json().catch(() => ({}))) as Partial<EtatRevendeurJetons> & { error?: string }
  if (!reponse.ok) throw new Error(corps.error ?? `Le serveur a répondu ${reponse.status}.`)
  return corps as EtatRevendeurJetons
}

/** L'état des jetons du revendeur. */
export function lireJetonsRevendeur(): Promise<EtatRevendeurJetons> {
  return appel('GET')
}

/** Un geste du propriétaire, et l'état qui en résulte. */
export function agirJetonsRevendeur(action: ActionRevendeur): Promise<EtatRevendeurJetons> {
  return appel('POST', action)
}
