/**
 * Les jetons : qui paie une analyse, et combien elle coûte.
 *
 * DEUX MODES, décidés par le revendeur (0065) — et, depuis 0070, cabinet
 * par cabinet quand il le veut :
 *
 *   cle_cabinet  ce qui a toujours été : chaque cabinet branche sa clé
 *                Anthropic et paie ses appels. Rien n'est décompté. C'est
 *                le mode de tout revendeur qui n'a pas activé les jetons ou
 *                n'a pas posé sa clé — donc de tout le monde au déploiement.
 *
 *   jetons       la clé DU REVENDEUR paie ses cabinets, et chaque action
 *                coûte ce que dit son barème. Le forfait du mois, les
 *                recharges et les gestes du revendeur alimentent le solde.
 *
 * Le réglage du revendeur vaut pour tous ses cabinets ; une exception au
 * contrat (`subscriptions.facturation_ia_override`) le contredit pour l'un
 * d'eux (`modeEffectif`).
 *
 * LA BASE TIENT LE COMPTE, CE MODULE LE PRÉSENTE. Le solde, les lots, la
 * réservation, le remboursement — et, depuis 0068, ce qu'un forfait de
 * séance ou d'hypnose comprend — sont des fonctions SQL réservées au rôle de
 * service. Ce module vérifie que la séance ou l'hypnose citée est bien du
 * cabinet, dit la règle et le plein prix, et traduit les refus en phrases.
 * Le prix PRIS vient de la base, décidé sous le verrou du débit : compté ici,
 * des requêtes simultanées lisaient toutes le même compte et passaient
 * toutes « comprises ».
 *
 * RÉSERVER AVANT, RENDRE SI ÇA ÉCHOUE. Débiter après coup laissait passer
 * deux analyses lancées ensemble sur un solde qui n'en couvrait qu'une ; les
 * jetons sont donc pris avant l'appel au modèle, et rendus s'il n'a rien
 * produit. Une analyse qui échoue ne se paie pas — et une fonction tuée
 * avant d'avoir pu rendre voit sa réservation rendue par la base au bout de
 * dix minutes (0068).
 *
 * Et l'achat : une recharge ou le pass Hypnose, payés par carte sur le
 * compte Stripe du revendeur, sans webhook — la commande est relue chez
 * Stripe au retour, puis à chaque lecture de l'état tant qu'elle attend,
 * comme la boutique le fait pour les patients (server/shop.ts).
 */
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AchatDemarre,
  AchatVerifie,
  ActionJetons,
  Bareme,
  DevisDuProfil,
  EtatJetons,
  JetonsDeLAppel,
  LigneHistorique,
  LotJetons,
  ModeFacturation,
  OrigineLot,
  RechargeProposee,
  StatutConsommation,
} from '../src/types/jetons.js'
import {
  clientAdmin,
  exigerCabinet,
  exigerTitulaire,
  identifier,
  identifierPourGesteSensible,
} from './auth.js'
import { abonnementEnRegle, levierDuCabinet, REFUS_CONTRAT } from './droits.js'
import { HttpError } from './errors.js'
import { MOUVEMENTS } from './prompts.js'
import { dechiffrer } from './secrets.js'
import { hoteNu } from './shop.js'

export type { ActionJetons, Bareme }

/* ------------------------------------------------------------------ *
 * Le barème
 * ------------------------------------------------------------------ */

export const ACTIONS_JETONS: readonly ActionJetons[] = [
  'seance',
  'module',
  'profil',
  'affirmations',
  'hypnose',
  'retouche',
  'retouche_hypnose',
]

/** Les valeurs par défaut de la table `reseller_jetons` (0065), recopiées pour les épreuves et l'écran. */
export const BAREME_PAR_DEFAUT: Bareme = {
  seance: 6,
  module: 3,
  profil: 5,
  affirmations: 1,
  hypnose: 50,
  retouche: 2,
  retouche_hypnose: 8,
}

/**
 * CE QU'UNE SÉANCE PAYÉE COMPREND : UNE ACTUALISATION DU PROFIL, ET C'EST TOUT.
 *
 * Le brouillon d'une séance se paie au barème « séance » — la note. Chaque
 * module retenu se paie ensuite au barème « module », le même que dans
 * l'atelier : un module coûte ce qu'il coûte, d'où qu'on l'écrive (décision
 * du 2 octobre 2026). Quand les consignes étaient comprises dans la séance,
 * quatre modules écrits après une séance ne coûtaient rien, et un seul écrit
 * dans l'atelier en coûtait cinq.
 *
 * Seule l'actualisation du profil qui suit la séance reste comprise, une
 * fois : la base l'applique (`jetons_prix_du_forfait`, 0068), sous le verrou
 * du débit.
 */
export const PROFILS_PAR_SEANCE = 1

/**
 * UNE HYPNOSE SE PAIE UNE FOIS, PAS QUATRE. Elle s'écrit en quatre appels, un
 * par mouvement : le premier ouvre une série au prix d'une hypnose, et chacun
 * des quatre mouvements y est compris une fois. Un mouvement déjà écrit dans
 * la série — ou un cinquième appel — ouvre une nouvelle série, payée comme
 * une nouvelle hypnose. Un appel raté est rendu et ne compte pas : le
 * reprendre reste gratuit. La base en décide (0068), sous le verrou.
 *
 * Avant 0068, huit appels quelconques étaient compris par identifiant : de
 * quoi écrire deux hypnoses entières pour le prix d'une.
 */
export const MOUVEMENTS_PAR_HYPNOSE = MOUVEMENTS.length

/* ------------------------------------------------------------------ *
 * Qui paie
 * ------------------------------------------------------------------ */

export type Facturation =
  | { mode: 'cle_cabinet' }
  | {
      mode: 'jetons'
      resellerId: string
      /** La clé Anthropic du revendeur, déchiffrée. Elle ne quitte jamais le serveur. */
      cle: string
      bareme: Bareme
      /** Le revendeur a-t-il branché Stripe ? Le refus faute de jetons le dit. */
      paiement: boolean
    }

/** Une ligne de `reseller_jetons`. */
export interface ReglagesJetons {
  reseller_id: string
  actif: boolean
  bareme_seance: number
  bareme_module: number
  bareme_profil: number
  bareme_affirmations: number
  bareme_hypnose: number
  bareme_retouche: number
  bareme_retouche_hypnose: number
  essai_jetons: number
  option_hypnose_prix_cents: number
  option_hypnose_jours: number
  option_hypnose_jetons: number
  cle_posee_le: string | null
  stripe_pose_le: string | null
  stripe_compte: string | null
}

export const COLONNES_REGLAGES =
  'reseller_id, actif, bareme_seance, bareme_module, bareme_profil, bareme_affirmations, bareme_hypnose, bareme_retouche, bareme_retouche_hypnose, essai_jetons, option_hypnose_prix_cents, option_hypnose_jours, option_hypnose_jetons, cle_posee_le, stripe_pose_le, stripe_compte'

/** Le barème d'une ligne de réglages — les valeurs par défaut pour ce qui manque. */
export function baremeDe(r: Partial<ReglagesJetons> | null | undefined): Bareme {
  const lu = (v: unknown, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : d)
  return {
    seance: lu(r?.bareme_seance, BAREME_PAR_DEFAUT.seance),
    module: lu(r?.bareme_module, BAREME_PAR_DEFAUT.module),
    profil: lu(r?.bareme_profil, BAREME_PAR_DEFAUT.profil),
    affirmations: lu(r?.bareme_affirmations, BAREME_PAR_DEFAUT.affirmations),
    hypnose: lu(r?.bareme_hypnose, BAREME_PAR_DEFAUT.hypnose),
    retouche: lu(r?.bareme_retouche, BAREME_PAR_DEFAUT.retouche),
    retouche_hypnose: lu(r?.bareme_retouche_hypnose, BAREME_PAR_DEFAUT.retouche_hypnose),
  }
}

