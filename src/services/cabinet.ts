import type { FicheImportee } from '@/lib/ficheGoogle'
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
  /** Le contrat court-il ? Faux : essai expiré, impayé, ou aucun contrat. */
  enRegle: boolean
  /** Le mot du contrat : essai, actif, impaye, suspendu, resilie. */
  statut: string
  /** La date qui vient : fin de période, ou fin d'essai. */
  echeance: string | null
  /** La fin de l'essai, seulement quand le contrat en est un. */
  finEssai?: string | null
  /** À qui parler de son contrat : le nom du revendeur, et son adresse s'il en a laissé une. */
  revendeur?: { nom: string; courriel: string | null } | null
  /** Fermé par son revendeur (0057) : la vraie cause du bandeau, quel que soit le contrat. */
  ferme?: boolean
  /** Depuis quand. */
  fermeLe?: string | null
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
  /* Aucune trace du mot de passe : ni lui, ni ses derniers caractères. */
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
  /** Mentions légales : qui publie la page. */
  responsable: string
  /** Mentions légales : SIRET, ADELI ou RPPS. */
  numeroPro: string
  /** Les avis retirés, par leur clé : un réimport ne les ramène pas. */
  avisRetires: string[]
}

export interface EtatSite {
  site: Site
  /** Le site est-il ouvert ? Faux hors offre, et hors contrat. */
  droit: boolean
  /** Le contrat court-il ? Distingue « suspendu » de « hors offre ». */
  enRegle: boolean
  offre: string
  /** L'agenda réglé dans Intégrations, pour le bouton de la page publique. */
  reservation: string | null
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

/** Un courriel d'essai, envoyé à l'adresse du compte connecté — et à nulle autre. */
export async function essayerSmtp(): Promise<string> {
  const r = await appel<{ message?: string }>('smtp', { action: 'essayer' })
  return r.message ?? "Courriel d'essai envoyé."
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

/**
 * Lire une fiche Google. Rien du contenu n'est écrit : la fiche revient, et
 * c'est l'éditeur qui la verse dans son brouillon.
 *
 * `avecPhotos` : le brouillon n'en a aucune, les recopier vaut la peine.
 */
export function importerFiche(
  placeId: string,
  avecPhotos: boolean,
): Promise<{ etat: EtatSite; fiche: FicheImportee }> {
  return appel<{ etat: EtatSite; fiche: FicheImportee }>('site', { action: 'importer', placeId, avecPhotos })
}

/** Dépublier la page, même quand l'offre ne comprend plus le site. */
export function depublierSite(): Promise<EtatSite> {
  return appel<EtatSite>('site', { action: 'depublier' })
}
