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
  /** Fermé par son revendeur (0057) : ses patients n'ont plus d'espace. */
  archived: boolean
  /** Depuis quand, tel que la base l'a daté. Absent pour la démonstration. */
  fermeLe?: string | null
}

/**
 * Compteurs, et rien d'autre.
 *
 * `adherenceAvg` vaut null sous trois patients actifs : dans un cabinet d'un
 * ou deux patients, une moyenne est un chiffre individuel. La base applique
 * déjà cette règle ; l'interface la répète pour pouvoir l'expliquer.
 *
 * La consommation d'analyse n'entre pas dans le portefeuille : chaque cabinet
 * branche sa propre clé et paie ses appels, et une colonne de plus à côté du
 * revenu laisserait croire qu'elle est imputée au revendeur. La fiche d'un
 * cabinet la montre seule, avec cette précision écrite à côté — c'est ce qui
 * répond au « pourquoi l'analyse coûte-t-elle si cher ? » d'une praticienne.
 */
export interface CabinetStats {
  therapists: number
  patientsActive: number
  adherenceAvg: number | null
  sessions30d: number
  /** Dépense d'analyse du mois civil en cours, en centimes (payée par le cabinet). */
  analyseCentsMois?: number
}

/**
 * Une offre, les leviers qu'elle ouvre, et ce qu'elle donne en jetons.
 *
 * Deux façons de payer l'analyse, au choix du revendeur (0065) : chaque
 * cabinet branche sa clé Anthropic, ou le revendeur branche la sienne et
 * chaque offre attribue un forfait mensuel de jetons. Le forfait n'a d'effet
 * que dans ce second mode.
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
  /** Jetons attribués d'office chaque mois civil, en mode jetons. Ne se cumulent pas. */
  jetonsMois: number
  /** L'hypnose personnalisée est comprise. Sinon, elle s'achète en option. */
  hypnoseIncluse: boolean
  /** Ce que l'offre apporte, pour l'argumentaire de vente. */
  includes: string[]
}

/**
 * Ce qu'une offre ouvre, à part son plafond de fiches et son forfait de
 * jetons. `hypnoseIncluse` (0065) porte le nom de sa colonne : l'offre la
 * comprend ou non, et un cabinet peut l'acheter en pass quand elle ne la
 * comprend pas — ce pass ne se règle pas ici.
 */
export type Levier = 'shop' | 'marqueBlanche' | 'site' | 'hypnoseIncluse'

export const LEVIERS: Array<{ code: Levier; label: string; detail: string }> = [
  { code: 'shop', label: 'Boutique en ligne', detail: 'Vendre audios, séances et programmes depuis l’espace patient.' },
  { code: 'marqueBlanche', label: 'Marque blanche totale', detail: 'Son domaine à elle, et ses courriels partis de son adresse.' },
  { code: 'site', label: 'Site vitrine', detail: 'Une page d’accueil publique, nourrie par sa fiche Google.' },
  {
    code: 'hypnoseIncluse',
    label: 'Option Hypnose incluse',
    detail: 'L’hypnose personnalisée de trente minutes, sans pass à acheter.',
  },
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
   * Les deux mêmes dates, telles que la base les rend (ISO). Les phrases du
   * contrat comparent à aujourd'hui — « essai expiré le », « finit dans trois
   * jours » — et une date déjà mise en toutes lettres ne se compare plus.
   */
  trialEndsAt: string | null
  periodEndAt: string | null
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
  /** Forfait mensuel négocié. Null = celui de l'offre. */
  jetonsMoisOverride: number | null
  /** Hypnose ouverte ou fermée pour ce cabinet. Null = l'offre décide. */
  hypnoseOverride: boolean | null
  /** Fin du pass Hypnose acheté (ISO), s'il y en a un. */
  hypnoseJusquAu: string | null
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
