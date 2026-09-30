/**
 * Les jetons : qui paie une analyse, et combien elle coûte.
 *
 * DEUX MODES, décidés par le revendeur (0065) :
 *
 *   cle_cabinet  ce qui a toujours été : chaque cabinet branche sa clé
 *                Anthropic et paie ses appels. Rien n'est décompté. C'est
 *                le mode de tout revendeur qui n'a pas activé les jetons ou
 *                n'a pas posé sa clé — donc de tout le monde au déploiement.
 *
 *   jetons       la clé DU REVENDEUR paie tous ses cabinets, et chaque
 *                action coûte ce que dit son barème. Le forfait du mois, les
 *                recharges et les gestes du revendeur alimentent le solde.
 *
 * LA BASE TIENT LE COMPTE, CE MODULE LE PRÉSENTE. Le solde, les lots, la
 * réservation et le remboursement sont des fonctions SQL réservées au rôle de
 * service ; ce module décide seulement COMBIEN une requête coûte — les
 * forfaits de séance et d'hypnose — et traduit les refus en phrases.
 *
 * RÉSERVER AVANT, RENDRE SI ÇA ÉCHOUE. Débiter après coup laissait passer
 * deux analyses lancées ensemble sur un solde qui n'en couvrait qu'une ; les
 * jetons sont donc pris avant l'appel au modèle, et rendus s'il n'a rien
 * produit. Une analyse qui échoue ne se paie pas.
 *
 * Et l'achat : une recharge ou le pass Hypnose, payés sur le compte Stripe
 * du revendeur, sans webhook — la commande est relue chez Stripe au retour,
 * comme la boutique le fait pour les patients (server/shop.ts).
 */
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AchatDemarre,
  AchatVerifie,
  ActionJetons,
  Bareme,
  EtatJetons,
  JetonsDeLAppel,
  LigneHistorique,
  LotJetons,
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
  seance: 12,
  module: 5,
  profil: 5,
  affirmations: 1,
  hypnose: 50,
  retouche: 3,
  retouche_hypnose: 8,
}

/**
 * CE QU'UNE SÉANCE PAYÉE COMPREND.
 *
 * Le brouillon d'une séance se paie ; ce qui en découle ne se repaie pas :
 * les consignes des modules retenus (une par module, huit au plus — un
 * brouillon en propose trois ou quatre) et une actualisation du profil. Au-
 * delà, ce n'est plus la suite de cette séance, c'est un autre travail.
 */
export const CONSIGNES_PAR_SEANCE = 8
export const PROFILS_PAR_SEANCE = 1

/**
 * UNE HYPNOSE SE PAIE UNE FOIS, PAS QUATRE. Elle s'écrit en quatre appels, un
 * par mouvement, et un mouvement raté se reprend : huit appels sont compris
 * — quatre mouvements et leurs reprises. Le neuvième ouvre une nouvelle
 * hypnose, et se paie comme telle.
 */
export const APPELS_PAR_HYPNOSE = 8

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

/**
 * Le mode de facturation d'un cabinet, et de quoi l'appliquer.
 *
 * La règle est celle de la base (`jetons_mode_actif`, 0065) : activés ET une
 * clé posée. L'un sans l'autre, le cabinet garde sa clé — un revendeur qui
 * active les jetons avant d'avoir branché la sienne ne coupe l'analyse de
 * personne.
 *
 * UNE PANNE NE VAUT PAS « CLÉ DU CABINET ». Retomber sur la clé du cabinet
 * quand les réglages ne se lisent pas, c'est faire payer la praticienne pour
 * une analyse que son revendeur a promis de payer. On refuse, et l'on dit de
 * réessayer.
 */
