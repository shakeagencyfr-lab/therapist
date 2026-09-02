/**
 * L'adresse d'un cabinet : klaroweb.site/c/son-identifiant.
 *
 * Ouverte par une patiente ou une praticienne qui n'est pas encore connectée,
 * elle doit montrer le nom et les couleurs du cabinet avant de demander une
 * adresse électronique. Le reste de l'application n'en dépend pas : sans ce
 * chemin, tout fonctionne comme avant, aux couleurs de Klaro.
 */
import { supabase } from '@/lib/supabase'
import type { CabinetBranding } from '@/types/reseller'

/** Le préfixe des adresses de cabinet. */
export const PREFIXE_CABINET = '/c/'

export interface Vitrine {
  name: string
  tagline: string
  branding: CabinetBranding
}

/**
 * L'identifiant de cabinet porté par un chemin, s'il y en a un.
 *
 * Seule la forme exacte est reconnue — /c/mon-cabinet, avec ou sans barre
 * finale. Un chemin plus profond n'est pas une vitrine : mieux vaut la page
 * ordinaire qu'une marque prise au hasard d'une URL malformée.
 */
export function slugDuChemin(chemin: string): string | null {
  const m = /^\/c\/([a-z0-9][a-z0-9-]{0,62})\/?$/i.exec(chemin.trim())
  return m ? m[1].toLowerCase() : null
}

/** Le nom et les couleurs d'un cabinet, ou null si le slug n'existe pas. */
export async function lireVitrine(slug: string): Promise<Vitrine | null> {
  const db = supabase()
  if (!db) return null
  const { data, error } = await db.rpc('cabinet_vitrine', { p_slug: slug })
  if (error || !data) return null
  const v = data as Partial<Vitrine>
  return v.name ? { name: v.name, tagline: v.tagline ?? '', branding: v.branding as CabinetBranding } : null
}
