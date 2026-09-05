/**
 * L'adresse d'un cabinet : klaroweb.site/son-identifiant.
 *
 * Ouverte par un patient ou une praticienne qui n'est pas encore connectée,
 * elle doit montrer le nom et les couleurs du cabinet avant de demander une
 * adresse électronique. Le reste de l'application n'en dépend pas : sans ce
 * chemin, tout fonctionne comme avant, aux couleurs de Klaro.
 *
 * ELLE VIVAIT SOUS /c/ JUSQU'ICI. Le préfixe protégeait la racine, mais il
 * trahissait l'hébergeur dans l'adresse même qu'un cabinet imprime sur ses
 * cartes — exactement ce que la marque blanche achète. La racine est donc
 * dépensée pour les cabinets, et /c/... redirige à demeure : des liens sont
 * partis, et une adresse publiée ne se reprend pas.
 *
 * CE QUE ÇA COÛTE, ET COMMENT ON LE PAIE. La racine ne peut plus accueillir
 * de page du produit sans risquer de heurter un identifiant déjà pris — et
 * on ne reprend pas son adresse à un cabinet qui l'a imprimée. D'où la liste
 * ci-dessous, tenue LARGE À L'AVANCE plutôt qu'au fil des besoins : réserver
 * un mot dont on ne se servira jamais ne coûte rien, le réclamer trop tard
 * coûte l'adresse de quelqu'un.
 */
import { supabase } from '@/lib/supabase'
import type { CabinetBranding } from '@/types/reseller'

export interface Vitrine {
  name: string
  tagline: string
  branding: CabinetBranding
}

/**
 * Les mots que le produit se garde à la racine.
 *
 * Deux familles : ce qui est DÉJÀ une route (mon, api, e, assets…) — un
 * cabinet qui s'y appellerait deviendrait inaccessible — et ce qu'une page
 * du produit voudra vraisemblablement un jour (tarifs, aide, blog…). La
 * seconde famille est de la place gardée : le jour où l'on ajoute /tarifs,
 * il ne faut pas découvrir qu'un cabinet s'appelle « tarifs ».
 *
 * LA MÊME LISTE EST APPLIQUÉE EN BASE, par une contrainte sur `cabinets`.
 * Ici elle rend un message utile au revendeur ; là-bas elle empêche
 * réellement l'écriture — un formulaire se contourne, pas une contrainte.
 */
export const CHEMINS_RESERVES = new Set([
  // Ce qui est déjà servi.
  'mon', 'api', 'c', 'e', 'assets', 'auth', 'admin', 'static', 'public',
  'index', 'patient', 'embed', 'favicon', 'robots', 'sitemap', 'manifest',
  // Les pages qu'un produit finit toujours par vouloir.
  'accueil', 'home', 'a-propos', 'apropos', 'about', 'aide', 'help', 'faq',
  'support', 'contact', 'tarifs', 'prix', 'pricing', 'blog', 'actualites',
  'presse', 'equipe', 'partenaires', 'demo', 'essai', 'docs', 'doc',
  'guide', 'nouveautes', 'statut', 'status',
  // Les mentions légales, qu'on ne choisit pas d'avoir.
  'cgv', 'cgu', 'legal', 'mentions', 'confidentialite', 'cookies', 'rgpd',
  // Le vocabulaire du produit : ambigu comme adresse de cabinet.
  'klaro', 'cabinet', 'cabinets', 'therapeute', 'therapeutes', 'patients',
  'revendeur', 'revendeurs', 'compte', 'connexion', 'login', 'logout',
  'deconnexion', 'inscription', 'signup', 'app', 'espace', 'boutique',
  // Ce qu'une infrastructure réclame tôt ou tard.
  'www', 'cdn', 'media', 'img', 'images', 'files', 'fichiers', 'css', 'js',
  'fonts', 'webhook', 'webhooks', 'health', 'stripe', 'supabase', 'well-known',
])

/**
 * L'identifiant de cabinet porté par un chemin, s'il y en a un.
 *
 * Deux formes sont acceptées, et l'ancienne n'est pas de la nostalgie :
 * `/c/mon-cabinet` a circulé, et une redirection peut manquer à l'appel — un
 * signet, une capture d'écran, `vercel dev`. Mieux vaut la comprendre ici
 * que d'afficher Klaro à quelqu'un qui a suivi un lien du cabinet.
 *
 * Un chemin plus profond n'est pas une vitrine : mieux vaut la page
 * ordinaire qu'une marque prise au hasard d'une URL malformée. Et à la
 * racine, un mot réservé n'est jamais un cabinet — sans quoi `/mon`
 * afficherait la vitrine d'un cabinet qui se serait appelé ainsi.
 */
