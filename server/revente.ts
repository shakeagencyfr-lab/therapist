/**
 * La revente d'IA, des deux côtés du comptoir.
 *
 * Côté REVENDEUR : sa clé d'analyse, son compte Stripe, sa marge, ses
 * paquets, le découvert qu'il accorde — et, pour chaque cabinet, le mode de
 * facturation qu'il lui a vendu. C'est aussi ici qu'il voit ce qu'une action
 * lui coûte VRAIMENT, constaté sur ses propres appels et non estimé : sans
 * ce chiffre, fixer un prix de revente est un pari.
 *
 * Côté THÉRAPEUTE : les paquets de son revendeur, et l'achat par carte sur le
 * compte Stripe de celui-ci.
 *
 * Les mêmes règles que partout ailleurs. Une clé est vérifiée par un vrai
 * appel avant d'être enregistrée, chiffrée, et ne revient jamais au
 * navigateur. Le grand livre ne s'écrit que par le serveur. Et un paiement
 * n'est constaté qu'auprès de Stripe, jamais sur la parole du client.
 */
import Anthropic from '@anthropic-ai/sdk'
import Stripe from 'stripe'
import { adminConfigure, clientAdmin, identifier, type Appelant } from './auth.js'
import { cleStripeDuRevendeur, facturationDuCabinet, inscrire, type ModeFacturation } from './credits.js'
import { HttpError } from './errors.js'
import { chiffrementConfigure, chiffrer, empreinte } from './secrets.js'

