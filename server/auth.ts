/**
 * Qui appelle le serveur.
 *
 * Toute route qui agit pour quelqu'un commence ici. Le client transmet son
 * propre jeton Supabase ; le serveur ne le croit pas sur parole, il le fait
 * vérifier par la base en appelant `my_context()` sous ce jeton. Ce qui en
 * revient — cabinet, revendeur, fiche patient — est ce que la base reconnaît
 * à ce compte, pas ce que la requête prétend.
 *
 * Deux clients, deux rôles, jamais confondus :
 *   - `clientAppelant(token)` agit AU NOM de l'appelant : la RLS s'applique.
 *   - `clientAdmin()` porte la clé de service, qui contourne la RLS. Il ne
 *     sert qu'aux écritures que la base réserve au serveur (consommation IA,
 *     secrets d'intégration), jamais à lire pour le compte de quelqu'un.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { HttpError } from './errors.js'

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const PUBLISHABLE =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/** Le serveur est-il relié à la base ? Sans elle, personne ne s'authentifie. */
export function baseConfiguree(): boolean {
  return Boolean(URL && PUBLISHABLE)
}

/** La clé de service est-elle présente ? Sans elle, pas d'écriture réservée. */
export function adminConfigure(): boolean {
  return Boolean(URL && SERVICE)
}

/** Client agissant AU NOM de l'appelant : la RLS s'applique. */
export function clientAppelant(token: string): SupabaseClient {
  return createClient(URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

/** Client d'administration, ou null si la clé de service manque. */
export function clientAdmin(): SupabaseClient | null {
  if (!adminConfigure()) return null
  return createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Le jeton porté par l'en-tête Authorization, ou null. */
export function jetonDe(authorization: string | undefined): string | null {
  const valeur = authorization ?? ''
  return valeur.startsWith('Bearer ') ? valeur.slice(7).trim() || null : null
}

/** Ce que la base reconnaît au compte connecté. */
export interface Appelant {
  userId: string
  email: string | null
  cabinetId: string | null
  resellerId: string | null
  patientId: string | null
  /** Client agissant en son nom, pour les lectures et écritures sous RLS. */
  client: SupabaseClient
}

interface Contexte {
  user_id: string | null
  email: string | null
  cabinet: { id: string } | null
  reseller: { id: string } | null
  patient: { id: string } | null
}

/**
 * Identifie l'appelant, ou refuse.
 *
 * 503 sans base, 401 sans jeton ou jeton invalide. Le refus est explicite :
 * une route qui agit pour un compte ne doit jamais tourner pour personne.
 */
export async function identifier(token: string | null): Promise<Appelant> {
  if (!baseConfiguree()) {
    throw new HttpError(503, "Le serveur n'est pas relié à sa base de données.")
  }
  if (!token) {
    throw new HttpError(401, 'Connectez-vous pour utiliser cette fonction.')
  }
  const client = clientAppelant(token)
  const { data, error } = await client.rpc('my_context')
  const ctx = (data ?? null) as Contexte | null
  if (error || !ctx?.user_id) {
    throw new HttpError(401, 'Votre session a expiré. Reconnectez-vous.')
  }
  return {
    userId: ctx.user_id,
    email: ctx.email,
    cabinetId: ctx.cabinet?.id ?? null,
    resellerId: ctx.reseller?.id ?? null,
    patientId: ctx.patient?.id ?? null,
    client,
  }
}

/** Le cabinet de l'appelant, ou 403 : cette fonction est celle d'un cabinet. */
export function exigerCabinet(appelant: Appelant): string {
  if (!appelant.cabinetId) {
    throw new HttpError(403, "Cette fonction est réservée à l'espace d'un cabinet.")
  }
  return appelant.cabinetId
}
