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

/**
 * Le contenu publié d'un site vitrine.
 *
 * Rendu par `site_vitrine()`, ouverte à `anon` : c'est une page publique, et
 * elle ne rend que ce que la thérapeute a choisi de publier. Un brouillon ne
 * sort pas, même en connaissant l'adresse.
 */
export interface SiteVitrine {
  slug: string
  name: string
  tagline: string
  branding: CabinetBranding
  modele: string
  titre: string | null
  sous_titre: string | null
  presentation: string | null
  adresse: string | null
  telephone: string | null
  site_web: string | null
  horaires: Array<{ jour: string; heures: string }>
  photos: Array<{ url: string; alt: string; attribution: string }>
  services: Array<{ titre: string; texte: string }>
  avis: Array<{ auteur: string; note: number; texte: string; date: string }>
  google_note: number | null
  google_avis: number | null
}

/** Le site publié d'un cabinet, ou null s'il n'y en a pas. */
export async function lireSiteVitrine(slug: string): Promise<SiteVitrine | null> {
  const db = supabase()
  if (!db) return null
  const { data, error } = await db.rpc('site_vitrine', { p_slug: slug })
  if (error || !data) return null
  const v = data as Partial<SiteVitrine>
  if (!v.name) return null
  return {
    slug: v.slug ?? slug,
    name: v.name,
    tagline: v.tagline ?? '',
    branding: v.branding as CabinetBranding,
    modele: v.modele ?? 'sobre',
    titre: v.titre ?? null,
    sous_titre: v.sous_titre ?? null,
    presentation: v.presentation ?? null,
    adresse: v.adresse ?? null,
    telephone: v.telephone ?? null,
    site_web: v.site_web ?? null,
    horaires: v.horaires ?? [],
    photos: v.photos ?? [],
    services: v.services ?? [],
    avis: v.avis ?? [],
    google_note: v.google_note ?? null,
    google_avis: v.google_avis ?? null,
  }
}

/**
 * Le domaine ouvert est-il celui d'un cabinet ?
 *
 * Nos propres adresses ne le sont pas : inutile d'interroger la base à chaque
 * chargement de klaroweb.site pour s'entendre répondre non.
 */
export function estDomainePersonnalise(host: string): boolean {
  const nom = host.toLowerCase().replace(/:\d+$/, '')
  if (!nom || nom === 'localhost' || nom === '127.0.0.1') return false
  return !/(^|\.)klaroweb\.site$/.test(nom) && !/(^|\.)vercel\.app$/.test(nom)
}

/**
 * Le cabinet qui répond à ce domaine, s'il y en a un.
 *
 * C'est ce qui permet à espace.son-cabinet.fr d'ouvrir SON espace : le
 * domaine remplace le chemin /c/son-identifiant, sans que rien d'autre change.
 */
export async function cabinetDuDomaine(host: string): Promise<(Vitrine & { slug: string }) | null> {
  const db = supabase()
  if (!db) return null
  const { data, error } = await db.rpc('cabinet_par_domaine', { p_domaine: host.replace(/:\d+$/, '') })
  if (error || !data) return null
  const v = data as Partial<Vitrine & { slug: string }>
  return v.name && v.slug
    ? { slug: v.slug, name: v.name, tagline: v.tagline ?? '', branding: v.branding as CabinetBranding }
    : null
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