export async function facturationDuCabinet(
  cabinetId: string,
  db: SupabaseClient | null = clientAdmin(),
): Promise<Facturation> {
  if (!db) return { mode: 'cle_cabinet' }
  const { data: cabinet, error: e1 } = await db
    .from('cabinets')
    .select('reseller_id')
    .eq('id', cabinetId)
    .maybeSingle<{ reseller_id: string | null }>()
  if (e1) throw panneDeLecture(e1.message)
  const resellerId = cabinet?.reseller_id
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
  if (!reglages.data?.actif || !secrets.data?.anthropic_key_enc) return { mode: 'cle_cabinet' }

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

/** Ce qu'un appel coûte, et à quoi il se rattache. */
export interface Cout {
  action: ActionJetons
  jetons: number
  /** La séance ou l'hypnose de l'appel, inscrite avec la consommation. */
  ref: string | null
  /** Compris dans un forfait déjà payé : zéro jeton, mais inscrit pour être compté. */
  compris: boolean
}

/**
 * Ce que la base sait et que le calcul du prix demande. Injecté, pour que la
 * règle s'éprouve sans base.
 */
export interface Recherches {
  /** La séance existe-t-elle, et est-elle de CE cabinet ? */
  seanceDuCabinet(sessionId: string): Promise<boolean>
  /** Son brouillon a-t-il été payé (consommation « seance » confirmée) ? */
  seancePayee(sessionId: string): Promise<boolean>
  /** Combien d'actions de ce genre ont déjà été comprises dans cette séance. */
  comprisesDeLaSeance(action: 'module' | 'profil', sessionId: string): Promise<number>
  /** L'hypnose existe-t-elle, et est-elle de CE cabinet ? */
  hypnoseDuCabinet(hypnoseId: string): Promise<boolean>
  /** Combien d'appels, payés ou compris, cette hypnose a déjà faits (remboursés exclus). */
  appelsDeLHypnose(hypnoseId: string): Promise<number>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Un identifiant, s'il en a la forme ; null sinon. */
export function uuidDe(valeur: unknown): string | null {
  const texte = typeof valeur === 'string' ? valeur.trim().toLowerCase() : ''
  return UUID.test(texte) ? texte : null
}

/**
 * Le prix d'un appel, selon le barème et les forfaits.
 *
 *   session-draft  une séance ; l'identifiant de la séance, s'il est du
 *                  cabinet, est inscrit : c'est lui qui ouvre le forfait.
 *   module         compris si l'appel porte une séance du cabinet dont le
 *                  brouillon est payé, huit fois au plus ; sinon, un module.
 *   profile        même règle, une fois par séance.
 *   affirmations   toujours au barème.
 *   hypnose        l'hypnose doit être ouverte en base et être du cabinet ;
 *                  le premier appel de chaque série de huit se paie, les
 *                  suivants sont compris.
 *   revision       une retouche (route à venir) : plus chère sur une hypnose.
 *
 * La PREUVE est côté serveur : l'identifiant envoyé par le navigateur n'est
 * cru que si la base le reconnaît au cabinet, et le forfait ne s'ouvre que
 * sur une consommation payée. Un identifiant inventé paie le plein prix.
 */
export async function coutDeLAppel(
  route: string,
  body: Record<string, unknown>,
  bareme: Bareme,
  r: Recherches,
): Promise<Cout> {
  switch (route) {
    case 'session-draft': {
      const seance = uuidDe(body.sessionId)
      const ref = seance && (await r.seanceDuCabinet(seance)) ? seance : null
      return { action: 'seance', jetons: bareme.seance, ref, compris: false }
    }
    case 'module':
    case 'profile': {
      const action = route === 'module' ? 'module' : 'profil'
      const plafond = route === 'module' ? CONSIGNES_PAR_SEANCE : PROFILS_PAR_SEANCE
      const seance = uuidDe(body.sessionId)
      if (!seance || !(await r.seanceDuCabinet(seance))) {
        return { action, jetons: bareme[action], ref: null, compris: false }
      }
      if ((await r.seancePayee(seance)) && (await r.comprisesDeLaSeance(action, seance)) < plafond) {
        return { action, jetons: 0, ref: seance, compris: true }
      }
      return { action, jetons: bareme[action], ref: seance, compris: false }
    }
    case 'affirmations':
      return { action: 'affirmations', jetons: bareme.affirmations, ref: null, compris: false }
    case 'hypnose': {
      /* L'hypnose s'ouvre en base AVANT d'être écrite (useEcritureHypnose) :
         sans elle, rien ne relie les quatre mouvements, et chacun serait
         payé comme une hypnose entière. On refuse avant toute dépense. */
      const hypnose = uuidDe(body.hypnoseId)
      if (!hypnose || !(await r.hypnoseDuCabinet(hypnose))) {
        throw new HttpError(
          400,
          "Cette hypnose n'est pas ouverte dans le dossier. Rechargez la page, puis relancez : rien n'a été produit, ni décompté.",
        )
      }
      const deja = await r.appelsDeLHypnose(hypnose)
      return deja % APPELS_PAR_HYPNOSE === 0
        ? { action: 'hypnose', jetons: bareme.hypnose, ref: hypnose, compris: false }
        : { action: 'hypnose', jetons: 0, ref: hypnose, compris: true }
    }
    case 'revision':
    case 'retouche': {
      const action: ActionJetons = String(body.cible ?? '') === 'hypnose' ? 'retouche_hypnose' : 'retouche'
      return { action, jetons: bareme[action], ref: null, compris: false }
    }
    default:
      throw new HttpError(404, "Cette analyse n'existe pas.")
  }
}

/** Les recherches de `coutDeLAppel`, faites en base avec la clé de service. */
export function recherchesPour(cabinetId: string, db: SupabaseClient): Recherches {
  const existe = async (table: 'therapy_sessions' | 'hypnoses', id: string): Promise<boolean> => {
    const { data, error } = await db
      .from(table)
      .select('id')
      .eq('id', id)
      .eq('cabinet_id', cabinetId)
      .maybeSingle<{ id: string }>()
    if (error) throw panneDeLecture(error.message)
    return Boolean(data)
  }
  const compter = async (action: ActionJetons, ref: string, filtre: 'confirme' | 'vivant', gratuits = false) => {
    let requete = db
      .from('jetons_consommations')
      .select('id', { count: 'exact', head: true })
      .eq('cabinet_id', cabinetId)
      .eq('action', action)
      .eq('ref', ref)
    requete = filtre === 'confirme' ? requete.eq('statut', 'confirme') : requete.in('statut', ['reserve', 'confirme'])
    if (gratuits) requete = requete.eq('jetons', 0)
    const { count, error } = await requete
    if (error) throw panneDeLecture(error.message)
    return count ?? 0
  }
  return {
    seanceDuCabinet: (id) => existe('therapy_sessions', id),
    seancePayee: async (id) => (await compter('seance', id, 'confirme')) > 0,
    comprisesDeLaSeance: (action, id) => compter(action, id, 'vivant', true),
    hypnoseDuCabinet: (id) => existe('hypnoses', id),
    appelsDeLHypnose: (id) => compter('hypnose', id, 'vivant'),
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

/** Le solde et le besoin, lus dans le détail du refus de la base (`jetons_debiter`). */
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

/** Réserve les jetons d'un appel. Rend la consommation, à confirmer ou à rendre. */
export async function reserver(
  cabinetId: string,
  cout: Cout,
  facturation: Extract<Facturation, { mode: 'jetons' }>,
  db: SupabaseClient,
): Promise<string> {
  const { data, error } = await db.rpc('jetons_debiter', {
    p_cabinet: cabinetId,
    p_action: cout.action,
    p_jetons: cout.jetons,
    p_ref: cout.ref,
  })
  if (error) {
    if (error.code === 'KL402') {
      const { solde, besoin } = lireRefusDeSolde(error.details, cout.jetons)
      throw new SoldeInsuffisant(solde, besoin, facturation.paiement)
    }
    throw panneDeLecture(error.message)
  }
  if (typeof data !== 'string') throw panneDeLecture('réservation sans identifiant')
  return data
}

/**
 * L'appel a produit : la réservation devient une dépense. Un échec ici ne
 * défait pas l'analyse — elle est écrite, payée d'avance, et la réservation
 * reste décomptée ; le journal le dit.
 */
export async function confirmer(consommation: string, db: SupabaseClient): Promise<void> {
  const { error } = await db.rpc('jetons_confirmer', { p_consommation: consommation })
  if (error) console.error(`[jetons] confirmation ${consommation} — ${error.message}`)
}

/**
 * L'appel a échoué : les jetons reviennent. Ne lève jamais — l'erreur de
 * l'appel est celle que l'écran doit lire, pas celle du remboursement.
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

/** Ce que l'enveloppe d'une analyse porte en mode jetons. */
export function jetonsDeLAppel(cout: Cout, solde: number | null): JetonsDeLAppel {
  return { utilises: cout.jetons, solde }
}

/* ------------------------------------------------------------------ *
 * L'état, pour l'écran du cabinet
 * ------------------------------------------------------------------ */

interface EtatJetonsBrut {
  mode?: string
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
 */
export async function etatJetons(token: string | null): Promise<EtatJetons> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const { data, error } = await appelant.client.rpc('cabinet_jetons', { p_cabinet: cabinetId })
  if (error) throw panneDeLecture(error.message)
  if (data === null) throw new HttpError(403, "Les jetons de ce cabinet ne vous sont pas ouverts.")
  return versEtatJetons(data)
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
    commande = {
      objet: 'option_hypnose',
      recharge_id: null,
      libelle: `Option Hypnose — ${r.option_hypnose_jours} jours`,
      jetons: r.option_hypnose_jetons,
      jours: r.option_hypnose_jours,
      prix_cents: r.option_hypnose_prix_cents,
    }
  } else {
    const rechargeId = uuidDe(body.recharge)
    if (!rechargeId) throw new HttpError(400, 'Choisissez une recharge.')
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
      message: "Stripe n'a pas encore confirmé le paiement. Rien n'est crédité tant qu'il ne l'a pas fait : réessayez dans un instant.",
    }
  }
  const e = await ops.encaisser(commande.id)
  const solde = await ops.solde()
  if (e.deja) return { ...base, ok: true, solde, message: 'Cet achat est déjà crédité.' }
  if (commande.objet === 'recharge') {
    return {
      ...base,
      ok: true,
      solde,
      message: `${jetonsDits(commande.jetons)} ajoutés à votre solde. Ils restent valables douze mois.`,
    }
  }
  const jusqua = dateDite(e.jusquAu)
  return {
    ...base,
    ok: true,
    solde,
    hypnoseJusquAu: e.jusquAu ?? null,
    message:
      `Option Hypnose ouverte${jusqua ? ` jusqu'au ${jusqua}` : ''}.` +
      (commande.jetons > 0 ? ` ${jetonsDits(commande.jetons)} l'accompagnent, valables le temps de l'option.` : ''),
  }
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

  const ops: OperationsAchat = {
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