const SITE = (process.env.PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')

/* ------------------------------------------------------------------ *
 * Ce que l'écran du revendeur reçoit
 * ------------------------------------------------------------------ */

export interface CleAffichee {
  hint: string
  setAt: string
  label?: string
}

/** Ce qu'un type d'action a coûté en moyenne, constaté sur les appels passés. */
export interface CoutConstate {
  kind: string
  appels: number
  /** Coût moyen d'un appel, en centimes de dollar. */
  moyenneCentimes: number
}

export interface Paquet {
  id: string
  label: string
  credits: number
  prixCentimes: number
  actif: boolean
}

export interface CabinetRevente {
  cabinetId: string
  nom: string
  mode: 'cle_cabinet' | 'credits'
  solde: number
}

export interface EtatRevente {
  anthropic: CleAffichee | null
  stripe: CleAffichee | null
  margePct: number
  decouvertCredits: number
  paquets: Paquet[]
  cabinets: CabinetRevente[]
  /** Le coût réel, par type d'action, sur les cabinets de ce revendeur. */
  couts: CoutConstate[]
  chiffrement: boolean
}

function admin() {
  const client = clientAdmin()
  if (!client || !adminConfigure()) {
    throw new HttpError(
      503,
      "Le serveur n'a pas sa clé de service (SUPABASE_SERVICE_ROLE_KEY) : il ne peut pas enregistrer de réglage.",
    )
  }
  return client
}

/** L'appelant, et le revendeur dont il est membre. */
async function revendeur(token: string | null): Promise<{ appelant: Appelant; resellerId: string }> {
  const appelant = await identifier(token)
  if (!appelant.resellerId) {
    throw new HttpError(403, "Cette fonction est réservée à l'espace d'un revendeur.")
  }
  return { appelant, resellerId: appelant.resellerId }
}

/* ------------------------------------------------------------------ *
 * Lecture
 * ------------------------------------------------------------------ */

export async function etatRevente(token: string | null): Promise<EtatRevente> {
  const { resellerId } = await revendeur(token)
  const db = admin()

  // Ses cabinets d'abord : tout le reste est borné à eux, jamais lu en entier.
  const { data: cabinets } = await db
    .from('cabinets')
    .select('id, name')
    .eq('reseller_id', resellerId)
    .order('created_at')
  const lesCabinets = (cabinets ?? []) as Array<{ id: string; name: string }>
  const ids = lesCabinets.map((c) => c.id)

  const vides = { data: [] as never[] }
  const [reglages, paquets, usage, abos, livre] = await Promise.all([
    db.from('reseller_ai_settings').select('*').eq('reseller_id', resellerId).maybeSingle(),
    db
      .from('credit_packs')
      .select('id, label, credits, price_cents, is_active')
      .eq('reseller_id', resellerId)
      .is('archived_at', null)
      .order('position')
      .order('credits'),
    // Les 500 derniers appels : la moyenne récente vaut mieux qu'une moyenne
    // de toute l'histoire, les tarifs et les gabarits ayant bougé depuis.
    ids.length
      ? db
          .from('ai_usage')
          .select('kind, cost_cents')
          .in('cabinet_id', ids)
          .order('occurred_at', { ascending: false })
          .limit(500)
      : vides,
    ids.length ? db.from('subscriptions').select('cabinet_id, ai_billing').in('cabinet_id', ids) : vides,
    db.from('credit_ledger').select('cabinet_id, delta').eq('reseller_id', resellerId),
  ])

  const r = (reglages.data ?? null) as Record<string, unknown> | null

  const mode = new Map(
    ((abos.data ?? []) as Array<{ cabinet_id: string; ai_billing: string }>).map((a) => [a.cabinet_id, a.ai_billing]),
  )
  const soldes = new Map<string, number>()
  for (const l of (livre.data ?? []) as Array<{ cabinet_id: string; delta: number }>) {
    soldes.set(l.cabinet_id, (soldes.get(l.cabinet_id) ?? 0) + l.delta)
  }

  // Le coût constaté : la moyenne d'un appel, par type, sur SES cabinets.
  // C'est le chiffre qui manque pour fixer un prix sans deviner.
  const total = new Map<string, { somme: number; n: number }>()
  for (const u of (usage.data ?? []) as Array<{ kind: string; cost_cents: number }>) {
    const acc = total.get(u.kind) ?? { somme: 0, n: 0 }
    acc.somme += Number(u.cost_cents)
    acc.n += 1
    total.set(u.kind, acc)
  }

  return {
    anthropic:
      r?.anthropic_hint && r?.anthropic_set_at
        ? { hint: String(r.anthropic_hint), setAt: String(r.anthropic_set_at) }
        : null,
    stripe:
      r?.stripe_hint && r?.stripe_set_at
        ? {
            hint: String(r.stripe_hint),
            setAt: String(r.stripe_set_at),
            label: r.stripe_account_label ? String(r.stripe_account_label) : undefined,
          }
        : null,
    margePct: typeof r?.marge_pct === 'number' ? r.marge_pct : 80,
    decouvertCredits: typeof r?.decouvert_credits === 'number' ? r.decouvert_credits : 3,
    paquets: ((paquets.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: String(p.id),
      label: String(p.label),
      credits: Number(p.credits),
      prixCentimes: Number(p.price_cents),
      actif: Boolean(p.is_active),
    })),
    cabinets: lesCabinets.map((c) => ({
      cabinetId: c.id,
      nom: c.name,
      mode: mode.get(c.id) === 'credits' ? 'credits' : 'cle_cabinet',
      solde: soldes.get(c.id) ?? 0,
    })),
    couts: [...total.entries()].map(([kind, { somme, n }]) => ({
      kind,
      appels: n,
      moyenneCentimes: n > 0 ? somme / n : 0,
    })),
    chiffrement: chiffrementConfigure(),
  }
}

/* ------------------------------------------------------------------ *
 * Écriture
 * ------------------------------------------------------------------ */

async function ecrire(resellerId: string, champs: Record<string, unknown>): Promise<void> {
  const db = admin()
  const { error } = await db
    .from('reseller_ai_settings')
    .upsert({ reseller_id: resellerId, ...champs, updated_at: new Date().toISOString() }, { onConflict: 'reseller_id' })
  if (error) throw new HttpError(502, `Enregistrement impossible : ${error.message}`)
}

