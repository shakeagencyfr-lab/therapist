/**
 * Client Supabase, côté navigateur.
 *
 * La clé publiable n'est pas un secret : elle ne donne accès qu'à ce que la
 * RLS autorise pour le compte connecté. La clé de service, elle, contourne la
 * RLS et ne doit jamais approcher ce fichier — voir supabase/README.md.
 *
 * Le client est créé à la demande : sans variables d'environnement,
 * l'application doit pouvoir se charger et l'expliquer, pas planter.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// `import.meta.env` n'existe que sous Vite : hors du navigateur — banc de
// rendu, script Node — l'accès direct lèverait une erreur au chargement.
const env = import.meta.env ?? {}
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY

let client: SupabaseClient | null = null

/** La configuration est-elle présente ? */
export function isConfigured(): boolean {
  return Boolean(url && key)
}

/**
 * Au-delà de ce délai, une lecture publique rend « rien ».
 *
 * Une lecture publique est un seul aller-retour : cinq secondes, c'est déjà
 * un réseau en panne. Mieux vaut alors une porte aux couleurs du produit
 * qu'une page blanche.
 */
export const DELAI_LECTURE_PUBLIQUE_MS = 5_000

/**
 * La requête d'une fonction PUBLIQUE de la base, sans session.
 *
 * Exactement ce que le client enverrait pour un visiteur déconnecté : la clé
 * publiable en `apikey` et en porteur, et rien d'autre — ni jeton, ni
 * cookie. À part pour être éprouvée.
 */
export function requetePublique(
  base: string,
  cle: string,
  fonction: string,
  params: Record<string, unknown>,
): { adresse: string; init: RequestInit } {
  return {
    adresse: `${base.trim().replace(/\/+$/, '')}/rest/v1/rpc/${encodeURIComponent(fonction)}`,
    init: {
      method: 'POST',
      headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      credentials: 'omit',
    },
  }
}

/**
 * Appelle une fonction publique de la base — ouverte à `anon` —, sans session.
 *
 * POURQUOI PAS LE CLIENT. Chaque requête du client attend `getSession()`
 * avant de partir : c'est ainsi qu'il y joint le jeton. Or la reprise de
 * session peut durer une demi-minute quand le rafraîchissement du jeton bute
 * sur le réseau (voir src/auth/session.tsx). La marque d'un cabinet n'a que
 * faire d'une session : elle est publique. La lire par le client, c'était
 * suspendre la porte d'entrée — page blanche, sur l'adresse du cabinet
 * comme sur son domaine — à une reprise qui ne la concerne pas.
 *
 * Rend null sur tout échec, délai compris : l'appelant affiche alors la
 * porte ordinaire, qui vaut toujours mieux que pas de porte.
 */
export async function lecturePublique(
  fonction: string,
  params: Record<string, unknown>,
  delaiMs = DELAI_LECTURE_PUBLIQUE_MS,
): Promise<unknown> {
  if (!isConfigured()) return null
  const { adresse, init } = requetePublique(url as string, key as string, fonction, params)
  const abandon = new AbortController()
  const minuteur = setTimeout(() => abandon.abort(), delaiMs)
  try {
    const reponse = await fetch(adresse, { ...init, signal: abandon.signal })
    if (!reponse.ok) return null
    return (await reponse.json()) as unknown
  } catch {
    return null
  } finally {
    clearTimeout(minuteur)
  }
}

/** Le client, ou null si l'application tourne sans base. */
export function supabase(): SupabaseClient | null {
  if (!isConfigured()) return null
  if (!client) {
    client = createClient(url as string, key as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
