/**
 * La revente d'IA, vue du navigateur du revendeur.
 *
 * Comme partout : une clé part une fois vers le serveur, qui la vérifie et
 * la chiffre, et ne renvoie que ses quatre derniers caractères. Rien ici ne
 * touche la base directement — le grand livre des crédits ne s'écrit que
 * côté serveur, sans quoi un solde ne voudrait rien dire.
 */
import { supabase } from '@/lib/supabase'

export interface CleAffichee {
  hint: string
  setAt: string
  label?: string
}

export interface CoutConstate {
  kind: string
  appels: number
  /** Coût moyen d'un appel, en centimes de dollar. */
  moyenneCentimes: number
}

export interface Paquet {
  id: string
  label: string
  credits: number
  prixCentimes: number
  actif: boolean
}

export interface CabinetRevente {
  cabinetId: string
  nom: string
  mode: 'cle_cabinet' | 'credits'
  solde: number
}

export interface EtatRevente {
  anthropic: CleAffichee | null
  stripe: CleAffichee | null
  margePct: number
  decouvertCredits: number
  paquets: Paquet[]
  cabinets: CabinetRevente[]
  couts: CoutConstate[]
  chiffrement: boolean
}

export type ActionRevente =
  | { action: 'anthropic'; key: string }
  | { action: 'anthropic-retirer' }
  | { action: 'stripe'; key: string }
  | { action: 'stripe-retirer' }
  | { action: 'reglages'; margePct: number; decouvertCredits: number }
  | { action: 'paquet'; id?: string; label: string; credits: number; prixCentimes: number; actif: boolean }
  | { action: 'paquet-retirer'; id: string }
  | { action: 'mode'; cabinetId: string; mode: 'cle_cabinet' | 'credits' }
  | { action: 'crediter'; cabinetId: string; credits: number; note: string }

async function jeton(): Promise<string> {
  const db = supabase()
  if (!db) throw new Error("L'application n'est pas reliée à sa base.")
  const { data } = await db.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Connectez-vous pour régler votre revente.')
  return token
}

async function appel(method: 'GET' | 'POST', body?: ActionRevente): Promise<EtatRevente> {
  const token = await jeton()
  let reponse: Response
  try {
    reponse = await fetch('/api/revente', {
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
  const corps = (await reponse.json().catch(() => ({}))) as Partial<EtatRevente> & { error?: string }
  if (!reponse.ok) throw new Error(corps.error ?? `Le serveur a répondu ${reponse.status}.`)
  return corps as EtatRevente
}

/** Les réglages de revente du revendeur connecté. */
export function lireRevente(): Promise<EtatRevente> {
  return appel('GET')
}

/** Une action, et l'état qui en résulte. */
export function agirRevente(body: ActionRevente): Promise<EtatRevente> {
  return appel('POST', body)
}