/** Éprouve une clé Anthropic par l'appel le moins cher qui existe. */
async function eprouverAnthropic(apiKey: string): Promise<void> {
  const client = new Anthropic({ apiKey })
  try {
    await client.models.retrieve(process.env.CLAUDE_MODEL ?? 'claude-opus-5')
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new HttpError(400, 'Anthropic refuse cette clé. Vérifiez-la dans votre console Anthropic.')
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new HttpError(504, 'Anthropic est injoignable depuis le serveur. Réessayez dans un instant.')
    }
    throw new HttpError(502, "La clé n'a pas pu être vérifiée. Réessayez.")
  }
}

async function eprouverStripe(secretKey: string): Promise<string> {
  const stripe = new Stripe(secretKey)
  try {
    const compte = await stripe.accounts.retrieve()
    const nom =
      compte.settings?.dashboard?.display_name ?? compte.business_profile?.name ?? compte.email ?? compte.id
    return compte.country ? `${nom} (${compte.country})` : nom
  } catch (err) {
    const e = err as { type?: string; statusCode?: number }
    if (e.type === 'StripeAuthenticationError' || e.statusCode === 401) {
      throw new HttpError(400, 'Stripe refuse cette clé. Vérifiez-la dans votre tableau de bord Stripe.')
    }
    throw new HttpError(502, "La clé Stripe n'a pas pu être vérifiée. Réessayez.")
  }
}

/** Le cabinet appartient-il bien à ce revendeur ? */
async function cabinetDuRevendeur(resellerId: string, cabinetId: string): Promise<void> {
  const db = admin()
  const { data } = await db
    .from('cabinets')
    .select('id')
    .eq('id', cabinetId)
    .eq('reseller_id', resellerId)
    .maybeSingle()
  if (!data) throw new HttpError(403, "Ce cabinet n'est pas le vôtre.")
}

export type ActionRevente =
  | { action: 'anthropic'; key: string }
  | { action: 'anthropic-retirer' }
  | { action: 'stripe'; key: string }
  | { action: 'stripe-retirer' }
  | { action: 'reglages'; margePct: number; decouvertCredits: number }
  | { action: 'paquet'; id?: string; label: string; credits: number; prixCentimes: number; actif: boolean }
  | { action: 'paquet-retirer'; id: string }
  | { action: 'mode'; cabinetId: string; mode: 'cle_cabinet' | 'credits' }
  | { action: 'crediter'; cabinetId: string; credits: number; note: string }

