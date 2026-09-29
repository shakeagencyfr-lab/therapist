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
import {
  aUnFacteurVerifie,
  niveauDuJeton,
  refusSansCode,
  type FacteurLu,
} from '../src/lib/doubleAuthentification.js'
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
  /** Le cabinet de sa fiche patient, quand il en a une. */
  patientCabinetId: string | null
  /** Client agissant en son nom, pour les lectures et écritures sous RLS. */
  client: SupabaseClient
}

interface Contexte {
  user_id: string | null
  email: string | null
  cabinet: { id: string } | null
  reseller: { id: string } | null
  patient: { id: string; cabinet_id: string } | null
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
    patientCabinetId: ctx.patient?.cabinet_id ?? null,
    client,
  }
}

/* ------------------------------------------------------------------ *
 * La double authentification, pour les gestes sensibles
 * ------------------------------------------------------------------ */

/** Ce que la garde demande au service d'authentification — séparé pour s'éprouver sans lui. */
export interface LecteurDeFacteurs {
  auth: {
    getUser(jwt?: string): Promise<{
      data: { user: { factors?: FacteurLu[] } | null }
      error: { status?: number } | null
    }>
  }
}

/**
 * Refuse un geste sensible à une session qui n'a pas donné son code.
 *
 * Poser une clé, régler l'envoi de courriels ou le domaine, inviter
 * quelqu'un, changer de mot de passe : pour un compte qui a activé la double
 * authentification, ces gestes ne se font qu'en « aal2 ». Sans cette garde,
 * le mot de passe seul — ou la boîte aux lettres — suffisait à remplacer la
 * clé Stripe du cabinet, puisque ces routes écrivent avec la clé de service
 * après avoir seulement reconnu l'appelant.
 *
 * Le niveau est lu dans le jeton. On ne le VÉRIFIE pas ici : identifier()
 * l'a fait éprouver par la base juste avant, et la signature couvre la
 * charge entière. Un jeton « aal2 » passe sans autre appel ; un jeton
 * « aal1 » demande au service si le compte a un facteur vérifié — un appel
 * de plus, sur des gestes rares.
 *
 * Dans le doute — le service ne répond pas —, on refuse : on ne pose pas une
 * clé sans savoir si le compte exigeait un code.
 */
export async function exigerDeuxiemeFacteur(client: LecteurDeFacteurs, jeton: string): Promise<void> {
  const niveau = niveauDuJeton(jeton)
  if (niveau === 'aal2') return
  const { data, error } = await client.auth.getUser(jeton)
  if (error || !data.user) {
    if (error?.status === 401 || error?.status === 403) {
      throw new HttpError(401, 'Votre session a expiré. Reconnectez-vous.')
    }
    throw new HttpError(502, "Votre compte n'a pas pu être vérifié. Réessayez dans un instant.")
  }
  const refus = refusSansCode(niveau, aUnFacteurVerifie(data.user.factors))
  if (refus) throw new HttpError(403, refus)
}

/**
 * Identifie l'appelant d'un geste sensible : identifier(), puis la garde du
 * second facteur. Une route sensible remplace l'un par l'autre, et rien de
 * plus.
 */
export async function identifierPourGesteSensible(token: string | null): Promise<Appelant> {
  const appelant = await identifier(token)
  // identifier() a refusé tout appel sans jeton : il est là.
  await exigerDeuxiemeFacteur(appelant.client, token as string)
  return appelant
}

/** Le cabinet de l'appelant, ou 403 : cette fonction est celle d'un cabinet. */
export function exigerCabinet(appelant: Appelant): string {
  if (!appelant.cabinetId) {
    throw new HttpError(403, "Cette fonction est réservée à l'espace d'un cabinet.")
  }
  return appelant.cabinetId
}

/**
 * Le geste est réservé à la personne TITULAIRE du cabinet.
 *
 * Être membre ne suffit pas pour ce qui engage l'argent ou l'identité du
 * cabinet : la clé Stripe décide du compte qui encaisse, la clé Anthropic de
 * qui paie l'analyse, le SMTP et le domaine de ce par quoi partent les liens
 * d'ouverture de compte des patients. Une consœur invitée (0042) les
 * remplaçait (pentest du 29 septembre, P1). La base tranche
 * (`est_titulaire_du_cabinet` : rôle owner, et second facteur s'il existe).
 */
export async function exigerTitulaire(appelant: Appelant, cabinetId: string, geste: string): Promise<void> {
  const { data, error } = await appelant.client.rpc('est_titulaire_du_cabinet', { p_cabinet: cabinetId })
  if (error) throw new HttpError(502, "Vos droits n'ont pas pu être vérifiés. Réessayez dans un instant.")
  if (data !== true) throw new HttpError(403, `${geste} est réservé à la personne titulaire du cabinet.`)
}
