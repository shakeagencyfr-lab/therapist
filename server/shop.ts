/**
 * Boutique : le paiement d'un produit par une patiente, sur le compte Stripe
 * de sa thérapeute.
 *
 * Deux moments, et rien entre les deux ne passe par le navigateur :
 *
 *   demarrerPaiement  la patiente choisit un produit ; le serveur crée la
 *                     session Stripe Checkout avec la clé du cabinet, note
 *                     la commande « en attente », et rend l'adresse de
 *                     paiement. L'argent va chez la thérapeute, pas chez
 *                     la plateforme.
 *
 *   verifierPaiement  au retour, le serveur demande à Stripe si la session
 *                     est payée. Si oui, la commande passe « payée » et ce
 *                     qui a été acheté est livré — un audio entre dans la
 *                     bibliothèque de la patiente. Recharger la page ne
 *                     livre jamais deux fois : la commande porte son état.
 *
 * Aucun rôle authentifié n'écrit dans `orders` : une patiente ne peut pas
 * se déclarer payée, seul Stripe le dit au serveur.
 */
import Stripe from 'stripe'
import { clientAdmin, identifier } from './auth.js'
import { levierDuCabinet } from './droits.js'
import { HttpError } from './errors.js'
import { cleStripeDuCabinet } from './integrations.js'

const SITE = (process.env.PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')

interface ProductRow {
  id: string
  cabinet_id: string
  title: string
  kind: 'audio' | 'seance' | 'programme' | 'autre'
  audio_id: string | null
  price_cents: number
  currency: string
  is_active: boolean
  archived_at: string | null
}

interface OrderRow {
  id: string
  cabinet_id: string
  patient_id: string
  product_id: string | null
  title: string
  status: 'en_attente' | 'payee' | 'annulee'
}

function admin() {
  const db = clientAdmin()
  if (!db) {
    throw new HttpError(503, "Le serveur n'a pas sa clé de service : la boutique ne peut pas encaisser.")
  }
  return db
}

/** La patiente derrière le jeton, et son cabinet. */
async function patiente(token: string | null): Promise<{ id: string; cabinetId: string }> {
  const appelant = await identifier(token)
  if (!appelant.patientId || !appelant.patientCabinetId) {
    throw new HttpError(403, "La boutique est réservée à l'espace d'une patiente.")
  }
  return { id: appelant.patientId, cabinetId: appelant.patientCabinetId }
}

async function stripeDuCabinet(cabinetId: string): Promise<Stripe> {
  const cle = await cleStripeDuCabinet(cabinetId)
  if (!cle) {
    throw new HttpError(409, "Votre thérapeute n'a pas encore relié son compte Stripe : la boutique ne peut rien encaisser.")
  }
  return new Stripe(cle)
}

/* ------------------------------------------------------------------ *
 * Démarrer
 * ------------------------------------------------------------------ */

export interface DemarrerBody {
  productId: string
}

export async function demarrerPaiement(token: string | null, raw: unknown): Promise<{ url: string }> {
  const { id: patientId, cabinetId } = await patiente(token)
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<DemarrerBody>
  const productId = String(body.productId ?? '').trim()
  if (!productId) throw new HttpError(400, 'Produit manquant.')

  const db = admin()
  const { data: produit } = await db
    .from('products')
    .select('id, cabinet_id, title, kind, audio_id, price_cents, currency, is_active, archived_at')
    .eq('id', productId)
    .maybeSingle<ProductRow>()
  if (!produit || produit.cabinet_id !== cabinetId || !produit.is_active || produit.archived_at) {
    throw new HttpError(404, "Ce produit n'est pas disponible.")
  }
  const { data: reglages } = await db
    .from('cabinet_settings')
    .select('shop_enabled')
    .eq('cabinet_id', cabinetId)
    .maybeSingle<{ shop_enabled: boolean }>()
  if (!reglages?.shop_enabled) {
    throw new HttpError(409, "La boutique de votre thérapeute n'est pas ouverte.")
  }
  /* Le levier de l'offre, tenu ICI et pas seulement à l'écran : un cabinet
     dont le revendeur a fermé la boutique ne doit pas pouvoir encaisser parce
     que l'interruption n'a pas atteint le navigateur d'une patiente. Le
     message reste le même — la patiente n'a pas à connaître le contrat de sa
     thérapeute. */
  if (!(await levierDuCabinet(cabinetId, 'shop', db))) {
    throw new HttpError(409, "La boutique de votre thérapeute n'est pas ouverte.")
  }
  if (!SITE) {
    throw new HttpError(503, "L'adresse publique du site n'est pas configurée (PUBLIC_SITE_URL).")
  }

  const stripe = await stripeDuCabinet(cabinetId)
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: patientId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: produit.currency.toLowerCase(),
            unit_amount: produit.price_cents,
            product_data: { name: produit.title },
          },
        },
      ],
      metadata: { cabinet_id: cabinetId, patient_id: patientId, product_id: produit.id },
      success_url: `${SITE}/mon?commande={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/mon?annule=1`,
    })
  } catch (err) {
    console.error('[boutique] création de session —', (err as Error).message)
    throw new HttpError(502, 'Le paiement est indisponible pour le moment. Réessayez dans un instant.')
  }
  if (!session.url) throw new HttpError(502, "Stripe n'a pas rendu d'adresse de paiement.")

  const { error } = await db.from('orders').insert({
    cabinet_id: cabinetId,
    patient_id: patientId,
    product_id: produit.id,
    title: produit.title,
    amount_cents: produit.price_cents,
    currency: produit.currency.toLowerCase(),
    stripe_session_id: session.id,
  })
  if (error) throw new HttpError(502, 'La commande n’a pas pu être enregistrée.')

  return { url: session.url }
}