function panneDeLecture(cause: string): HttpError {
  // Journal technique seulement : jamais une clé.
  console.error(`[jetons] lecture — ${cause}`)
  return new HttpError(503, "Vos jetons n'ont pas pu être lus. Réessayez dans un instant : rien n'a été produit.")
}

/** L'exception de facturation d'un contrat, lue telle quelle : null si elle ne dit rien de connu. */
export function overrideLu(valeur: unknown): ModeFacturation | null {
  return valeur === 'jetons' || valeur === 'cle_cabinet' ? valeur : null
}

/**
 * Le mode effectif d'un cabinet — pure, et la règle de la base
 * (`facturation_ia_du_cabinet`, 0070) :
 *
 *   l'exception du contrat, si elle est posée ;
 *   sinon le réglage du revendeur : jetons activés ET sa clé posée (0065).
 *
 * Des jetons FORCÉS restent des jetons même sans la clé du revendeur :
 * retomber sur la clé du cabinet ferait payer la praticienne pour ce que son
 * revendeur a promis de payer. `facturationDuCabinet` refuse alors l'appel.
 */
export function modeEffectif(o: { override: unknown; actif: boolean; clePosee: boolean }): ModeFacturation {
  return overrideLu(o.override) ?? (o.actif && o.clePosee ? 'jetons' : 'cle_cabinet')
}

/**
 * Le refus d'un cabinet placé en jetons dont le revendeur n'a plus de clé.
 * Un 503 : ce n'est ni la faute de la praticienne, ni un manque de jetons —
 * c'est un réglage de son revendeur, qu'elle peut seulement lui signaler.
 */
export const REFUS_JETONS_SANS_CLE =
  "Votre revendeur a placé votre cabinet en jetons, mais sa clé d'analyse n'est pas posée : l'analyse en jetons est suspendue jusqu'à ce qu'il la pose. Prévenez-le ; rien n'a été produit, ni décompté."

/**
 * Le mode de facturation d'un cabinet, et de quoi l'appliquer.
 *
 * La règle est celle de la base (`facturation_ia_du_cabinet`, 0070) :
 * l'exception du contrat, sinon jetons activés ET une clé posée. Sans
 * exception, l'un sans l'autre laisse au cabinet sa clé — un revendeur qui
 * active les jetons avant d'avoir branché la sienne ne coupe l'analyse de
 * personne.
 *
 * UNE PANNE NE VAUT PAS « CLÉ DU CABINET ». Retomber sur la clé du cabinet
 * quand les réglages ne se lisent pas, c'est faire payer la praticienne pour
 * une analyse que son revendeur a promis de payer. On refuse, et l'on dit de
 * réessayer. De même pour des jetons forcés sans la clé du revendeur : un
 * 503 qui le dit, jamais un repli.
 */
export async function facturationDuCabinet(
  cabinetId: string,
  db: SupabaseClient | null = clientAdmin(),
): Promise<Facturation> {
  if (!db) return { mode: 'cle_cabinet' }
  const [cabinet, contrat] = await Promise.all([
    db.from('cabinets').select('reseller_id').eq('id', cabinetId).maybeSingle<{ reseller_id: string | null }>(),
    db
      .from('subscriptions')
      .select('facturation_ia_override')
      .eq('cabinet_id', cabinetId)
      .maybeSingle<{ facturation_ia_override: string | null }>(),
  ])
  if (cabinet.error) throw panneDeLecture(cabinet.error.message)
  if (contrat.error) throw panneDeLecture(contrat.error.message)
  const resellerId = cabinet.data?.reseller_id
  if (!resellerId) return { mode: 'cle_cabinet' }

  const [reglages, secrets] = await Promise.all([
    db.from('reseller_jetons').select(COLONNES_REGLAGES).eq('reseller_id', resellerId).maybeSingle<ReglagesJetons>(),
    db
      .from('reseller_secrets')
      .select('anthropic_key_enc, stripe_secret_enc')
      .eq('reseller_id', resellerId)
      .maybeSingle<{ anthropic_key_enc: string | null; stripe_secret_enc: string | null }>(),
  ])
  if (reglages.error) throw panneDeLecture(reglages.error.message)
  if (secrets.error) throw panneDeLecture(secrets.error.message)
  const mode = modeEffectif({
    override: contrat.data?.facturation_ia_override,
    actif: reglages.data?.actif === true,
    clePosee: Boolean(secrets.data?.anthropic_key_enc),
  })
  if (mode === 'cle_cabinet') return { mode: 'cle_cabinet' }
  if (!secrets.data?.anthropic_key_enc) {
    // Seuls des jetons forcés arrivent ici : sans exception, pas de clé veut dire clé du cabinet.
    console.error(`[jetons] cabinet ${cabinetId} placé en jetons, revendeur ${resellerId} sans clé`)
    throw new HttpError(503, REFUS_JETONS_SANS_CLE)
  }

  let cle: string
  try {
    cle = dechiffrer(secrets.data.anthropic_key_enc)
  } catch {
    console.error(`[jetons] clé du revendeur ${resellerId} illisible`)
    throw new HttpError(
      503,
      "La clé d'analyse de votre revendeur est illisible sur ce serveur : prévenez-le, c'est un réglage de son espace. Rien n'a été produit.",
    )
  }
  return {
    mode: 'jetons',
    resellerId,
    cle,
    bareme: baremeDe(reglages.data),
    paiement: Boolean(secrets.data.stripe_secret_enc),
  }
}

/* ------------------------------------------------------------------ *
 * Combien coûte un appel
 * ------------------------------------------------------------------ */

/**
 * La règle qui dit si un appel est compris dans un forfait déjà payé — la
 * base l'applique (`jetons_prix_du_forfait`, 0068) :
 *
 *   prix     le plein prix, toujours ;
 *   seance   un module ou un profil tiré d'une séance du cabinet ;
 *   hypnose  un mouvement d'une hypnose du cabinet.
 */
export type RegleDeForfait = 'prix' | 'seance' | 'hypnose'

/**
 * Ce qu'un appel demande à la base : l'action, son plein prix, ce à quoi il
 * se rattache, et la règle du forfait. PAS le prix payé : celui-là, la base
 * le décide sous le verrou du cabinet, et `reserver` le rend.
 */
export interface Cout {
  action: ActionJetons
  /** Le prix au barème — ce que l'appel coûte s'il n'est compris dans rien. */
  prix: number
  /** La séance ou l'hypnose de l'appel, reconnue au cabinet ; null sinon. */
  ref: string | null
  regle: RegleDeForfait
  /** Le mouvement d'une hypnose ; null pour le reste. */
  mouvement: string | null
}

/**
 * Ce que la base sait des identifiants envoyés par le navigateur. Injecté,
 * pour que la règle s'éprouve sans base.
 *
 * Seulement l'APPARTENANCE : combien une séance ou une hypnose a déjà
 * consommé, la base le compte elle-même au moment de débiter. Le compter
 * ici, hors du verrou, laissait cinquante requêtes simultanées lire le même
 * compte et passer toutes « comprises ».
 */