export function slugDuChemin(chemin: string): string | null {
  const propre = chemin.trim()

  /* L'ancienne forme d'abord, et sur SON PROPRE motif : sous /c/, le préfixe
     isole déjà, aucun mot n'y est réservé. Un seul motif à préfixe optionnel
     serait plus court et faux — « /c/ » s'y lirait comme la racine portant
     l'identifiant « c », qu'on croirait alors préfixé. */
  const ancien = /^\/c\/([a-z0-9][a-z0-9-]{0,62})\/?$/i.exec(propre)
  if (ancien) return ancien[1].toLowerCase()

  const m = /^\/([a-z0-9][a-z0-9-]{0,62})\/?$/i.exec(propre)
  if (!m) return null
  const slug = m[1].toLowerCase()
  return CHEMINS_RESERVES.has(slug) ? null : slug
}

/**
 * L'identifiant du cabinet dans une adresse d'espace patient.
 *
 * `/cabinet-fontaine/mon` ouvre le MÊME espace que `/mon` : c'est la session
 * qui dit qui entre, jamais l'adresse. Ce que l'identifiant change, c'est la
 * PORTE — le nom, les couleurs et le logo du cabinet s'affichent avant la
 * connexion, au lieu de la marque du produit.
 *
 * C'est ce qui rend la marque blanche utilisable sans domaine à soi : le
 * cabinet donne une adresse qui lui ressemble, sans acheter de nom de
 * domaine ni toucher à ses DNS.
 */
