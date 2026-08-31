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
  /** Initiales du logo, en attendant un vrai fichier. */
  logo: string
}

export interface Cabinet {
  id: CabinetId
  name: string
  /** Sous-domaine : <slug>.entre-seances.fr */
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
 */
export interface CabinetStats {
  therapists: number
  patientsActive: number
  adherenceAvg: number | null
  sessions30d: number
  /** Consommation IA du mois en cours, en centimes. */
  aiSpendCents: number
}

export interface Plan {
  code: PlanCode
  label: string
  priceCents: number
  /** null = sans limite. */
  maxPatients: number | null
  /** Plafond de consommation IA par mois, en centimes. */
  aiCapCents: number
  /** Ce que l'offre apporte, pour l'argumentaire de vente. */
  includes: string[]
}

export interface Subscription {
  cabinetId: CabinetId
  plan: PlanCode
  status: SubscriptionStatus
  /** Fin de période, en toutes lettres. */
  periodEnd: string
  /** Plafond IA négocié, s'il diffère de celui de l'offre. */
  capOverrideCents: number | null
}

/** Une ligne du portefeuille : le cabinet, ses compteurs, son contrat. */
export interface PortfolioRow {
  cabinet: Cabinet
  stats: CabinetStats
  subscription: Subscription
  plan: Plan
  /** Plafond effectif : celui négocié, sinon celui de l'offre. */
  capCents: number
  /** Part du plafond consommée, 0–100 et au-delà en cas de dépassement. */
  usagePct: number
}