export interface Recherches {
  /** La séance existe-t-elle, et est-elle de CE cabinet ? */
  seanceDuCabinet(sessionId: string): Promise<boolean>
  /**
   * L'hypnose existe-t-elle, et est-elle de CE cabinet ? Sur une fiche, ou
   * dans la bibliothèque du cabinet (0071) : une hypnose écrite dans
   * l'atelier s'ouvre là, et le forfait de ses quatre mouvements tient à son
   * identifiant comme à celui d'une hypnose de fiche.
   */
  hypnoseDuCabinet(hypnoseId: string): Promise<boolean>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Un identifiant, s'il en a la forme ; null sinon. */
export function uuidDe(valeur: unknown): string | null {
  const texte = typeof valeur === 'string' ? valeur.trim().toLowerCase() : ''
  return UUID.test(texte) ? texte : null
}

/**
 * Ce qu'un appel demande à la base, selon le barème et les forfaits.
 *
 *   session-draft  une séance, au barème ; l'identifiant de la séance, s'il
 *                  est du cabinet, est inscrit : c'est lui qui ouvre le forfait.
 *   module         toujours un module au barème, en séance comme dans
 *                  l'atelier ; la séance du cabinet, s'il y en a une, est
 *                  inscrite pour l'historique.
 *   profile        règle « seance » si l'appel porte une séance du cabinet :
 *                  compris quand son brouillon est payé, une fois ; sinon,
 *                  un profil au barème.
 *   affirmations   toujours au barème.
 *   hypnose        l'hypnose doit être ouverte en base et être du cabinet —
 *                  sur une fiche, ou dans sa bibliothèque (0071) —, et le
 *                  mouvement l'un des quatre ; règle « hypnose ».
 *   revision       une retouche (0066, server/retouche.ts) : plus chère sur
 *                  un mouvement d'hypnose, toujours au barème.
 *
 * La PREUVE est côté serveur : l'identifiant envoyé par le navigateur n'est
 * cru que si la base le reconnaît au cabinet. Un identifiant inventé paie le
 * plein prix. Et ce qui est COMPRIS se décide en base, sous le verrou du
 * débit (`reserver`) : ici, on ne fait que dire la règle.
 */
export async function coutDeLAppel(
  route: string,
  body: Record<string, unknown>,
  bareme: Bareme,
  r: Recherches,
): Promise<Cout> {
  const plein = (action: ActionJetons, ref: string | null = null): Cout => ({
    action,
    prix: bareme[action],
    ref,
    regle: 'prix',
    mouvement: null,
  })
  switch (route) {
    case 'session-draft': {
      const seance = uuidDe(body.sessionId)
      return plein('seance', seance && (await r.seanceDuCabinet(seance)) ? seance : null)
    }
    case 'module': {
      const seance = uuidDe(body.sessionId)
      return plein('module', seance && (await r.seanceDuCabinet(seance)) ? seance : null)
    }
    case 'profile': {
      const seance = uuidDe(body.sessionId)
      if (!seance || !(await r.seanceDuCabinet(seance))) return plein('profil')
      return { action: 'profil', prix: bareme.profil, ref: seance, regle: 'seance', mouvement: null }
    }
    case 'affirmations':
      return plein('affirmations')
    case 'hypnose': {
      /* L'hypnose s'ouvre en base AVANT d'être écrite (useEcritureHypnose) :
         sans elle, rien ne relie les quatre mouvements, et chacun serait
         payé comme une hypnose entière. On refuse avant toute dépense. */
      const hypnose = uuidDe(body.hypnoseId)
      if (!hypnose || !(await r.hypnoseDuCabinet(hypnose))) {
        throw new HttpError(
          400,
          "Cette hypnose n'est ouverte ni dans le dossier, ni dans la bibliothèque du cabinet. Rechargez la page, puis relancez : rien n'a été produit, ni décompté.",
        )
      }
      // Le mouvement fait le forfait : il se vérifie avant de réserver.
      const mouvement = typeof body.mouvement === 'string' ? body.mouvement.trim() : ''
      if (!(MOUVEMENTS as readonly string[]).includes(mouvement)) {
        throw new HttpError(400, "Ce mouvement d'hypnose n'existe pas.")
      }
      return { action: 'hypnose', prix: bareme.hypnose, ref: hypnose, regle: 'hypnose', mouvement }
    }
    case 'revision':
    case 'retouche':
      return plein(String(body.cible ?? '') === 'hypnose' ? 'retouche_hypnose' : 'retouche')
    default:
      throw new HttpError(404, "Cette analyse n'existe pas.")
  }
}

/** Les recherches de `coutDeLAppel`, faites en base avec la clé de service. */
export function recherchesPour(cabinetId: string, db: SupabaseClient): Recherches {
  const existe = async (
    table: 'therapy_sessions' | 'hypnoses' | 'bibliotheque_hypnoses',
    id: string,
  ): Promise<boolean> => {
    const { data, error } = await db
      .from(table)
      .select('id')
      .eq('id', id)
      .eq('cabinet_id', cabinetId)
      .maybeSingle<{ id: string }>()
    if (error) throw panneDeLecture(error.message)
    return Boolean(data)
  }
  return {
    seanceDuCabinet: (id) => existe('therapy_sessions', id),
    /* La fiche d'abord : c'est le cas de presque toutes les écritures, et
       une seule lecture leur suffit. Les identifiants ne se croisent pas
       entre les deux tables : chacune tire les siens. */
    hypnoseDuCabinet: async (id) => (await existe('hypnoses', id)) || (await existe('bibliotheque_hypnoses', id)),
  }
}

/* ------------------------------------------------------------------ *
 * Réserver, confirmer, rendre
 * ------------------------------------------------------------------ */

/** « 1 jeton », « 12 jetons » — et « 0 jeton », comme on le dit. */
export function jetonsDits(n: number): string {
  return `${n.toLocaleString('fr-FR')} jeton${Math.abs(n) > 1 ? 's' : ''}`
}

/**
 * Le solde ne couvre pas l'action.
 *
 * Une classe à part, et non un simple 402 : la tâche du lundi saute un
 * cabinet à court de jetons sans le compter en panne, et elle doit pouvoir
 * le distinguer d'une clé refusée, qui dit aussi 402.
 */
export class SoldeInsuffisant extends HttpError {
  constructor(
    readonly solde: number,
    readonly besoin: number,
    paiement: boolean,
  ) {
    super(402, messageSoldeInsuffisant(solde, besoin, paiement))
    this.name = 'SoldeInsuffisant'
  }
}

/** Ce que l'écran lit quand les jetons manquent : combien il en reste, et où en trouver. */
export function messageSoldeInsuffisant(solde: number, besoin: number, paiement: boolean): string {
  const constat = `Il vous reste ${jetonsDits(solde)}, et cette action en demande ${besoin.toLocaleString('fr-FR')}. Rien n'a été produit.`
  return paiement
    ? `${constat} Achetez une recharge dans Intégrations › Jetons IA, puis relancez.`
    : `${constat} Demandez des jetons à votre revendeur : le paiement en ligne n'est pas ouvert. Votre forfait se renouvelle aussi le premier du mois.`
}

/** Le solde et le besoin, lus dans le détail du refus de la base (`jetons_debiter`, que `jetons_debiter_forfait` appelle). */
export function lireRefusDeSolde(details: string | null | undefined, besoin: number): { solde: number; besoin: number } {
  try {
    const lu = JSON.parse(details ?? '') as { solde?: unknown; besoin?: unknown }
    return {
      solde: typeof lu.solde === 'number' ? lu.solde : 0,
      besoin: typeof lu.besoin === 'number' ? lu.besoin : besoin,
    }
  } catch {
    return { solde: 0, besoin }
  }
}

/** Ce que la base a réservé : la consommation, et le prix qu'elle a vraiment pris. */
export interface Reservation {
  consommation: string
  /** Zéro quand l'appel était compris dans un forfait. */
  jetons: number
  compris: boolean
}

/** La réponse de `jetons_debiter_forfait`, vérifiée — null si elle n'en a pas la forme. */
export function lireReservation(data: unknown): Reservation | null {
  const r = (data ?? {}) as { consommation?: unknown; jetons?: unknown; compris?: unknown }
  if (typeof r.consommation !== 'string' || !r.consommation) return null
  if (typeof r.jetons !== 'number' || !Number.isInteger(r.jetons) || r.jetons < 0) return null
  return { consommation: r.consommation, jetons: r.jetons, compris: r.compris === true }
}

/**
 * Réserve les jetons d'un appel, AU PRIX QUE LA BASE DÉCIDE.
 *
 * `jetons_debiter_forfait` (0068) prend le verrou du cabinet, compte ce que
 * la séance ou l'hypnose a déjà consommé, choisit « compris » ou le plein
 * prix, et débite — d'un seul geste. Deux appels lancés ensemble passent
 * l'un après l'autre : le second voit ce que le premier a inscrit, et ne
 * passe pas compris à sa suite.
 */
export async function reserver(
  cabinetId: string,
  cout: Cout,
  facturation: Extract<Facturation, { mode: 'jetons' }>,
  db: SupabaseClient,
): Promise<Reservation> {
  const { data, error } = await db.rpc('jetons_debiter_forfait', {
    p_cabinet: cabinetId,
    p_action: cout.action,
    p_prix: cout.prix,
    p_ref: cout.ref,
    p_regle: cout.regle,
    p_mouvement: cout.mouvement,
  })
  if (error) {
    if (error.code === 'KL402') {
      const { solde, besoin } = lireRefusDeSolde(error.details, cout.prix)
      throw new SoldeInsuffisant(solde, besoin, facturation.paiement)
    }
    throw panneDeLecture(error.message)
  }
  const reservation = lireReservation(data)
  if (!reservation) throw panneDeLecture('réservation sans identifiant')
  return reservation
}

/**
 * L'appel a produit : la réservation devient une dépense. Un échec ici ne
 * défait pas l'analyse — elle est écrite. On retente une fois : une
 * réservation restée « reserve » est rendue d'elle-même au bout de dix
 * minutes (0068), et l'analyse serait alors offerte. Le journal le dit.
 */
export async function confirmer(consommation: string, db: SupabaseClient): Promise<void> {
  for (let essai = 0; essai < 2; essai++) {
    try {
      const { error } = await db.rpc('jetons_confirmer', { p_consommation: consommation })
      if (!error) return
      console.error(`[jetons] confirmation ${consommation} — ${error.message}`)
    } catch (err) {
      console.error(`[jetons] confirmation ${consommation} — ${(err as Error).message}`)
    }
  }
}

/**
 * L'appel a échoué : les jetons reviennent. Ne lève jamais — l'erreur de
 * l'appel est celle que l'écran doit lire, pas celle du remboursement. Si la
 * base ne répond pas, la réservation reste « reserve » et sera rendue d'elle-
 * même au bout de dix minutes (0068).
 */
export async function rembourser(consommation: string, db: SupabaseClient): Promise<void> {
  try {
    const { error } = await db.rpc('jetons_rembourser', { p_consommation: consommation })
    if (error) console.error(`[jetons] remboursement ${consommation} — ${error.message}`)
  } catch (err) {
    console.error(`[jetons] remboursement ${consommation} — ${(err as Error).message}`)
  }
}

/** Le solde d'un cabinet, lots non expirés ; null s'il ne se lit pas. */
export async function soldeDuCabinet(cabinetId: string, db: SupabaseClient): Promise<number | null> {
  const { data, error } = await db
    .from('jetons_lots')
    .select('restants')
    .eq('cabinet_id', cabinetId)
    .gt('expire_le', new Date().toISOString())
  if (error) {
    console.warn(`[jetons] solde ${cabinetId} — ${error.message}`)
    return null
  }
  return ((data ?? []) as Array<{ restants: number }>).reduce((s, l) => s + (l.restants ?? 0), 0)
}

/** Ce que l'enveloppe d'une analyse porte en mode jetons : le prix réellement pris. */
export function jetonsDeLAppel(reservation: Reservation, solde: number | null): JetonsDeLAppel {
  return { utilises: reservation.jetons, solde }
}

/* ------------------------------------------------------------------ *
 * L'état, pour l'écran du cabinet
 * ------------------------------------------------------------------ */

interface EtatJetonsBrut {
  mode?: string
  pret?: boolean
  en_regle?: boolean
  solde?: number
  mensuel?: { total?: number; restant?: number; renouvellement?: string } | null
  essai?: { total?: number; restant?: number; fin?: string } | null
  achete_restant?: number
  lots?: Array<{ origine?: string; jetons_initiaux?: number; restants?: number; expire_le?: string }>
  hypnose?: { droit?: boolean; incluse?: boolean; jusqu_au?: string | null }
  bareme?: Partial<Record<ActionJetons, number>>
  recharges?: Array<{ id?: string; libelle?: string; jetons?: number; prix_cents?: number }>
  option_hypnose?: { prix_cents?: number; jours?: number; jetons?: number }
  paiement_possible?: boolean
  historique?: Array<{ le?: string; action?: string; jetons?: number; statut?: string }>
}

const nombre = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Ce que rend `cabinet_jetons()`, à la forme de l'écran. */
export function versEtatJetons(brut: unknown): EtatJetons {
  const b = (brut ?? {}) as EtatJetonsBrut
  const bareme = b.bareme ?? {}
  return {
    mode: b.mode === 'jetons' ? 'jetons' : 'cle_cabinet',
    /* Une base d'avant 0070 ne dit pas « pret » : ses jetons ne valaient
       qu'avec la clé du revendeur, ils l'étaient donc. */
    pret: b.mode === 'jetons' && b.pret !== false,
    enRegle: b.en_regle === true,
    solde: nombre(b.solde),
    mensuel: b.mensuel
      ? { total: nombre(b.mensuel.total), restant: nombre(b.mensuel.restant), renouvellement: String(b.mensuel.renouvellement ?? '') }
      : null,
    essai: b.essai
      ? { total: nombre(b.essai.total), restant: nombre(b.essai.restant), fin: String(b.essai.fin ?? '') }
      : null,
    acheteRestant: nombre(b.achete_restant),
    lots: (b.lots ?? []).map(
      (l): LotJetons => ({
        origine: String(l.origine ?? '') as OrigineLot,
        jetonsInitiaux: nombre(l.jetons_initiaux),
        restants: nombre(l.restants),
        expireLe: String(l.expire_le ?? ''),
      }),
    ),
    hypnose: {
      droit: b.hypnose?.droit === true,
      incluse: b.hypnose?.incluse === true,
      jusquAu: b.hypnose?.jusqu_au ?? null,
    },
    bareme: baremeDe({
      bareme_seance: bareme.seance,
      bareme_module: bareme.module,
      bareme_profil: bareme.profil,
      bareme_affirmations: bareme.affirmations,
      bareme_hypnose: bareme.hypnose,
      bareme_retouche: bareme.retouche,
      bareme_retouche_hypnose: bareme.retouche_hypnose,
    }),
    recharges: (b.recharges ?? []).map(
      (r): RechargeProposee => ({
        id: String(r.id ?? ''),
        libelle: String(r.libelle ?? ''),
        jetons: nombre(r.jetons),
        prixCents: nombre(r.prix_cents),
      }),
    ),
    optionHypnose: {
      prixCents: nombre(b.option_hypnose?.prix_cents),
      jours: nombre(b.option_hypnose?.jours),
      jetons: nombre(b.option_hypnose?.jetons),
    },
    paiementPossible: b.paiement_possible === true,
    historique: (b.historique ?? []).map(
      (h): LigneHistorique => ({
        le: String(h.le ?? ''),
        action: String(h.action ?? '') as ActionJetons,
        jetons: nombre(h.jetons),
        statut: String(h.statut ?? '') as StatutConsommation,
      }),
    ),
  }
}

/**
 * L'état des jetons du cabinet de l'appelant.
 *
 * Lu SOUS SON JETON : `cabinet_jetons()` vérifie qu'il est membre du cabinet
 * (second facteur compris) et ne rend rien sinon. Tout membre le lit — le
 * solde se montre à qui lance une analyse ; l'achat, lui, est au titulaire.
 *
 * LES ACHATS EN SUSPENS SE CONCLUENT D'ABORD. Le retour de Stripe n'était
 * lu qu'une fois, dans l'onglet qui revenait de payer : un onglet fermé, un
 * réseau coupé, une vérification en échec, et la commande restait « en
 * attente » pour toujours, l'argent encaissé et rien de crédité. Chaque
 * lecture de l'état relit donc chez Stripe les commandes du cabinet encore
 * en attente (`reprendreCommandesEnAttente`) — comme la boutique le fait
 * pour ses patients (server/shop.ts). Une panne de cette reprise ne coûte
 * jamais la lecture : la suivante réessaiera.
 */
export async function etatJetons(token: string | null): Promise<EtatJetons> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const db = clientAdmin()
  if (db) {
    await reprendreCommandesEnAttente(cabinetId, db).catch((err: unknown) => {
      console.error(`[jetons] reprise des commandes — ${(err as Error).message}`)
    })
  }
  const { data, error } = await appelant.client.rpc('cabinet_jetons', { p_cabinet: cabinetId })
  if (error) throw panneDeLecture(error.message)
  if (data === null) throw new HttpError(403, "Les jetons de ce cabinet ne vous sont pas ouverts.")
  return versEtatJetons(data)
}

