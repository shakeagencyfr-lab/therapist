/**
 * Intégrations du cabinet : clé d'analyse (Anthropic), paiement (Stripe),
 * prise de rendez-vous (Trafft).
 *
 * Trois règles, et tout le fichier en découle :
 *
 *   1. Une clé est VALIDÉE avant d'être enregistrée — par un vrai appel au
 *      service concerné. Une clé fausse se découvre ici, à la saisie, pas
 *      en séance devant une patiente.
 *   2. Une clé ne REVIENT jamais au navigateur. L'écran ne reçoit que ses
 *      quatre derniers caractères et sa date. La clé elle-même dort
 *      chiffrée (server/secrets.ts) et n'est déchiffrée que pour servir.
 *   3. L'appelant est identifié par la base (server/auth.ts), et n'agit que
 *      sur SON cabinet. La clé de service ne sert qu'à écrire ce que la base
 *      réserve au serveur.
 */
import Anthropic from '@anthropic-ai/sdk'
import Stripe from 'stripe'
import { adminConfigure, clientAdmin, exigerCabinet, identifier } from './auth.js'
import { HttpError } from './errors.js'
import { chiffrementConfigure, chiffrer, dechiffrer, empreinte } from './secrets.js'

/* ------------------------------------------------------------------ *
 * Ce que l'écran reçoit
 * ------------------------------------------------------------------ */

export interface CleAffichee {
  /** « …AB12 » */
  hint: string
  /** ISO 8601 */
  setAt: string
  /** Stripe seulement : le nom du compte, tel que Stripe le donne. */
  label?: string
}

export interface EtatIntegrations {
  anthropic: CleAffichee | null
  stripe: CleAffichee | null
  trafftUrl: string | null
  shopEnabled: boolean
  /** Le serveur sait-il chiffrer ? Sinon, l'écran le dit avant la saisie. */
  chiffrement: boolean
  /** La plateforme a-t-elle sa propre clé d'analyse, en repli ? */
  cleplateforme: boolean
}

export type IntegrationAction =
  | 'anthropic'
  | 'anthropic-retirer'
  | 'stripe'
  | 'stripe-retirer'
  | 'trafft'
  | 'trafft-retirer'
  | 'boutique'

interface SettingsRow {
  anthropic_hint: string | null
  anthropic_set_at: string | null
  stripe_hint: string | null
  stripe_account_label: string | null
  stripe_set_at: string | null
  trafft_url: string | null
  shop_enabled: boolean
}

/* ------------------------------------------------------------------ *
 * Lecture
 * ------------------------------------------------------------------ */

function versEtat(row: SettingsRow | null): EtatIntegrations {
  return {
    anthropic:
      row?.anthropic_hint && row.anthropic_set_at
        ? { hint: row.anthropic_hint, setAt: row.anthropic_set_at }
        : null,
    stripe:
      row?.stripe_hint && row.stripe_set_at
        ? { hint: row.stripe_hint, setAt: row.stripe_set_at, label: row.stripe_account_label ?? undefined }
        : null,
    trafftUrl: row?.trafft_url ?? null,
    shopEnabled: row?.shop_enabled ?? false,
    chiffrement: chiffrementConfigure(),
    cleplateforme: Boolean((process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '').trim()),
  }
}

/** L'état, lu sous les droits de l'appelant (la RLS borne à son cabinet). */
export async function etatIntegrations(token: string | null): Promise<EtatIntegrations> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const { data, error } = await appelant.client
    .from('cabinet_settings')
    .select('anthropic_hint, anthropic_set_at, stripe_hint, stripe_account_label, stripe_set_at, trafft_url, shop_enabled')
    .eq('cabinet_id', cabinetId)
    .maybeSingle<SettingsRow>()
  if (error) throw new HttpError(502, 'Les réglages n’ont pas pu être lus.')
  return versEtat(data ?? null)
}

/* ------------------------------------------------------------------ *
 * Écriture
 * ------------------------------------------------------------------ */

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

async function ecrire(
  cabinetId: string,
  settings: Partial<SettingsRow>,
  secrets: { anthropic_key_enc?: string | null; stripe_secret_enc?: string | null } | null,
  action: string,
  userId: string,
): Promise<void> {
  const db = admin()
  const maintenant = new Date().toISOString()
  const { error: e1 } = await db
    .from('cabinet_settings')
    .upsert({ cabinet_id: cabinetId, ...settings, updated_at: maintenant }, { onConflict: 'cabinet_id' })
  if (e1) throw new HttpError(502, `Enregistrement impossible : ${e1.message}`)
  if (secrets) {
    const { error: e2 } = await db
      .from('cabinet_secrets')
      .upsert({ cabinet_id: cabinetId, ...secrets, updated_at: maintenant }, { onConflict: 'cabinet_id' })
    if (e2) throw new HttpError(502, `Enregistrement impossible : ${e2.message}`)
  }
  // Le geste se voit dans le journal ; la clé, jamais.
  await db.from('audit_log').insert({
    cabinet_id: cabinetId,
    actor_user_id: userId,
    action,
    target_table: 'cabinet_settings',
    target_id: cabinetId,
  })
}

/* ---- Anthropic ------------------------------------------------------- */

/**
 * Éprouve une clé Anthropic par un appel réel, le moins cher qui existe :
 * lire la fiche du modèle. Une clé refusée l'est ici, pas en séance.
 */
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

/* ---- Stripe ---------------------------------------------------------- */