export async function appliquerRevente(token: string | null, raw: unknown): Promise<EtatRevente> {
  const { resellerId } = await revendeur(token)
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const db = admin()

  switch (String(body.action ?? '')) {
    case 'anthropic': {
      const key = String(body.key ?? '').trim()
      if (!/^sk-ant-/.test(key)) throw new HttpError(400, 'Une clé Anthropic commence par « sk-ant- ».')
      if (!chiffrementConfigure()) chiffrer('')
      await eprouverAnthropic(key)
      await ecrire(resellerId, { anthropic_hint: empreinte(key), anthropic_set_at: new Date().toISOString() })
      const { error } = await db
        .from('reseller_secrets')
        .upsert({ reseller_id: resellerId, anthropic_key_enc: chiffrer(key), updated_at: new Date().toISOString() }, { onConflict: 'reseller_id' })
      if (error) throw new HttpError(502, `Enregistrement impossible : ${error.message}`)
      break
    }
    case 'anthropic-retirer': {
      await ecrire(resellerId, { anthropic_hint: null, anthropic_set_at: null })
      await db.from('reseller_secrets').upsert({ reseller_id: resellerId, anthropic_key_enc: null, updated_at: new Date().toISOString() }, { onConflict: 'reseller_id' })
      break
    }
    case 'stripe': {
      const key = String(body.key ?? '').trim()
      if (!/^(sk|rk)_(live|test)_/.test(key)) {
        throw new HttpError(400, 'Une clé secrète Stripe commence par « sk_live_ », « sk_test_ » ou « rk_ ».')
      }
      if (!chiffrementConfigure()) chiffrer('')
      const label = await eprouverStripe(key)
      await ecrire(resellerId, {
        stripe_hint: empreinte(key),
        stripe_account_label: label,
        stripe_set_at: new Date().toISOString(),
      })
      const { error } = await db
        .from('reseller_secrets')
        .upsert({ reseller_id: resellerId, stripe_secret_enc: chiffrer(key), updated_at: new Date().toISOString() }, { onConflict: 'reseller_id' })
      if (error) throw new HttpError(502, `Enregistrement impossible : ${error.message}`)
      break
    }
    case 'stripe-retirer': {
      await ecrire(resellerId, { stripe_hint: null, stripe_account_label: null, stripe_set_at: null })
      await db.from('reseller_secrets').upsert({ reseller_id: resellerId, stripe_secret_enc: null, updated_at: new Date().toISOString() }, { onConflict: 'reseller_id' })
      break
    }
    case 'reglages': {
      const marge = Math.max(0, Math.min(1000, Math.round(Number(body.margePct) || 0)))
      const decouvert = Math.max(0, Math.min(100, Math.round(Number(body.decouvertCredits) || 0)))
      await ecrire(resellerId, { marge_pct: marge, decouvert_credits: decouvert })
      break
    }
    case 'paquet': {
      const label = String(body.label ?? '').trim()
      const credits = Math.round(Number(body.credits) || 0)
      const prix = Math.round(Number(body.prixCentimes) || 0)
      if (!label) throw new HttpError(400, 'Donnez un nom à ce paquet.')
      if (credits <= 0) throw new HttpError(400, 'Un paquet contient au moins un crédit.')
      if (prix < 50) throw new HttpError(400, 'Stripe refuse les paiements sous 0,50 €.')
      const ligne = {
        reseller_id: resellerId,
        label,
        credits,
        price_cents: prix,
        is_active: body.actif !== false,
      }
      const id = String(body.id ?? '')
      const { error } = id
        ? await db.from('credit_packs').update(ligne).eq('id', id).eq('reseller_id', resellerId)
        : await db.from('credit_packs').insert(ligne)
      if (error) throw new HttpError(502, "Le paquet n'a pas pu être enregistré.")
      break
    }
    case 'paquet-retirer': {
      const { error } = await db
        .from('credit_packs')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', String(body.id ?? ''))
        .eq('reseller_id', resellerId)
      if (error) throw new HttpError(502, "Le paquet n'a pas pu être retiré.")
      break
    }
    case 'mode': {
      const cabinetId = String(body.cabinetId ?? '')
      await cabinetDuRevendeur(resellerId, cabinetId)
      const mode = body.mode === 'credits' ? 'credits' : 'cle_cabinet'
      // Le mode vit sur l'abonnement. On vérifie que la ligne a bougé : une
      // mise à jour qui ne touche aucune ligne ne lève pas d'erreur, et le
      // revendeur croirait avoir basculé un cabinet resté sur sa clé.
      const { data: touche, error } = await db
        .from('subscriptions')
        .update({ ai_billing: mode })
        .eq('cabinet_id', cabinetId)
        .select('cabinet_id')
      if (error) throw new HttpError(502, "Le mode de facturation n'a pas pu être changé.")
      if (!touche || touche.length === 0) {
        throw new HttpError(409, "Ce cabinet n'a pas d'abonnement : ouvrez-lui une offre avant de choisir son mode de facturation.")
      }
      break
    }
    case 'crediter': {
      const cabinetId = String(body.cabinetId ?? '')
      await cabinetDuRevendeur(resellerId, cabinetId)
      const credits = Math.round(Number(body.credits) || 0)
      if (credits === 0) throw new HttpError(400, 'Indiquez un nombre de crédits.')
      await inscrire({
        cabinetId,
        resellerId,
        delta: credits,
        reason: credits > 0 ? 'geste' : 'ajustement',
        note: String(body.note ?? '').trim() || undefined,
      })
      break
    }
    default:
      throw new HttpError(400, 'Action inconnue.')
  }

  return etatRevente(token)
}