/**
 * L'actualisation du profil tirée de cette séance serait-elle comprise ?
 *
 * Le brouillon d'une séance comprend UNE actualisation du profil, et
 * seulement s'il a été payé. L'écran l'annonçait « incluse » dès qu'une
 * séance existait — la seconde, ou celle d'une séance analysée avant les
 * jetons, se payait sans prévenir. On demande à la base, avec la même règle
 * que le débit (`jetons_prix_du_forfait`, 0068) : un devis, qui n'écrit rien
 * et ne réserve rien.
 */
export async function devisDuProfil(token: string | null, raw: unknown): Promise<DevisDuProfil> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const body = (raw && typeof raw === 'object' ? raw : {}) as { seance?: unknown }
  const seance = uuidDe(body.seance)
  if (!seance) return { profilCompris: false }
  const db = admin()
  if (!(await recherchesPour(cabinetId, db).seanceDuCabinet(seance))) return { profilCompris: false }
  const { data, error } = await db.rpc('jetons_prix_du_forfait', {
    p_cabinet: cabinetId,
    p_action: 'profil',
    p_prix: 0,
    p_ref: seance,
    p_regle: 'seance',
    p_mouvement: null,
  })
  if (error) throw panneDeLecture(error.message)
  return { profilCompris: (data as { compris?: unknown } | null)?.compris === true }
}

