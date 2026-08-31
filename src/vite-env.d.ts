/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL du projet Supabase. */
  readonly VITE_SUPABASE_URL?: string
  /** Clé publiable : destinée au navigateur, bornée par la RLS. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