export function slugDeLEspacePatient(chemin: string): string | null {
  const m = /^\/([a-z0-9][a-z0-9-]{0,62})\/mon\/?$/i.exec(chemin.trim())
  if (!m) return null
  const slug = m[1].toLowerCase()
  return CHEMINS_RESERVES.has(slug) ? null : slug
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
  /** L'habillage, tel qu'il sort de la base : relu en liste blanche au rendu. */
  theme?: unknown
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

/**
 * La ligne rendue par site_vitrine(), mise à la forme de la page.
 *
 * ELLE EST À PART POUR ÊTRE ÉPROUVÉE. Le banc de rendu vérifiait que
 * VitrinePage sait afficher un thème, et il passait — pendant que cette
 * conversion-ci l'oubliait, une clé plus haut. La thérapeute choisissait une
 * police, la page publique gardait la sienne, et rien nulle part ne le disait.
 * Une épreuve sur le composant ne remplace pas une épreuve sur le fil.
 */
/**
 * L'image vient-elle de NOTRE stockage ?
 *
 * La page publique d'un cabinet est celle qu'un patient ouvre avant d'oser
 * prendre rendez-vous. Une image chargée chez un tiers lui signale cette
 * visite — c'est exactement ce que le produit refuse partout ailleurs :
 * polices auto-hébergées, logo Google en SVG inline.
 *
 * Le serveur filtre déjà à l'écriture. Celle-ci filtre à l'AFFICHAGE, parce
 * que la page publique ne passe pas par le serveur : elle lit la base par
 * `site_vitrine()`, et une ligne écrite avant ce filtre serait rendue telle
 * quelle. La barrière est au point d'usage, là où elle compte.
 */
/**
 * Le cabinet d'un widget : `/e/son-identifiant`.
 *
 * `slugDuChemin` ne connaît que la racine et l'ancien `/c/` — et `e` figure
 * dans les chemins réservés, précisément pour qu'aucun cabinet ne s'appelle
 * ainsi. Le widget lui passait donc son adresse et recevait null : il
 * s'affichait « Votre espace », initiales « KL », aux couleurs de Klaro, sur
 * le site d'une thérapeute qui l'a collé POUR sa marque. Le seul écran de la
 * marque blanche qu'un tiers encadre était le seul à ne pas la porter.
 */
export function slugEmbed(chemin: string): string | null {
  const m = /^\/e\/([a-z0-9][a-z0-9-]{0,62})\/?$/i.exec(chemin.trim())
  return m ? (m[1] as string).toLowerCase() : null
}

export function imageDeNous(url: string): boolean {
  const env = import.meta.env ?? {}
  const base = String(env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
  if (!base) return false
  return url.startsWith(`${base}/storage/v1/object/public/`)
}

/**
 * La marque, nettoyée de ce qui pointerait chez un tiers.
 *
 * Le lot précédent a fermé les PHOTOS de la vitrine et laissé passer le
 * LOGO — c'est-à-dire l'image la plus visible de la page, présente aussi sur
 * la porte patient et dans le widget. La règle n'en était pas une : elle
 * couvrait tout sauf le cas principal.
 *
 * `branding` s'écrit en jsonb brut depuis le navigateur (enregistrerMarque
 * écrit directement dans `cabinets`, sans passer par le serveur), et aucune
 * contrainte ne le borne. Le nettoyage se fait donc à la LECTURE, au point
 * d'usage — c'est là qu'il compte, et c'est le seul endroit que rien ne
 * contourne.
 */
export function marqueSure(brut: unknown): CabinetBranding {
  const b = { ...((brut ?? {}) as CabinetBranding) }
  /* Une marque sans logo téléversé n'en reçoit pas un vide : ce module recopie
     la ligne de la base sans rien y ajouter, et une clé inventée ici se
     retrouverait telle quelle dans l'écran d'édition. */
  if (!('logoUrl' in b)) return b
  b.logoUrl = typeof b.logoUrl === 'string' && imageDeNous(b.logoUrl) ? b.logoUrl : null
  return b
}

/**
 * Un lien sortant qu'on accepte de rendre cliquable.
 *
 * `site_web` arrive de la base et repartait tel quel dans un `href`. Le
 * serveur le nettoie à l'écriture — mais la page publique ne passe pas par le
 * serveur : elle lit `site_vitrine()` directement, et rendrait donc tel quel
 * ce qu'une ligne écrite avant ce nettoyage, ou par un autre chemin,
 * contiendrait. Un `href` commençant par `javascript:` s'exécute au clic, sur
 * la page d'un cabinet, dans le navigateur d'un patient.
 *
 * On ne garde que http et https, et le filtre est AU POINT D'USAGE — c'est le
 * seul endroit que rien ne contourne.
 */
export function lienSortant(brut: unknown): string | null {
  const propre = String(brut ?? '').trim()
  if (!propre) return null
  try {
    const url = new URL(propre)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export function versSiteVitrine(brut: unknown, slug: string): SiteVitrine | null {
  const v = (brut ?? {}) as Partial<SiteVitrine>
  if (!v.name) return null
  return {
    slug: v.slug ?? slug,
    name: v.name,
    tagline: v.tagline ?? '',
    branding: marqueSure(v.branding),
    modele: v.modele ?? 'sobre',
    /* Le thème vient de la base et repart tel quel : c'est la page qui le
       relit en liste blanche, au rendu. L'oublier ici rendait le réglage
       muet — la thérapeute choisissait une police, la page publique gardait
       la sienne, et rien ne le disait. */
    theme: v.theme ?? null,
    titre: v.titre ?? null,
    sous_titre: v.sous_titre ?? null,
    presentation: v.presentation ?? null,
    adresse: v.adresse ?? null,
    telephone: v.telephone ?? null,
    site_web: lienSortant(v.site_web),
    horaires: v.horaires ?? [],
    photos: (v.photos ?? []).filter((p) => imageDeNous(p.url)),
    services: v.services ?? [],
    avis: v.avis ?? [],
    google_note: v.google_note ?? null,
    google_avis: v.google_avis ?? null,
  }
}

/** Le site publié d'un cabinet, ou null s'il n'y en a pas. */
export async function lireSiteVitrine(slug: string): Promise<SiteVitrine | null> {
  const db = supabase()
  if (!db) return null
  const { data, error } = await db.rpc('site_vitrine', { p_slug: slug })
  if (error || !data) return null
  return versSiteVitrine(data, slug)
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
 * domaine remplace le chemin /son-identifiant, sans que rien d'autre change.
 */
export async function cabinetDuDomaine(host: string): Promise<(Vitrine & { slug: string }) | null> {
  const db = supabase()
  if (!db) return null
  const { data, error } = await db.rpc('cabinet_par_domaine', { p_domaine: host.replace(/:\d+$/, '') })
  if (error || !data) return null
  const v = data as Partial<Vitrine & { slug: string }>
  return v.name && v.slug
    ? { slug: v.slug, name: v.name, tagline: v.tagline ?? '', branding: marqueSure(v.branding) }
    : null
}

/** Le nom et les couleurs d'un cabinet, ou null si le slug n'existe pas. */
export async function lireVitrine(slug: string): Promise<Vitrine | null> {
  const db = supabase()
  if (!db) return null
  const { data, error } = await db.rpc('cabinet_vitrine', { p_slug: slug })
  if (error || !data) return null
  const v = data as Partial<Vitrine>
  return v.name ? { name: v.name, tagline: v.tagline ?? '', branding: marqueSure(v.branding) } : null
}