/* ------------------------------------------------------------------ *
 * Acheter : une recharge, ou le pass Hypnose
 * ------------------------------------------------------------------ */

const SITE = (process.env.PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')

function admin(): SupabaseClient {
  const db = clientAdmin()
  if (!db) throw new HttpError(503, "Le serveur n'a pas sa clé de service : l'achat de jetons est indisponible.")
  return db
}

/**
 * Où revenir après le paiement — pure, et le miroir de `adresseDeRetour`
 * (server/shop.ts) pour l'espace de la praticienne, qui vit à la racine.
 *
 * L'hôte de la requête ne fabrique aucune adresse : il CHOISIT entre le
 * domaine du cabinet (vérifié, marque blanche ouverte) et `PUBLIC_SITE_URL`,
 * deux adresses que le serveur connaît déjà. Revenir ailleurs que là d'où
 * l'on est parti, c'est revenir déconnecté : la session vit domaine par
 * domaine.
 */
export function adresseDeRetourPraticienne(o: { site: string; domaine: string | null; hote: string | null }): string {
  if (o.domaine && o.hote && hoteNu(o.hote) === hoteNu(o.domaine)) {
    return `https://${hoteNu(o.domaine)}/`
  }
  return `${o.site}/`
}

async function retourDeLaPraticienne(cabinetId: string, db: SupabaseClient, hote: string | null): Promise<string> {
  if (!(await levierDuCabinet(cabinetId, 'marqueBlanche', db))) {
    return adresseDeRetourPraticienne({ site: SITE, domaine: null, hote })
  }
  const { data } = await db
    .from('cabinet_domains')
    .select('domaine, verifie')
    .eq('cabinet_id', cabinetId)
    .maybeSingle<{ domaine: string; verifie: boolean }>()
  const domaine = data?.verifie && data.domaine ? data.domaine : null
  return adresseDeRetourPraticienne({ site: SITE, domaine, hote })
}

/** La clé Stripe du revendeur, déchiffrée, ou null s'il n'en a pas posé. */
export async function cleStripeDuRevendeur(resellerId: string, db: SupabaseClient): Promise<string | null> {
  const { data } = await db
    .from('reseller_secrets')
    .select('stripe_secret_enc')
    .eq('reseller_id', resellerId)
    .maybeSingle<{ stripe_secret_enc: string | null }>()
  if (!data?.stripe_secret_enc) return null
  return dechiffrer(data.stripe_secret_enc)
}

async function stripeDuRevendeur(resellerId: string, db: SupabaseClient): Promise<Stripe> {
  const cle = await cleStripeDuRevendeur(resellerId, db)
  if (!cle) {
    throw new HttpError(
      409,
      "Votre revendeur n'a pas encore ouvert le paiement en ligne : demandez-lui directement des jetons, ou l'option Hypnose.",
    )
  }
  return new Stripe(cle)
}

/** Une ligne de `jetons_commandes`. */
export interface CommandeJetons {
  id: string
  cabinet_id: string
  reseller_id: string
  objet: 'recharge' | 'option_hypnose'
  recharge_id: string | null
  libelle: string
  jetons: number
  jours: number | null
  prix_cents: number
  devise: string
  stripe_session_id: string | null
  statut: 'en_attente' | 'payee' | 'annulee'
}

const COLONNES_COMMANDE =
  'id, cabinet_id, reseller_id, objet, recharge_id, libelle, jetons, jours, prix_cents, devise, stripe_session_id, statut'

export interface AchatBody {
  /** L'identifiant d'une recharge du revendeur. */
  recharge?: string
  /** « hypnose » : le pass Hypnose. */
  option?: string
}

/**
 * La commande du pass Hypnose, aux réglages du revendeur — pure.
 *
 * LES JETONS DU PASS NE VALENT QU'EN MODE JETONS. Un cabinet qui paie
 * l'analyse avec sa propre clé ne dépense jamais de jetons : lui en verser
 * deux cents, c'était un lot que rien ne pouvait entamer, et un « 200 jetons
 * l'accompagnent » au retour du paiement que l'écran d'achat s'était bien
 * gardé d'annoncer (VerrouHypnose). Hors du mode jetons, la commande en
 * porte zéro : `jetons_encaisser` ne verse alors aucun lot, et la
 * conclusion n'en parle pas.
 */
export function commandeDuPass(
  r: Pick<ReglagesJetons, 'option_hypnose_jours' | 'option_hypnose_jetons' | 'option_hypnose_prix_cents'>,
  modeJetons: boolean,
): Pick<CommandeJetons, 'objet' | 'recharge_id' | 'libelle' | 'jetons' | 'jours' | 'prix_cents'> {
  return {
    objet: 'option_hypnose',
    recharge_id: null,
    libelle: `Option Hypnose — ${r.option_hypnose_jours} jour${r.option_hypnose_jours > 1 ? 's' : ''}`,
    jetons: modeJetons ? r.option_hypnose_jetons : 0,
    jours: r.option_hypnose_jours,
    prix_cents: r.option_hypnose_prix_cents,
  }
}

async function resellerDuCabinet(cabinetId: string, db: SupabaseClient): Promise<string> {
  const { data, error } = await db
    .from('cabinets')
    .select('reseller_id')
    .eq('id', cabinetId)
    .maybeSingle<{ reseller_id: string }>()
  if (error || !data?.reseller_id) throw panneDeLecture(error?.message ?? 'cabinet sans revendeur')
  return data.reseller_id
}

/**
 * Démarrer un achat : la commande s'écrit « en attente », au prix de la base
 * — jamais à celui que le navigateur annoncerait —, puis Stripe ouvre sa page
 * de paiement sur le compte du revendeur.
 *
 * AU TITULAIRE SEUL, comme la clé Stripe ou la clé Anthropic : c'est l'argent
 * du cabinet qui part. Et en « aal2 » pour un compte protégé.
 */
export async function demarrerAchatJetons(
  token: string | null,
  raw: unknown,
  hote: string | null = null,
): Promise<AchatDemarre> {
  const appelant = await identifierPourGesteSensible(token)
  const cabinetId = exigerCabinet(appelant)
  await exigerTitulaire(appelant, cabinetId, "L'achat de jetons")
  const body = (raw && typeof raw === 'object' ? raw : {}) as AchatBody

  const db = admin()
  if (!(await abonnementEnRegle(cabinetId, db))) throw new HttpError(403, REFUS_CONTRAT)
  const resellerId = await resellerDuCabinet(cabinetId, db)
  const { data: reglages, error: eReglages } = await db.rpc('jetons_reglages', { p_reseller: resellerId })
  if (eReglages || !reglages) throw panneDeLecture(eReglages?.message ?? 'réglages absents')
  const r = reglages as ReglagesJetons

  let commande: Pick<CommandeJetons, 'objet' | 'recharge_id' | 'libelle' | 'jetons' | 'jours' | 'prix_cents'>
  if (body.option === 'hypnose') {
    /* Rien à vendre à qui l'a déjà : l'offre ou l'exception l'ouvrent pour
       de bon. Un pass en cours, lui, se prolonge — on peut le racheter. */
    const { data: abo } = await db
      .from('subscriptions')
      .select('plan_code, hypnose_override')
      .eq('cabinet_id', cabinetId)
      .maybeSingle<{ plan_code: string; hypnose_override: boolean | null }>()
    const { data: offre } = abo
      ? await db.from('plans').select('hypnose_incluse').eq('code', abo.plan_code).maybeSingle<{ hypnose_incluse: boolean }>()
      : { data: null }
    if ((abo?.hypnose_override ?? offre?.hypnose_incluse) === true) {
      throw new HttpError(409, "L'hypnose est déjà comprise dans votre offre : il n'y a rien à acheter.")
    }
    /* Le mode DU CABINET (0070), par la règle de la base, sans déchiffrer la
       clé du revendeur : une clé illisible ne doit pas empêcher d'acheter un
       pass. Un cabinet gardé sur sa clé chez un revendeur en jetons n'a que
       faire des jetons du pass ; un cabinet passé seul en jetons, si. */
    const { data: mode, error: eMode } = await db.rpc('facturation_ia_du_cabinet', { p_cabinet: cabinetId })
    if (eMode) throw panneDeLecture(eMode.message)
    commande = commandeDuPass(r, mode === 'jetons')
  } else {
    const rechargeId = uuidDe(body.recharge)
    if (!rechargeId) throw new HttpError(400, 'Choisissez une recharge.')
    /* PAS DE RECHARGE EN CLÉ DU CABINET : c'est le mode effectif du cabinet
       qui compte (0070), pas celui du revendeur. Des jetons forcés sans la
       clé du revendeur refusent ici aussi (503) : on ne vend pas des jetons
       que rien ne peut dépenser. */
    const facturation = await facturationDuCabinet(cabinetId, db)
    if (facturation.mode !== 'jetons') {
      throw new HttpError(
        409,
        "Votre cabinet règle l'analyse avec sa propre clé Anthropic : il n'a pas de jetons à recharger.",
      )
    }
    const { data: recharge } = await db
      .from('jetons_recharges')
      .select('id, reseller_id, libelle, jetons, prix_cents, actif, archivee_le')
      .eq('id', rechargeId)
      .maybeSingle<{
        id: string
        reseller_id: string
        libelle: string
        jetons: number
        prix_cents: number
        actif: boolean
        archivee_le: string | null
      }>()
    if (!recharge || recharge.reseller_id !== resellerId || !recharge.actif || recharge.archivee_le) {
      throw new HttpError(404, "Cette recharge n'est plus proposée. Rechargez la page pour voir celles qui le sont.")
    }
    commande = {
      objet: 'recharge',
      recharge_id: recharge.id,
      libelle: recharge.libelle,
      jetons: recharge.jetons,
      jours: null,
      prix_cents: recharge.prix_cents,
    }
  }

  if (!SITE) throw new HttpError(503, "L'adresse publique du site n'est pas configurée (PUBLIC_SITE_URL).")
  const stripe = await stripeDuRevendeur(resellerId, db)
  const retour = await retourDeLaPraticienne(cabinetId, db, hote)

  /* LA COMMANDE D'ABORD : son identifiant part dans les métadonnées de la
     session, et c'est lui que la vérification exige de retrouver. */
  const { data: ligne, error: eCommande } = await db
    .from('jetons_commandes')
    .insert({ cabinet_id: cabinetId, reseller_id: resellerId, ...commande })
    .select('id')
    .single<{ id: string }>()
  if (eCommande || !ligne) throw new HttpError(502, "La commande n'a pas pu être enregistrée. Réessayez dans un instant.")

  const annuler = () => db.from('jetons_commandes').update({ statut: 'annulee' }).eq('id', ligne.id).eq('statut', 'en_attente')
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      /* LA CARTE SEULE. Sans cette liste, les moyens du tableau de bord du
         revendeur s'appliquent — un prélèvement SEPA revient « complete »
         mais impayé, et ne se confirme que des jours plus tard. La carte se
         confirme au retour : la praticienne voit ses jetons tout de suite. */
      payment_method_types: ['card'],
      client_reference_id: cabinetId,
      line_items: [
        {
          quantity: 1,
          price_data: { currency: 'eur', unit_amount: commande.prix_cents, product_data: { name: commande.libelle } },
        },
      ],
      metadata: { commande: ligne.id, cabinet: cabinetId },
      success_url: `${retour}?jetons={CHECKOUT_SESSION_ID}`,
      cancel_url: `${retour}?jetons=annule`,
    })
  } catch (err) {
    await annuler()
    console.error('[jetons] création de session —', (err as Error).message)
    throw new HttpError(502, 'Le paiement est indisponible pour le moment. Réessayez dans un instant.')
  }
  if (!session.url) {
    await annuler()
    throw new HttpError(502, "Stripe n'a pas rendu d'adresse de paiement.")
  }
  const { error: eSession } = await db.from('jetons_commandes').update({ stripe_session_id: session.id }).eq('id', ligne.id)
  if (eSession) {
    /* Sans son numéro de session, la commande ne se retrouverait pas au
       retour : on ferme la page de paiement avant que quiconque y paie. */
    await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
    await annuler()
    throw new HttpError(502, "La commande n'a pas pu être enregistrée. Réessayez dans un instant.")
  }
  return { url: session.url }
}