/* ------------------------------------------------------------------ *
 * Vérifier au retour
 * ------------------------------------------------------------------ */

export interface VerifierBody {
  sessionId: string
}

export interface Verification {
  /** Le paiement est confirmé et la commande livrée. */
  payee: boolean
  title: string | null
}

export async function verifierPaiement(token: string | null, raw: unknown): Promise<Verification> {
  const { id: patientId, cabinetId } = await patiente(token)
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<VerifierBody>
  const sessionId = String(body.sessionId ?? '').trim()
  if (!sessionId) throw new HttpError(400, 'Session manquante.')

  const db = admin()
  const { data: commande } = await db
    .from('orders')
    .select('id, cabinet_id, patient_id, product_id, title, status')
    .eq('stripe_session_id', sessionId)
    .maybeSingle<OrderRow>()
  // Une commande qui n'est pas la sienne n'existe pas, à ses yeux.
  if (!commande || commande.patient_id !== patientId || commande.cabinet_id !== cabinetId) {
    throw new HttpError(404, 'Commande introuvable.')
  }
  if (commande.status === 'payee') return { payee: true, title: commande.title }

  const stripe = await stripeDuCabinet(cabinetId)
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    throw new HttpError(502, 'Le paiement n’a pas pu être vérifié. Réessayez dans un instant.')
  }
  if (session.payment_status !== 'paid') return { payee: false, title: commande.title }

  // Payée : on le note, puis on livre. L'état passe d'abord, pour que deux
  // vérifications simultanées ne livrent pas deux fois.
  const { data: passee } = await db
    .from('orders')
    .update({ status: 'payee', paid_at: new Date().toISOString() })
    .eq('id', commande.id)
    .eq('status', 'en_attente')
    .select('id')
  if (!passee?.length) return { payee: true, title: commande.title }

  await livrer(commande, cabinetId, patientId)
  return { payee: true, title: commande.title }
}

/** Ce qu'un achat déclenche : un audio rejoint la bibliothèque de la patiente. */
async function livrer(commande: OrderRow, cabinetId: string, patientId: string): Promise<void> {
  if (!commande.product_id) return
  const db = admin()
  const { data: produit } = await db
    .from('products')
    .select('kind, audio_id')
    .eq('id', commande.product_id)
    .maybeSingle<{ kind: string; audio_id: string | null }>()
  if (produit?.kind === 'audio' && produit.audio_id) {
    await db
      .from('patient_audios')
      .upsert(
        { cabinet_id: cabinetId, patient_id: patientId, audio_id: produit.audio_id },
        { onConflict: 'patient_id,audio_id', ignoreDuplicates: true },
      )
  }
  await db.from('audit_log').insert({
    cabinet_id: cabinetId,
    action: 'boutique.commande_payee',
    target_table: 'orders',
    target_id: commande.id,
  })
}
