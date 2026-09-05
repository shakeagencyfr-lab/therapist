/**
 * Niveau revendeur.
 *
 * Le revendeur vend l'application à des cabinets. Il ne lit AUCUNE donnée de
 * santé : ni patient, ni note, ni transcription, ni journal. Ce fichier ne
 * décrit donc que ce qu'il a le droit de voir — des cabinets, des contrats,
 * et des compteurs.
 *
 * Le cloisonnement est appliqué en base (supabase/migrations/0002) : aucune
 * politique d'une table de santé ne mentionne l'appartenance à un revendeur.
 * Les types ci-dessous suivent la sortie de `reseller_cabinet_overview()`.
 */

export type CabinetId = string

export type PlanCode = 'essentiel' | 'cabinet' | 'reseau'

export type SubscriptionStatus = 'essai' | 'actif' | 'impaye' | 'suspendu' | 'resilie'

/** Marque blanche d'un cabinet. Mêmes clés que la colonne `cabinets.branding`. */
export interface CabinetBranding {
  accent: string
  accentHover: string
  accentDeep: string
  dark: string
  /** Initiales, affichées tant qu'aucun fichier n'a été déposé. */
  logo: string
  /** Adresse publique du logo déposé, s'il y en a un. */
  logoUrl?: string | null
}

export interface Cabinet {
  id: CabinetId
  name: string
  /** Identifiant public : voir adresseCabinet() dans src/lib/domaine.ts */
  slug: string
  tagline: string
  branding: CabinetBranding
  /** L'interlocutrice du revendeur. Le nom d'une thérapeute n'est pas une
   *  donnée de santé : c'est sa cliente. */
  therapist: string
  email: string
  since: string
  archived: boolean
}

/**
 * Compteurs, et rien d'autre.
 *
 * `adherenceAvg` vaut null sous trois patients actifs : dans un cabinet d'un
 * ou deux patients, une moyenne est un chiffre individuel. La base applique
 * déjà cette règle ; l'interface la répète pour pouvoir l'expliquer.
 *
 * La consommation d'analyse n'y figure pas : chaque cabinet branche sa propre
 * clé Anthropic et paie ses appels. Le revendeur ne la facture pas, donc il
 * n'a pas à la lire — l'afficher laisserait croire qu'elle lui est imputée.
 */
export interface CabinetStats {
  therapists: number
  patientsActive: number
  adherenceAvg: number | null
  sessions30d: number
}

/**
 * Une offre, et les quatre leviers qu'elle ouvre.
 *
 * Le revendeur vend l'application, pas l'analyse : chaque cabinet branche sa
 * propre clé Anthropic et paie ses appels. Une offre ne règle donc que ce que
 * l'application ouvre.
 */
export interface Plan {
  code: PlanCode
  label: string
  priceCents: number
  /** Fiches actives autorisées. null = sans limite. */
  maxPatients: number | null
  /** La boutique en ligne. */
  shop: boolean
  /** Domaine personnalisé et SMTP propre. */
  marqueBlanche: boolean
  /** La bibliothèque de sites vitrines. */
  site: boolean
  /** Ce que l'offre apporte, pour l'argumentaire de vente. */
  includes: string[]
}

/** Ce qu'une offre ouvre, à part son plafond de fiches. */
export type Levier = 'shop' | 'marqueBlanche' | 'site'

export const LEVIERS: Array<{ code: Levier; label: string; detail: string }> = [
  { code: 'shop', label: 'Boutique en ligne', detail: 'Vendre audios, séances et programmes depuis l’espace patient.' },
  { code: 'marqueBlanche', label: 'Marque blanche totale', detail: 'Son domaine à elle, et ses courriels partis de son adresse.' },
  { code: 'site', label: 'Site vitrine', detail: 'Une page d’accueil publique, nourrie par sa fiche Google.' },
]

export interface Subscription {
  cabinetId: CabinetId
  plan: PlanCode
  status: SubscriptionStatus
  /** Fin de période, en toutes lettres. */
  periodEnd: string
  /** Fin d'essai, en toutes lettres. Vide quand il n'y en a pas. */
  trialEnd: string
  /**
   * Le contrat court-il ?
   *
   * Calculé en base (`abonnement_en_regle`, 0035) et non ici : c'est ce
   * booléen qui ferme les leviers du cabinet, et deux endroits qui le
   * calculeraient chacun de leur côté finiraient par ne plus s'accorder. Un
   * essai expiré reste au statut « essai » et n'est plus en règle pour autant.
   */
  enRegle: boolean
  /**
   * Les exceptions négociées pour ce cabinet. Null = l'offre s'applique.
   *
   * Un revendeur qui accorde une faveur à un cabinet ne doit pas avoir à
   * créer une quatrième offre pour lui seul.
   */
  maxPatientsOverride: number | null
  shopOverride: boolean | null
  marqueBlancheOverride: boolean | null
  siteOverride: boolean | null
}

/** Les droits effectifs d'un cabinet : l'offre, corrigée de ses exceptions. */
export interface Droits {
  maxPatients: number | null
  patientesActives: number
  shop: boolean
  marqueBlanche: boolean
  site: boolean
  offre: string
  offreCode: string
}

/** Une ligne du portefeuille : le cabinet, ses compteurs, son contrat. */
export interface PortfolioRow {
  cabinet: Cabinet
  stats: CabinetStats
  subscription: Subscription
  plan: Plan
}