/* ------------------------------------------------------------------ *
 * Côté thérapeute : acheter des crédits
 * ------------------------------------------------------------------ */

export interface AchatCredits {
  url: string
}

/** Ouvre un paiement Stripe sur le compte du revendeur. */
export async function demarrerAchatCredits(token: string | null, raw: unknown): Promise<AchatCredits> {
  const appelant = await identifier(token)
  const cabinetId = appelant.cabinetId
  if (!cabinetId) throw new HttpError(403, "Cette fonction est réservée à l'espace d'un cabinet.")
  if (!SITE) throw new HttpError(503, "L'adresse publique du site n'est pas configurée (PUBLIC_SITE_URL).")

  const db = admin()
  const packId = String((raw as Record<string, unknown>)?.packId ?? '')

  const { data: cabinet } = await db
    .from('cabinets')
    .select('reseller_id')
    .eq('id', cabinetId)
    .maybeSingle<{ reseller_id: string }>()
  if (!cabinet?.reseller_id) throw new HttpError(409, "Votre cabinet n'est rattaché à aucun revendeur.")

  const { data: pack } = await db
    .from('credit_packs')
    .select('id, label, credits, price_cents, currency, is_active, archived_at, reseller_id')
    .eq('id', packId)
    .maybeSingle<{
      id: string
      label: string
      credits: number
      price_cents: number
      currency: string
      is_active: boolean
      archived_at: string | null
      reseller_id: string
    }>()
  if (!pack || !pack.is_active || pack.archived_at || pack.reseller_id !== cabinet.reseller_id) {
    throw new HttpError(404, "Ce paquet de crédits n'est plus proposé.")
  }

  const secret = await cleStripeDuRevendeur(cabinet.reseller_id)
  if (!secret) {
    throw new HttpError(
      503,
      "Votre revendeur n'a pas encore branché son compte de paiement. Demandez-lui de vous créditer, ou de le brancher.",
    )
  }

  const stripe = new Stripe(secret)
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: cabinetId,
    success_url: `${SITE}/?credits={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE}/?credits_annule=1`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: pack.currency,
          unit_amount: pack.price_cents,
          product_data: { name: `${pack.label} — ${pack.credits} crédits d'analyse` },
        },
      },
    ],
  })
  if (!session.url) throw new HttpError(502, "Stripe n'a pas rendu d'adresse de paiement. Réessayez.")

  const { error } = await db.from('credit_orders').insert({
    reseller_id: cabinet.reseller_id,
    cabinet_id: cabinetId,
    pack_id: pack.id,
    label: pack.label,
    credits: pack.credits,
    amount_cents: pack.price_cents,
    currency: pack.currency,
    stripe_session_id: session.id,
  })
  if (error) throw new HttpError(502, "La commande n'a pas pu être enregistrée. Rien n'a été débité.")

  return { url: session.url }
}

export interface RetourAchat {
  payee: boolean
  credits?: number
  label?: string
}

/**
 * Constate le paiement au retour de Stripe.
 *
 * La mise à jour est conditionnelle — « en_attente » et rien d'autre — donc
 * un double retour ne crédite pas deux fois. C'est la même garantie que la
 * boutique des patientes, pour la même raison.
 */
