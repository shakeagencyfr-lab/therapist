/**
 * Les jetons d'analyse, tels que le serveur les rend au navigateur.
 *
 * Deux lecteurs : l'espace du cabinet (/api/cabinet?volet=jetons) et celui
 * du revendeur (/api/revendeur). Le serveur lit ces mêmes types (server/
 * jetons.ts, server/revendeur.ts) : une seule définition, donc pas de dérive
 * entre ce qu'il envoie et ce que l'écran croit recevoir.
 *
 * Rien ici ne s'exécute : ce fichier ne contient que des types, et le serveur
 * ne l'importe qu'en `import type`.
 *
 * DEUX MODES. En « cle_cabinet », rien ne change : le cabinet paie ses appels
 * avec sa propre clé Anthropic, et il n'y a pas de jetons. En « jetons », la
 * clé du revendeur paie tout, et chaque action coûte ce que dit le barème.
 */

/** Les actions que le barème met à prix. */
export type ActionJetons =
  | 'seance'
  | 'module'
  | 'profil'
  | 'affirmations'
  | 'hypnose'
  | 'retouche'
  | 'retouche_hypnose'

/** Le prix de chaque action, en jetons. */
export type Bareme = Record<ActionJetons, number>

export type ModeFacturation = 'jetons' | 'cle_cabinet'

/** D'où vient un lot : le forfait du mois, l'essai, un achat, l'option Hypnose, un geste du revendeur. */
export type OrigineLot = 'mensuel' | 'essai' | 'achat' | 'option_hypnose' | 'geste'

export type StatutConsommation = 'reserve' | 'confirme' | 'rembourse'

/* ---- Le cabinet --------------------------------------------------------- */

export interface LotJetons {
  origine: OrigineLot
  jetonsInitiaux: number
  restants: number
  /** ISO 8601. */
  expireLe: string
}

export interface RechargeProposee {
  id: string
  libelle: string
  jetons: number
  /** En centimes d'euro, TTC tel que le revendeur l'a fixé. */
  prixCents: number
}

export interface LigneHistorique {
  /** ISO 8601. */
  le: string
  action: ActionJetons
  /** Zéro : une action comprise dans un forfait (consignes d'une séance payée, mouvements d'une hypnose payée). */
  jetons: number
  statut: StatutConsommation
}

/** L'état des jetons d'un cabinet — rien de secret, rien du revendeur au-delà de ses prix. */
export interface EtatJetons {
  mode: ModeFacturation
  /** Le contrat court-il ? Hors contrat, rien ne se dépense ni ne s'achète. */
  enRegle: boolean
  /** Tout ce qui reste, lots non expirés compris. */
  solde: number
  /** Le forfait du mois — seulement pour un contrat actif. */
  mensuel: { total: number; restant: number; /** AAAA-MM-JJ, premier jour du mois suivant. */ renouvellement: string } | null
  /** Le lot d'essai, tant qu'il n'a pas expiré. */
  essai: { total: number; restant: number; fin: string } | null
  /** Ce qui reste des achats, des jetons de l'option et des gestes du revendeur. */
  acheteRestant: number
  lots: LotJetons[]
  hypnose: {
    /** L'hypnose est-elle ouverte maintenant ? */
    droit: boolean
    /** Comprise dans l'offre (ou par exception) : rien à acheter. */
    incluse: boolean
    /** Fin du pass acheté, s'il y en a un. */
    jusquAu: string | null
  }
  bareme: Bareme
  recharges: RechargeProposee[]
  optionHypnose: { prixCents: number; jours: number; jetons: number }
  /** Le revendeur a-t-il ouvert le paiement en ligne ? Sinon, c'est à lui de demander des jetons. */
  paiementPossible: boolean
  /** Les trente dernières actions décomptées. */
  historique: LigneHistorique[]
}

/** Ce qu'un achat démarré rend : la page de paiement du revendeur. */
export interface AchatDemarre {
  url: string
}

/** Ce que rend la vérification au retour de Stripe. */
export interface AchatVerifie {
  /** Le paiement est confirmé et crédité (maintenant, ou déjà avant). */
  ok: boolean
  message: string
  /** Le solde après crédit ; null s'il n'a pas pu être relu. */
  solde: number | null
  objet: 'recharge' | 'option_hypnose'
  jetons: number
  /** Option Hypnose : jusqu'à quand elle est ouverte. */
  hypnoseJusquAu?: string | null
  /** Vrai quand Stripe n'a pas encore confirmé : un nouvel essai a un sens. */
  attente?: boolean
}

/** Ce que l'enveloppe d'une analyse porte en mode jetons, et l'évènement du navigateur. */
export interface JetonsDeLAppel {
  utilises: number
  /** Null quand le solde n'a pas pu être relu après l'appel. */
  solde: number | null
}

/* ---- Le revendeur ------------------------------------------------------- */

export interface RechargeRevendeur extends RechargeProposee {
  actif: boolean
  position: number
  archiveeLe: string | null
}

/** Ce qu'une action coûte vraiment, mesuré sur quatre-vingt-dix jours d'appels. */
export interface CoutReel {
  action: ActionJetons
  /** Appels mesurés. Une hypnose en fait quatre. */
  appels: number
  /** Coût moyen d'un appel, en centimes de dollar (le tarif d'Anthropic). */
  parAppelCentimesUsd: number
  /** Coût moyen d'une action entière (quatre mouvements pour une hypnose), en centimes d'euro. */
  parActionCentimesEur: number
}

export interface CabinetJetons {
  cabinetId: string
  nom: string
  /** Jetons décomptés depuis le premier du mois (Europe/Paris). */
  consommesMois: number
  solde: number
}

export interface EtatRevendeurJetons {
  /** Le revendeur a activé les jetons. */
  actif: boolean
  /** Ce qui vaut vraiment : activés ET une clé posée. */
  mode: ModeFacturation
  /** La clé Anthropic : posée ou non, et depuis quand. Jamais un caractère de la clé. */
  cle: { posee: boolean; poseeLe: string | null }
  stripe: { pose: boolean; poseLe: string | null; compte: string | null }
  bareme: Bareme
  essaiJetons: number
  optionHypnose: { prixCents: number; jours: number; jetons: number }
  recharges: RechargeRevendeur[]
  coutsReels: CoutReel[]
  cabinets: CabinetJetons[]
  /** Le serveur sait-il chiffrer une clé ? Sinon, l'écran le dit avant la saisie. */
  chiffrement: boolean
  /** L'appelant peut-il régler (propriétaire) ou seulement lire (équipe) ? */
  proprietaire: boolean
}

/** Les gestes du propriétaire, un par envoi. */
export type ActionRevendeur =
  | { action: 'cle'; cle: string }
  | { action: 'cle'; retirer: true }
  | { action: 'stripe'; cle: string }
  | { action: 'stripe'; retirer: true }
  | {
      action: 'reglages'
      actif?: boolean
      bareme?: Partial<Bareme>
      essaiJetons?: number
      optionHypnose?: Partial<{ prixCents: number; jours: number; jetons: number }>
    }
  | { action: 'recharge'; id?: string; libelle?: string; jetons?: number; prixCents?: number; actif?: boolean; position?: number }
  | { action: 'recharge'; id: string; archiver: true }
  | { action: 'offrir'; cabinetId: string; jetons: number; note?: string }
