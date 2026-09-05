/**
 * Intégrations du cabinet : clé d'analyse (Anthropic), paiement (Stripe),
 * prise de rendez-vous (BookRDV, ou tout autre agenda en ligne).
 *
 * Trois règles, et tout le fichier en découle :
 *
 *   1. Une clé est VALIDÉE avant d'être enregistrée — par un vrai appel au
 *      service concerné. Une clé fausse se découvre ici, à la saisie, pas
 *      en séance devant un patient.
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
import { droitsDuCabinet, exigerDroit } from './droits.js'
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
  /** Adresse de la page de réservation, sans marque : chacun son agenda. */
  bookingUrl: string | null
  /** « bouton » ouvre la page, « widget » l'encadre dans l'espace patient. */
  bookingMode: 'bouton' | 'widget'
  /** Adresse du widget, quand elle diffère de celle de la page. */
  bookingWidgetUrl: string | null
  shopEnabled: boolean
  /** Le serveur sait-il chiffrer ? Sinon, l'écran le dit avant la saisie. */
  chiffrement: boolean
  /**
   * Le serveur tourne-t-il en mode maquette ?
   *
   * Tant qu'il y tourne, AUCUNE clé n'est appelée : les analyses sont des
   * textes écrits d'avance. Une praticienne pouvait poser sa clé, la voir
   * vérifiée et enregistrée, et ne comprendre qu'en séance que rien ne
   * s'en servait. L'écran doit le dire avant la saisie, pas après.
   */
  maquette: boolean
}

export type IntegrationAction =
  | 'anthropic'
  | 'anthropic-retirer'
  | 'stripe'
  | 'stripe-retirer'
  | 'rdv'
  | 'rdv-retirer'
  | 'boutique'

interface SettingsRow {
  anthropic_hint: string | null
  anthropic_set_at: string | null
  stripe_hint: string | null
  stripe_account_label: string | null
  stripe_set_at: string | null
  booking_url: string | null
  booking_mode: string | null
  booking_widget_url: string | null
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
    bookingUrl: row?.booking_url ?? null,
    bookingMode: row?.booking_mode === 'widget' ? 'widget' : 'bouton',
    bookingWidgetUrl: row?.booking_widget_url ?? null,
    shopEnabled: row?.shop_enabled ?? false,
    chiffrement: chiffrementConfigure(),
    maquette: process.env.AI_MOCK === '1',
  }
}

/** L'état, lu sous les droits de l'appelant (la RLS borne à son cabinet). */
export async function etatIntegrations(token: string | null): Promise<EtatIntegrations> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const { data, error } = await appelant.client
    .from('cabinet_settings')
    .select(
      'anthropic_hint, anthropic_set_at, stripe_hint, stripe_account_label, stripe_set_at, booking_url, booking_mode, booking_widget_url, shop_enabled',
    )
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

