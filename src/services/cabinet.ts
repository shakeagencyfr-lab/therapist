import type { ThemeVitrine } from '@/lib/themeVitrine'
/**
 * Les réglages du cabinet, vus du navigateur.
 *
 * Quatre volets derrière une seule route : ce que l'offre ouvre, le domaine,
 * le serveur d'envoi, le site vitrine. Rien de tout cela ne passe par la base
 * directement — un domaine s'enregistre chez l'hébergeur et un mot de passe
 * SMTP se chiffre, deux choses qu'un navigateur n'a pas à faire.
 */
import { supabase } from '@/lib/supabase'

/* ---- Ce que l'offre ouvre ---------------------------------------------- */

export interface Droits {
  maxPatients: number | null
  patientesActives: number
  shop: boolean
  marqueBlanche: boolean
  site: boolean
  offre: string
  offreCode: string
}

/* ---- Le domaine --------------------------------------------------------- */

export interface EnregistrementDns {
  type: string
  nom: string
  valeur: string
}

export interface EtatDomaine {
  domaine: string | null
  verifie: boolean
  dns: EnregistrementDns[]
  etat: string
  automatique: boolean
  droit: boolean
  offre: string
}

/* ---- Le serveur d'envoi ------------------------------------------------- */

export interface EtatSmtp {
  host: string | null
  port: number | null
  user: string | null
  from: string | null
  hint: string | null
  setAt: string | null
  droit: boolean
  offre: string
  chiffrement: boolean
}

/* ---- Le site vitrine ---------------------------------------------------- */

export interface ModeleSite {
  code: string
  label: string
  detail: string
}

export interface PhotoSite {
  url: string
  alt: string
  attribution: string
}

export interface HoraireSite {
  jour: string
  heures: string
}

export interface ServiceSite {
  titre: string
  texte: string
}

export interface AvisSite {
  auteur: string
  note: number
  texte: string
  date: string
}

export interface Site {
  modele: string
  publie: boolean
  titre: string
  sousTitre: string
  presentation: string
  adresse: string
  telephone: string
  siteWeb: string
  horaires: HoraireSite[]
  photos: PhotoSite[]
  services: ServiceSite[]
  avis: AvisSite[]
  googlePlaceId: string | null
  googleNote: number | null
  googleAvis: number | null
  importeLe: string | null
  /** L'habillage : polices, fond, cartes, angles. */
  theme: ThemeVitrine
}

export interface EtatSite {
  site: Site
  droit: boolean
  offre: string
  google: boolean
  /** 'serpapi', 'places' ou 'aucune' — ce que le serveur voit réellement. */
  source: string
  modeles: ModeleSite[]
}

export interface FicheTrouvee {
  placeId: string
  nom: string
  adresse: string
  note: number | null
  avis: number | null
}

/* ---- L'appel ------------------------------------------------------------ */

async function jeton(): Promise<string> {
  const db = supabase()
  if (!db) throw new Error("L'application n'est pas reliée à sa base.")
  const { data } = await db.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Connectez-vous pour régler votre cabinet.')
  return token
}

async function appel<T>(volet: string, body?: Record<string, unknown>): Promise<T> {
  const token = await jeton()
  const url = body ? '/api/cabinet' : `/api/cabinet?volet=${encodeURIComponent(volet)}`
  let reponse: Response
  try {
    reponse = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify({ volet, ...body }) : undefined,
    })
  } catch {
    throw new Error('Le serveur est injoignable. Réessayez dans un instant.')
  }
  const corps = (await reponse.json().catch(() => ({}))) as { error?: string }
  if (!reponse.ok) throw new Error(corps.error ?? `Le serveur a répondu ${reponse.status}.`)
  return corps as T
}

/** Ce que l'offre du cabinet ouvre. */
export function lireDroits(): Promise<Droits> {
  return appel<Droits>('droits')
}

export function lireDomaine(): Promise<EtatDomaine> {
  return appel<EtatDomaine>('domaine')
}

export function poserDomaine(domaine: string): Promise<EtatDomaine> {
  return appel<EtatDomaine>('domaine', { action: 'poser', domaine })
}

export function verifierDomaine(): Promise<EtatDomaine> {
  return appel<EtatDomaine>('domaine', { action: 'verifier' })
}

export function retirerDomaine(): Promise<EtatDomaine> {
  return appel<EtatDomaine>('domaine', { action: 'retirer' })
}

export function lireSmtp(): Promise<EtatSmtp> {
  return appel<EtatSmtp>('smtp')
}

export interface ReglageSmtp {
  host: string
  port: number
  user: string
  pass: string
  from: string
}

export function reglerSmtp(reglage: ReglageSmtp): Promise<EtatSmtp> {
  return appel<EtatSmtp>('smtp', { action: 'regler', ...reglage })
}

export function retirerSmtp(): Promise<EtatSmtp> {
  return appel<EtatSmtp>('smtp', { action: 'retirer' })
}

export function lireSite(): Promise<EtatSite> {
  return appel<EtatSite>('site')
}

export function enregistrerSite(site: Partial<Site>): Promise<EtatSite> {
  return appel<EtatSite>('site', { action: 'enregistrer', ...site })
}

export async function chercherFiche(requete: string): Promise<FicheTrouvee[]> {
  const r = await appel<{ fiches: FicheTrouvee[] }>('site', { action: 'chercher', requete })
  return r.fiches ?? []
}

export function importerFiche(placeId: string): Promise<EtatSite> {
  return appel<EtatSite>('site', { action: 'importer', placeId })
}