/**
 * Éprouve une clé Stripe en lisant le compte qu'elle ouvre. On en garde le
 * nom, pour que l'écran dise « connecté à Cabinet Ollivier (FR) » plutôt
 * que « une clé est enregistrée ».
 */
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
    if (e.type === 'StripePermissionError' || e.statusCode === 403) {
      throw new HttpError(400, "Cette clé Stripe n'a pas le droit de lire le compte. Utilisez une clé secrète, ou une clé restreinte avec l'accès « Compte » en lecture.")
    }
    throw new HttpError(502, "La clé Stripe n'a pas pu être vérifiée. Réessayez.")
  }
}

/* ---- Trafft ---------------------------------------------------------- */

function urlTrafft(valeur: string): string {
  let url: URL
  try {
    url = new URL(valeur.trim())
  } catch {
    throw new HttpError(400, "Cette adresse n'est pas une URL complète (elle doit commencer par https://).")
  }
  if (url.protocol !== 'https:') {
    throw new HttpError(400, "L'adresse de réservation doit être en https://.")
  }
  return url.toString()
}

/* ------------------------------------------------------------------ *
 * Point d'entrée
 * ------------------------------------------------------------------ */

export interface IntegrationBody {
  action: IntegrationAction
  /** Clé Anthropic ou Stripe, selon l'action. */
  key?: string
  /** Adresse Trafft. */
  url?: string
  /** Ouverture de la boutique. */
  enabled?: boolean
}

/** Applique une action et rend l'état à jour. */
export async function appliquerIntegration(token: string | null, raw: unknown): Promise<EtatIntegrations> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<IntegrationBody>
  const action = String(body.action ?? '') as IntegrationAction

  switch (action) {
    case 'anthropic': {
      const key = String(body.key ?? '').trim()
      if (!/^sk-ant-/.test(key)) {
        throw new HttpError(400, 'Une clé Anthropic commence par « sk-ant- ».')
      }
      if (!chiffrementConfigure()) chiffrer('') // lève le 503 explicite
      await eprouverAnthropic(key)
      await ecrire(
        cabinetId,
        { anthropic_hint: empreinte(key), anthropic_set_at: new Date().toISOString() },
        { anthropic_key_enc: chiffrer(key) },
        'integration.anthropic_posee',
        appelant.userId,
      )
      break
    }
    case 'anthropic-retirer':
      await ecrire(
        cabinetId,
        { anthropic_hint: null, anthropic_set_at: null },
        { anthropic_key_enc: null },
        'integration.anthropic_retiree',
        appelant.userId,
      )
      break

    case 'stripe': {
      const key = String(body.key ?? '').trim()
      if (!/^(sk|rk)_(live|test)_/.test(key)) {
        throw new HttpError(400, 'Une clé secrète Stripe commence par « sk_live_ », « sk_test_ » ou « rk_ ».')
      }
      if (!chiffrementConfigure()) chiffrer('')
      const label = await eprouverStripe(key)
      await ecrire(
        cabinetId,
        { stripe_hint: empreinte(key), stripe_account_label: label, stripe_set_at: new Date().toISOString() },
        { stripe_secret_enc: chiffrer(key) },
        'integration.stripe_posee',
        appelant.userId,
      )
      break
    }
    case 'stripe-retirer':
      await ecrire(
        cabinetId,
        { stripe_hint: null, stripe_account_label: null, stripe_set_at: null, shop_enabled: false },
        { stripe_secret_enc: null },
        'integration.stripe_retiree',
        appelant.userId,
      )
      break

    case 'trafft':
      await ecrire(cabinetId, { trafft_url: urlTrafft(String(body.url ?? '')) }, null, 'integration.trafft_posee', appelant.userId)
      break
    case 'trafft-retirer':
      await ecrire(cabinetId, { trafft_url: null }, null, 'integration.trafft_retiree', appelant.userId)
      break

    case 'boutique': {
      const etat = await etatIntegrations(token)
      if (body.enabled && !etat.stripe) {
        throw new HttpError(400, 'Connectez d’abord votre compte Stripe : sans lui, la boutique ne peut rien encaisser.')
      }
      await ecrire(cabinetId, { shop_enabled: Boolean(body.enabled) }, null, body.enabled ? 'boutique.ouverte' : 'boutique.fermee', appelant.userId)
      break
    }

    default:
      throw new HttpError(400, 'Action inconnue.')
  }

  return etatIntegrations(token)
}

/* ------------------------------------------------------------------ *
 * Pour les autres modules du serveur : les secrets, déchiffrés
 * ------------------------------------------------------------------ */

/** La clé Anthropic du cabinet, déchiffrée, ou null s'il n'en a pas posé. */
export async function cleAnthropicDuCabinet(cabinetId: string): Promise<string | null> {
  const db = clientAdmin()
  if (!db) return null
  const { data } = await db
    .from('cabinet_secrets')
    .select('anthropic_key_enc')
    .eq('cabinet_id', cabinetId)
    .maybeSingle<{ anthropic_key_enc: string | null }>()
  if (!data?.anthropic_key_enc) return null
  return dechiffrer(data.anthropic_key_enc)
}

/** La clé Stripe du cabinet, déchiffrée, ou null. */
export async function cleStripeDuCabinet(cabinetId: string): Promise<string | null> {
  const db = clientAdmin()
  if (!db) return null
  const { data } = await db
    .from('cabinet_secrets')
    .select('stripe_secret_enc')
    .eq('cabinet_id', cabinetId)
    .maybeSingle<{ stripe_secret_enc: string | null }>()
  if (!data?.stripe_secret_enc) return null
  return dechiffrer(data.stripe_secret_enc)
}