/** Ce qu'on lit d'une session Stripe pour la juger. */
export interface SessionLue {
  payment_status: string
  status: string | null
  amount_total: number | null
  currency: string | null
  metadata: Record<string, string> | null
}

/**
 * Que dit cette session de cette commande ? — pure.
 *
 * INCOHÉRENTE avant tout le reste : une session qui ne porte pas cette
 * commande, pas ce cabinet, pas ce montant ou pas cette devise ne crédite
 * rien, même payée. C'est ce qui empêche de présenter la session d'une
 * petite recharge au retour d'une grande.
 */
export function lectureDeSession(
  session: SessionLue,
  commande: Pick<CommandeJetons, 'id' | 'cabinet_id' | 'prix_cents' | 'devise'>,
): 'payee' | 'ouverte' | 'expiree' | 'incoherente' {
  const m = session.metadata ?? {}
  if (
    m.commande !== commande.id ||
    m.cabinet !== commande.cabinet_id ||
    session.amount_total !== commande.prix_cents ||
    (session.currency ?? '').toLowerCase() !== commande.devise.toLowerCase()
  ) {
    return 'incoherente'
  }
  if (session.payment_status === 'paid') return 'payee'
  if (session.status === 'expired') return 'expiree'
  return 'ouverte'
}

/** Ce que la base rend d'un encaissement (`jetons_encaisser`). */
export interface Encaissement {
  deja: boolean
  jusquAu?: string | null
}

