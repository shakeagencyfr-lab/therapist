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

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

let client: SupabaseClient | null = null

/** La configuration est-elle présente ? */
export function isConfigured(): boolean {
  return Boolean(url && key)
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