export async function verifierAchatCredits(token: string | null, raw: unknown): Promise<RetourAchat> {
  const appelant = await identifier(token)
  const cabinetId = appelant.cabinetId
  if (!cabinetId) throw new HttpError(403, "Cette fonction est réservée à l'espace d'un cabinet.")

  const db = admin()
  const sessionId = String((raw as Record<string, unknown>)?.sessionId ?? '')
  const { data: commande } = await db
    .from('credit_orders')
    .select('id, reseller_id, cabinet_id, label, credits, status')
    .eq('stripe_session_id', sessionId)
    .maybeSingle<{
      id: string
      reseller_id: string
      cabinet_id: string
      label: string
      credits: number
      status: string
    }>()
  if (!commande || commande.cabinet_id !== cabinetId) {
    throw new HttpError(404, "Cette commande est introuvable.")
  }
  if (commande.status === 'payee') {
    return { payee: true, credits: commande.credits, label: commande.label }
  }

  const secret = await cleStripeDuRevendeur(commande.reseller_id)
  if (!secret) throw new HttpError(503, "Le compte de paiement de votre revendeur n'est plus joignable.")
  const stripe = new Stripe(secret)
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  if (session.payment_status !== 'paid') return { payee: false }

  // Conditionnelle : deux retours simultanés ne créditent qu'une fois.
  const { data: maj } = await db
    .from('credit_orders')
    .update({ status: 'payee', paid_at: new Date().toISOString() })
    .eq('id', commande.id)
    .eq('status', 'en_attente')
    .select('id')
  if (!maj || maj.length === 0) {
    return { payee: true, credits: commande.credits, label: commande.label }
  }

  await inscrire({
    cabinetId,
    resellerId: commande.reseller_id,
    delta: commande.credits,
    reason: 'achat',
    note: commande.label,
  })
  return { payee: true, credits: commande.credits, label: commande.label }
}

/* ------------------------------------------------------------------ *
 * Côté thérapeute : où j'en suis
 * ------------------------------------------------------------------ */

export interface MouvementCredit {
  id: string
  date: string
  delta: number
  reason: 'achat' | 'geste' | 'consommation' | 'ajustement'
  kind: string | null
  note: string | null
}

export interface PaquetOffert {
  id: string
  label: string
  credits: number
  prixCentimes: number
  devise: string
}

export interface EtatCredits {
  mode: ModeFacturation
  solde: number
  decouvert: number
  /** Le revendeur peut-il encaisser par carte ? Sinon, il crédite à la main. */
  paiementCarte: boolean
  paquets: PaquetOffert[]
  mouvements: MouvementCredit[]
}

/**
 * Ce que la thérapeute voit de ses crédits.
 *
 * En mode « clé du cabinet » la réponse est vide et le tableau de bord
 * n'affiche rien : ce n'est pas sa façon de payer.
 */
export async function etatCredits(token: string | null): Promise<EtatCredits> {
  const appelant = await identifier(token)
  const cabinetId = appelant.cabinetId
  if (!cabinetId) throw new HttpError(403, "Cette fonction est réservée à l'espace d'un cabinet.")

  const facturation = await facturationDuCabinet(cabinetId)
  const vide: EtatCredits = {
    mode: facturation.mode,
    solde: facturation.solde,
    decouvert: facturation.decouvert,
    paiementCarte: false,
    paquets: [],
    mouvements: [],
  }
  if (facturation.mode !== 'credits' || !facturation.resellerId) return vide

  const db = admin()
  const [paquets, mouvements, reglages] = await Promise.all([
    db
      .from('credit_packs')
      .select('id, label, credits, price_cents, currency')
      .eq('reseller_id', facturation.resellerId)
      .eq('is_active', true)
      .is('archived_at', null)
      .order('position')
      .order('credits'),
    db
      .from('credit_ledger')
      .select('id, created_at, delta, reason, kind, note')
      .eq('cabinet_id', cabinetId)
      .order('created_at', { ascending: false })
      .limit(50),
    db
      .from('reseller_ai_settings')
      .select('stripe_set_at')
      .eq('reseller_id', facturation.resellerId)
      .maybeSingle<{ stripe_set_at: string | null }>(),
  ])

  return {
    ...vide,
    paiementCarte: Boolean(reglages.data?.stripe_set_at),
    paquets: ((paquets.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: String(p.id),
      label: String(p.label),
      credits: Number(p.credits),
      prixCentimes: Number(p.price_cents),
      devise: String(p.currency ?? 'eur'),
    })),
    mouvements: ((mouvements.data ?? []) as Array<Record<string, unknown>>).map((m) => ({
      id: String(m.id),
      date: String(m.created_at),
      delta: Number(m.delta),
      reason: m.reason as MouvementCredit['reason'],
      kind: m.kind ? String(m.kind) : null,
      note: m.note ? String(m.note) : null,
    })),
  }
}