/** Ce dont la conclusion a besoin, injecté pour s'éprouver sans Stripe ni base. */
export interface OperationsAchat {
  encaisser(commandeId: string): Promise<Encaissement>
  annuler(commandeId: string): Promise<void>
  solde(): Promise<number | null>
}

function dateDite(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
}

/**
 * Conclure un achat au retour de Stripe — sans réseau : la session est déjà
 * lue, la base est derrière `ops`. L'encaissement est idempotent en base ;
 * une seconde vérification lit « déjà crédité » et ne verse rien.
 */
export async function conclureAchat(
  commande: CommandeJetons,
  session: SessionLue,
  ops: OperationsAchat,
): Promise<AchatVerifie> {
  const base = { objet: commande.objet, jetons: commande.jetons }
  const verdict = lectureDeSession(session, commande)
  if (verdict === 'incoherente') {
    // Journal technique : des identifiants, jamais une clé.
    console.error(`[jetons] session incohérente pour la commande ${commande.id}`)
    return {
      ...base,
      ok: false,
      solde: null,
      message: "Ce paiement ne correspond pas à la commande : rien n'a été crédité. Prévenez votre revendeur.",
    }
  }
  if (verdict === 'expiree') {
    await ops.annuler(commande.id)
    return { ...base, ok: false, solde: null, message: "Le paiement n'a pas abouti : rien n'a été débité, ni crédité." }
  }
  if (verdict === 'ouverte') {
    return {
      ...base,
      ok: false,
      attente: true,
      solde: null,
      message:
        "Stripe n'a pas encore confirmé le paiement : rien n'est crédité tant qu'il ne l'a pas fait. La vérification se refait d'elle-même à chaque ouverture de vos jetons ; vous pouvez aussi la relancer dans un instant.",
    }
  }
  const e = await ops.encaisser(commande.id)
  const solde = await ops.solde()
  if (e.deja) return { ...base, ok: true, solde, message: 'Cet achat est déjà crédité.' }
  const n = commande.jetons
  if (commande.objet === 'recharge') {
    return {
      ...base,
      ok: true,
      solde,
      message:
        n > 1
          ? `${jetonsDits(n)} ajoutés à votre solde. Ils restent valables douze mois.`
          : `${jetonsDits(n)} ajouté à votre solde. Il reste valable douze mois.`,
    }
  }
  const jusqua = dateDite(e.jusquAu)
  // Zéro jeton : le pass d'un cabinet qui paie avec sa clé (`commandeDuPass`) — rien à annoncer.
  const accompagnent =
    n > 1
      ? ` ${jetonsDits(n)} l'accompagnent, valables le temps de l'option.`
      : n === 1
        ? ` ${jetonsDits(n)} l'accompagne, valable le temps de l'option.`
        : ''
  return {
    ...base,
    ok: true,
    solde,
    hypnoseJusquAu: e.jusquAu ?? null,
    message: `Option Hypnose ouverte${jusqua ? ` jusqu'au ${jusqua}` : ''}.${accompagnent}`,
  }
}

/** Les opérations d'un achat conclu pour ce cabinet, sur la base réelle. */
function operationsAchat(db: SupabaseClient, cabinetId: string): OperationsAchat {
  return {
    encaisser: async (id) => {
      const { data, error } = await db.rpc('jetons_encaisser', { p_commande: id })
      if (error) {
        console.error(`[jetons] encaissement ${id} — ${error.message}`)
        throw new HttpError(502, "Le paiement est confirmé, mais le crédit n'a pas pu être écrit. Réessayez dans un instant : rien ne sera payé deux fois.")
      }
      const r = (data ?? {}) as { deja?: boolean; jusqu_au?: string | null }
      return { deja: r.deja === true, jusquAu: r.jusqu_au ?? null }
    },
    annuler: async (id) => {
      await db.from('jetons_commandes').update({ statut: 'annulee' }).eq('id', id).eq('statut', 'en_attente')
    },
    solde: () => soldeDuCabinet(cabinetId, db),
  }
}

/**
 * Conclure des commandes restées en attente — sans réseau : la lecture de
 * la session chez Stripe et les écritures sont injectées.
 *
 * Chaque commande pour elle-même : une session illisible (clé changée,
 * Stripe indisponible) ou un encaissement en panne laisse CETTE commande en
 * attente, pour la prochaine fois, sans empêcher les autres de conclure.
 * L'encaissement est idempotent en base : relire une commande déjà créditée
 * ne verse rien de plus.
 */