/** Le motif technique va au journal ; l'écran reçoit une phrase française. */
function enregistrementImpossible(cause: string): HttpError {
  // Journal technique seulement : jamais une clé, jamais un dossier.
  console.error(`[integrations] enregistrement — ${cause}`)
  return new HttpError(502, "Le réglage n'a pas pu être enregistré. Réessayez dans un instant.")
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
  if (e1) throw enregistrementImpossible(e1.message)
  if (secrets) {
    const { error: e2 } = await db
      .from('cabinet_secrets')
      .upsert({ cabinet_id: cabinetId, ...secrets, updated_at: maintenant }, { onConflict: 'cabinet_id' })
    if (e2) throw enregistrementImpossible(e2.message)
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

/* ---- Prise de rendez-vous -------------------------------------------- */

/**
 * Une adresse de réservation, éprouvée avant d'être écrite.
 *
 * L'exigence du https n'est pas une coquetterie : cette adresse finit dans
 * un cadre, chez le patient, sur une page servie en https. Un cadre en http
 * y serait bloqué par le navigateur, sans un mot d'explication.
 */
function urlReservation(valeur: string, quoi: string): string {
  let url: URL
  try {
    url = new URL(valeur.trim())
  } catch {
    throw new HttpError(400, `${quoi} n'est pas une adresse complète (elle doit commencer par https://).`)
  }
  if (url.protocol !== 'https:') {
    throw new HttpError(400, `${quoi} doit être en https://.`)
  }
  return url.toString()
}

/**
 * L'adresse à encadrer, tirée du code d'intégration que l'agenda fournit.
 *
 * Ces codes ne sont pas des adresses : ce sont quelques lignes de HTML et un
 * script à charger. Or nous ne chargerons jamais ce script. L'espace de la
 * patient contient son dossier et son jeton de session ; y exécuter le code
 * d'un tiers reviendrait à le lui confier. On lit donc le code pour en tirer
 * la seule chose dont on a besoin — l'adresse de la page de réservation — et
 * c'est elle, et elle seule, qui ira dans un cadre.
 *
 * Trois formes reconnues, dans cet ordre :
 *   - une adresse, quand la thérapeute en a déjà une ;
 *   - le code de BookRDV : data-url porte le domaine, data-query les
 *     paramètres du rendez-vous (le service, l'identifiant du calendrier) ;
 *   - un <iframe src="…">, la forme qu'emploient la plupart des autres.
 */
export function urlDuCodeIntegration(brut: string): string {
  const texte = brut.trim()
  if (!texte) {
    throw new HttpError(400, "Collez le code d'intégration donné par votre agenda.")
  }

  if (!texte.includes('<') && /^https?:\/\//i.test(texte)) {
    return urlReservation(texte, "L'adresse du widget")
  }

  const dataUrl = /data-url\s*=\s*["']([^"']+)["']/i.exec(texte)
  if (dataUrl) {
    const url = new URL(urlReservation(dataUrl[1], "L'adresse du widget"))
    const query = /data-query\s*=\s*["']([^"']*)["']/i.exec(texte)?.[1] ?? ''
    for (const [cle, valeur] of new URLSearchParams(query.replace(/^[?&]+/, ''))) {
      url.searchParams.set(cle, valeur)
    }
    return url.toString()
  }

  const iframe = /<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(texte)
  if (iframe) {
    return urlReservation(iframe[1], "L'adresse du widget")
  }

  throw new HttpError(
    400,
    "Ce code d'intégration n'a pas été compris. Collez-le en entier, tel que votre agenda vous le donne — ou, à défaut, l'adresse du widget seule.",
  )
}

/* ------------------------------------------------------------------ *
 * Point d'entrée
 * ------------------------------------------------------------------ */

export interface IntegrationBody {
  action: IntegrationAction
  /** Clé Anthropic ou Stripe, selon l'action. */
  key?: string
  /** Adresse de la page de réservation, en mode « bouton ». */
  url?: string
  /** Code d'intégration de l'agenda, en mode « widget ». */
  embed?: string
  /** « bouton » ou « widget ». */
  mode?: string
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

    case 'rdv': {
      // Deux modes, deux saisies : une adresse quand c'est un bouton, le code
      // d'intégration de l'agenda quand c'est un widget. Dans les deux cas,
      // ce qui est enregistré est une adresse — jamais du code à exécuter.
      const widget = body.mode === 'widget' ? urlDuCodeIntegration(String(body.embed ?? '')) : null
      const page = widget ?? urlReservation(String(body.url ?? ''), "L'adresse de réservation")
      await ecrire(
        cabinetId,
        {
          booking_url: page,
          booking_mode: widget ? 'widget' : 'bouton',
          booking_widget_url: widget,
        },
        null,
        'integration.rdv_posee',
        appelant.userId,
      )
      break
    }
    case 'rdv-retirer':
      await ecrire(
        cabinetId,
        { booking_url: null, booking_widget_url: null, booking_mode: 'bouton' },
        null,
        'integration.rdv_retiree',
        appelant.userId,
      )
      break

    case 'boutique': {
      /* Le levier de l'offre, vérifié ICI comme il l'est pour le domaine, le
         SMTP et le site vitrine. Sans lui, une thérapeute dont l'offre ne
         comprend pas la boutique pouvait l'ouvrir, croire qu'elle vend — et
         ses patients ne voyaient rien, puisque patient_cabinet_settings()
         exige les DEUX depuis 0026. Le geste réussissait et ne produisait
         rien : le pire des retours. */
      if (body.enabled) await exigerDroit(await droitsDuCabinet(cabinetId, appelant.client), 'shop')
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