export async function reprendreLesCommandes(
  commandes: CommandeJetons[],
  lire: (commande: CommandeJetons) => Promise<SessionLue>,
  ops: (commande: CommandeJetons) => OperationsAchat,
): Promise<AchatVerifie[]> {
  const verdicts: AchatVerifie[] = []
  for (const commande of commandes) {
    if (commande.statut !== 'en_attente' || !commande.stripe_session_id) continue
    try {
      verdicts.push(await conclureAchat(commande, await lire(commande), ops(commande)))
    } catch (err) {
      // Journal technique : des identifiants, jamais une clé.
      console.warn(`[jetons] reprise de la commande ${commande.id} — ${(err as Error).message}`)
    }
  }
  return verdicts
}

/** Au plus tant de commandes relues à chaque lecture : les plus récentes. */
const COMMANDES_REPRISES = 5
/**
 * Au-delà, une commande n'est plus relue d'elle-même. Une page de paiement
 * Stripe expire en vingt-quatre heures : une semaine laisse à une lecture le
 * temps de passer, sans relire chez Stripe, à chaque ouverture, une commande
 * que plus rien ne fera bouger.
 */
const REPRISE_JOURS = 7

/**
 * Relire chez Stripe les commandes de ce cabinet encore en attente, et
 * conclure celles qui ont abouti — crédit, ou annulation d'une page expirée.
 *
 * Avec la clé du revendeur QUI A ENCAISSÉ (la commande le dit) : elle ne
 * peut pas changer tant qu'un paiement est en cours (`exigerAucunPaiementEnCours`).
 * Sans commande en attente — presque toujours —, c'est une seule lecture en base.
 */
export async function reprendreCommandesEnAttente(cabinetId: string, db: SupabaseClient): Promise<AchatVerifie[]> {
  const depuis = new Date(Date.now() - REPRISE_JOURS * 24 * 3600 * 1000).toISOString()
  const { data, error } = await db
    .from('jetons_commandes')
    .select(COLONNES_COMMANDE)
    .eq('cabinet_id', cabinetId)
    .eq('statut', 'en_attente')
    .not('stripe_session_id', 'is', null)
    .gte('cree_le', depuis)
    .order('cree_le', { ascending: false })
    .limit(COMMANDES_REPRISES)
  if (error) throw new Error(error.message)
  const commandes = (data ?? []) as CommandeJetons[]
  if (!commandes.length) return []

  const clients = new Map<string, Promise<Stripe>>()
  const stripeDe = (resellerId: string) => {
    if (!clients.has(resellerId)) clients.set(resellerId, stripeDuRevendeur(resellerId, db))
    return clients.get(resellerId) as Promise<Stripe>
  }
  return reprendreLesCommandes(
    commandes,
    async (c) => (await stripeDe(c.reseller_id)).checkout.sessions.retrieve(c.stripe_session_id as string),
    () => operationsAchat(db, cabinetId),
  )
}

/** Pendant ce temps après sa création, une commande en attente peut encore être payée. */
const PAIEMENT_OUVERT_HEURES = 24

/**
 * Le revendeur veut retirer ou changer sa clé Stripe : pas tant qu'un
 * cabinet a une page de paiement ouverte sur son compte.
 *
 * Une commande se vérifie avec la clé du compte qui a encaissé. Retirée, ou
 * remplacée par celle d'un autre compte, entre le paiement et sa
 * vérification, et la commande ne se vérifiait plus jamais : le cabinet
 * avait payé, et rien n'était crédité.
 *
 * On conclut d'abord ce qui peut l'être avec la clé en place — les pages
 * payées sont créditées, les pages expirées annulées ; il ne reste que les
 * paiements réellement en cours, et on refuse tant qu'il en reste (au plus
 * vingt-quatre heures : c'est la durée de vie d'une page Stripe).
 */
export async function exigerAucunPaiementEnCours(resellerId: string, db: SupabaseClient): Promise<void> {
  const lire = async (): Promise<CommandeJetons[]> => {
    const depuis = new Date(Date.now() - PAIEMENT_OUVERT_HEURES * 3600 * 1000).toISOString()
    const { data, error } = await db
      .from('jetons_commandes')
      .select(COLONNES_COMMANDE)
      .eq('reseller_id', resellerId)
      .eq('statut', 'en_attente')
      .not('stripe_session_id', 'is', null)
      .gte('cree_le', depuis)
      .order('cree_le', { ascending: false })
      .limit(20)
    if (error) throw panneDeLecture(error.message)
    return (data ?? []) as CommandeJetons[]
  }
  const avant = await lire()
  if (!avant.length) return
  try {
    const stripe = await stripeDuRevendeur(resellerId, db)
    await reprendreLesCommandes(
      avant,
      (c) => stripe.checkout.sessions.retrieve(c.stripe_session_id as string),
      (c) => operationsAchat(db, c.cabinet_id),
    )
  } catch (err) {
    console.warn(`[jetons] reprise avant changement de clé — ${(err as Error).message}`)
  }
  const restantes = (await lire()).length
  if (restantes > 0) throw new HttpError(409, refusPaiementEnCours(restantes))
}

/** Le refus de toucher à la clé Stripe, qui dit combien de paiements attendent — pure. */
export function refusPaiementEnCours(n: number): string {
  const constat =
    n > 1
      ? `${n} paiements de jetons sont en cours sur votre compte Stripe`
      : 'Un paiement de jetons est en cours sur votre compte Stripe'
  return `${constat} : sans cette clé, ${n > 1 ? 'ils ne pourraient plus être vérifiés, ni crédités' : 'il ne pourrait plus être vérifié, ni crédité'}. Attendez qu'${n > 1 ? 'ils aboutissent' : 'il aboutisse'} ou que ${n > 1 ? 'leur page expire' : 'sa page expire'} — vingt-quatre heures au plus —, puis retirez ou changez votre clé.`
}

export interface VerifierAchatBody {
  /** L'identifiant de session que Stripe a posé dans l'adresse de retour (`?jetons=`). */
  session?: string
}

/**
 * Vérifier un achat au retour de Stripe.
 *
 * Tout membre du cabinet peut le faire : le retour arrive dans le navigateur
 * de qui a payé, et vérifier ne fait que constater — la commande, son prix et
 * le compte qui encaisse sont fixés depuis le départ.
 */
export async function verifierAchatJetons(token: string | null, raw: unknown): Promise<AchatVerifie> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const body = (raw && typeof raw === 'object' ? raw : {}) as VerifierAchatBody
  const sessionId = String(body.session ?? '').trim()
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new HttpError(400, 'Session de paiement manquante.')

  const db = admin()
  const { data: commande } = await db
    .from('jetons_commandes')
    .select(COLONNES_COMMANDE)
    .eq('stripe_session_id', sessionId)
    .maybeSingle<CommandeJetons>()
  // Une commande qui n'est pas celle du cabinet n'existe pas, à ses yeux.
  if (!commande || commande.cabinet_id !== cabinetId) throw new HttpError(404, 'Commande introuvable.')

  const ops = operationsAchat(db, cabinetId)

  const base = { objet: commande.objet, jetons: commande.jetons }
  if (commande.statut === 'payee') {
    return { ...base, ok: true, solde: await ops.solde(), message: 'Cet achat est déjà crédité.' }
  }
  if (commande.statut === 'annulee') {
    return { ...base, ok: false, solde: null, message: "Ce paiement n'a pas abouti : rien n'a été débité, ni crédité." }
  }

  const stripe = await stripeDuRevendeur(commande.reseller_id, db)
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    throw new HttpError(502, "Le paiement n'a pas pu être vérifié. Réessayez dans un instant.")
  }
  return conclureAchat(commande, session, ops)
}
