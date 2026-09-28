/**
 * Boutique : le paiement d'un produit par un patient, sur le compte Stripe
 * de sa thérapeute.
 *
 * Deux moments, et rien entre les deux ne passe par le navigateur :
 *
 *   demarrerPaiement  le patient choisit un produit ; le serveur crée la
 *                     session Stripe Checkout avec la clé du cabinet, note
 *                     la commande « en attente », et rend l'adresse de
 *                     paiement. L'argent va chez la thérapeute, pas chez
 *                     la plateforme.
 *
 *   verifierPaiement  au retour, le serveur demande à Stripe si la session
 *                     est payée. Si oui, la commande passe « payée » et ce
 *                     qui a été acheté est livré — un audio entre dans la
 *                     bibliothèque du patient. Recharger la page ne
 *                     livre jamais deux fois : la commande porte son état.
 *
 * Et un troisième, parce que le retour n'arrive pas toujours :
 *
 *   verifierEnAttente la reprise. Un prélèvement confirmé des jours plus
 *                     tard, un onglet fermé avant la redirection, un réseau
 *                     coupé : la commande restait « en attente » pour
 *                     toujours, l'argent chez la thérapeute et rien chez le
 *                     patient. À chaque ouverture de la boutique — la sienne
 *                     ou celle de la thérapeute — le serveur repasse chez
 *                     Stripe ce qui attend encore, et reprend les livraisons
 *                     qui ont échoué.
 *
 * Pas de webhook : chaque cabinet encaisse sur SON compte Stripe, avec SA
 * clé, et un webhook se déclare compte par compte — autant de secrets de
 * signature à recueillir et à garder. La reprise demande seulement la clé
 * déjà confiée ; elle ne rattrape rien tant que personne n'ouvre la
 * boutique, ce qui suffit : c'est là que l'achat se voit.
 *
 * Aucun rôle authentifié n'écrit dans `orders` : un patient ne peut pas
 * se déclarer payée, seul Stripe le dit au serveur.
 */
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cheminEspacePatient } from '../src/lib/domaine.js'
import { clientAdmin, exigerCabinet, identifier } from './auth.js'
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
  /** Null sur une commande payée : la livraison est à reprendre (0047). */
  livree_at: string | null
}

const COLONNES_COMMANDE = 'id, cabinet_id, patient_id, product_id, title, status, livree_at'

/**
 * L'hôte par lequel la requête est arrivée : le domaine du cabinet ou le
 * nôtre. `x-forwarded-host` d'abord, que la plateforme pose et écrase ;
 * `host` sinon (serveur local).
 */
export function hoteDeLaRequete(headers: Record<string, string | string[] | undefined>): string | null {
  const brut = headers['x-forwarded-host'] ?? headers.host
  const valeur = Array.isArray(brut) ? brut[0] : brut
  // Une liste « a, b » se lit par la gauche : c'est l'hôte d'origine.
  return valeur ? (valeur.split(',')[0]?.trim() || null) : null
}

/** « Klaroweb.site:443 » et « klaroweb.site » désignent la même porte. */
function hoteNu(hote: string): string {
  return hote.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
}

/**
 * L'adresse de l'espace patient où revenir après le paiement — pure.
 *
 * `domaine` est le domaine du cabinet quand il est vérifié ET que la marque
 * blanche est ouverte ; `hote` est l'hôte de la requête qui a démarré le
 * paiement. Aucun des deux ne fabrique d'adresse : l'hôte sert seulement à
 * CHOISIR entre deux adresses que le serveur connaît déjà — celle du
 * cabinet, et `PUBLIC_SITE_URL`.
 *
 * POURQUOI CHOISIR. La session de connexion vit dans le navigateur, domaine
 * par domaine. Un patient parti de klaroweb.site/son-cabinet/mon qu'on
 * ramène sur le domaine du cabinet revient déconnecté, et la vérification de
 * son paiement attend qu'il se reconnecte. On le ramène donc là d'où il est
 * parti : sur le domaine du cabinet s'il y était, sinon sur l'adresse du
 * cabinet chez nous — `/son-cabinet/mon`, jamais `/mon` tout court, qui
 * l'aurait fait revenir sous notre marque.
 */
export function adresseDeRetour(o: {
  site: string
  slug: string | null
  domaine: string | null
  hote: string | null
}): string {
  if (o.domaine && o.hote && hoteNu(o.hote) === hoteNu(o.domaine)) {
    return `https://${hoteNu(o.domaine)}/mon`
  }
  return `${o.site}${cheminEspacePatient(o.slug ?? '')}`
}

/**
 * L'adresse à laquelle le patient revient après le paiement.
 *
 * En marque blanche, c'est CELLE DE SON CABINET : renvoyer sur le domaine de
 * la plateforme après un paiement, c'est révéler le fournisseur au pire
 * moment — juste après avoir demandé une carte bancaire. Le domaine n'est
 * retenu que vérifié, faute de quoi le retour tomberait dans le vide.
 */
async function retourDuCabinet(cabinetId: string, db: SupabaseClient, hote: string | null): Promise<string> {
  const { data: cabinet } = await db
    .from('cabinets')
    .select('slug')
    .eq('id', cabinetId)
    .maybeSingle<{ slug: string | null }>()
  const slug = cabinet?.slug ?? null
  /* VÉRIFIÉ NE SUFFIT PAS : IL FAUT AUSSI QUE LE LEVIER SOIT OUVERT.
     `cabinet_par_domaine()` exige la marque blanche pour reconnaître un
     domaine. Un cabinet dont l'offre a été refermée garde sa ligne de domaine
     vérifiée, mais son adresse ne désigne plus personne : y renvoyer un
     patient qui vient de payer l'amène sur une porte muette. C'est exactement
     le raisonnement que `baseDuCabinet` tient déjà pour les invitations ; il
     manquait ici, au seul endroit où de l'argent a déjà changé de main. */
  if (!(await levierDuCabinet(cabinetId, 'marqueBlanche', db))) {
    return adresseDeRetour({ site: SITE, slug, domaine: null, hote })
  }
  const { data } = await db
    .from('cabinet_domains')
    .select('domaine, verifie')
    .eq('cabinet_id', cabinetId)
    .maybeSingle<{ domaine: string; verifie: boolean }>()
  const domaine = data?.verifie && data.domaine ? data.domaine : null
  return adresseDeRetour({ site: SITE, slug, domaine, hote })
}

/**
 * Ce que Stripe dit d'une session, ramené à ce que la boutique en fait.
 *
 *   payee      l'argent est arrivé : on livre.
 *   reglement  le patient a validé, sa banque n'a pas encore confirmé — un
 *              prélèvement SEPA prend plusieurs jours. La commande attend,
 *              et les deux écrans le montrent.
 *   echouee    le prélèvement a été rejeté : rien n'est dû.
 *   expiree    la page de paiement a été abandonnée et a expiré : rien n'est
 *              dû, et rien n'a été débité.
 *   ouverte    la page de paiement est encore ouverte, rien n'est réglé.
 *              Personne n'a rien à en savoir : c'est un panier, pas une dette.
 */
export type EtatSession = 'payee' | 'reglement' | 'echouee' | 'expiree' | 'ouverte'

export function etatDeSession(session: {
  status: string | null
  payment_status: string
  /** L'état du paiement sous-jacent, quand on l'a demandé. */
  paiement?: string | null
}): EtatSession {
  if (session.payment_status === 'paid') return 'payee'
  if (session.status === 'expired') return 'expiree'
  if (session.status === 'complete') {
    /* Session close, pas encore payée : le règlement court. Il n'a échoué que
       si le paiement le dit — `requires_payment_method` après un rejet de la
       banque, `canceled` s'il a été annulé. Sans cette lecture, un
       prélèvement rejeté resterait « en attente » à jamais. */
    return session.paiement === 'requires_payment_method' || session.paiement === 'canceled'
      ? 'echouee'
      : 'reglement'
  }
  return 'ouverte'
}

function admin() {
  const db = clientAdmin()
  if (!db) {
    throw new HttpError(503, "Le serveur n'a pas sa clé de service : la boutique ne peut pas encaisser.")
  }
  return db
}

/** Le patient derrière le jeton, et son cabinet. */
async function patient(token: string | null): Promise<{ id: string; cabinetId: string }> {
  const appelant = await identifier(token)
  if (!appelant.patientId || !appelant.patientCabinetId) {
    throw new HttpError(403, "La boutique est réservée à l'espace d'un patient.")
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

/**
 * `hote` : l'hôte de la requête (en-tête Host), pour ramener le patient sur
 * la porte d'où il est parti — voir `adresseDeRetour`. Il ne choisit
 * qu'entre des adresses que le serveur connaît déjà.
 */
export async function demarrerPaiement(
  token: string | null,
  raw: unknown,
  hote: string | null = null,
): Promise<{ url: string }> {
  const { id: patientId, cabinetId } = await patient(token)
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
     que l'interruption n'a pas atteint le navigateur d'un patient. Le
     message reste le même — le patient n'a pas à connaître le contrat de sa
     thérapeute. */
  if (!(await levierDuCabinet(cabinetId, 'shop', db))) {
    throw new HttpError(409, "La boutique de votre thérapeute n'est pas ouverte.")
  }
  if (!SITE) {
    throw new HttpError(503, "L'adresse publique du site n'est pas configurée (PUBLIC_SITE_URL).")
  }

  const retour = await retourDuCabinet(cabinetId, db, hote)
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
      success_url: `${retour}?commande={CHECKOUT_SESSION_ID}`,
      cancel_url: `${retour}?annule=1`,
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
  /** La commande vérifiée — pour que la reprise qui suit ne l'annonce pas deux fois. */
  id: string
  /** Le paiement est confirmé. */
  payee: boolean
  title: string | null
  /** Ce qui a été acheté est arrivé. Faux : la livraison sera reprise. */
  livre: boolean
  /**
   * Non payée : pourquoi. `reglement` — validé, la banque n'a pas encore
   * confirmé (prélèvement) ; `abandon` — la page de paiement n'a pas été
   * menée au bout, rien n'est débité ; `echec` — la banque a refusé.
   */
  attente: 'reglement' | 'abandon' | 'echec' | null
}

export async function verifierPaiement(token: string | null, raw: unknown): Promise<Verification> {
  const { id: patientId, cabinetId } = await patient(token)
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<VerifierBody>
  const sessionId = String(body.sessionId ?? '').trim()
  if (!sessionId) throw new HttpError(400, 'Session manquante.')

  const db = admin()
  const { data: commande } = await db
    .from('orders')
    .select(COLONNES_COMMANDE)
    .eq('stripe_session_id', sessionId)
    .maybeSingle<OrderRow>()
  // Une commande qui n'est pas la sienne n'existe pas, à ses yeux.
  if (!commande || commande.patient_id !== patientId || commande.cabinet_id !== cabinetId) {
    throw new HttpError(404, 'Commande introuvable.')
  }
  const reponse = (payee: boolean, livre: boolean, attente: Verification['attente'] = null): Verification => ({
    id: commande.id,
    payee,
    title: commande.title,
    livre,
    attente,
  })
  /* Déjà payée : on retente la livraison si elle n'a pas eu lieu, plutôt que
     de la déclarer faite. Une livraison en échec n'était jamais reprise — le
     patient avait payé un audio qui n'arrivait pas, et chaque rechargement
     lui répondait que tout allait bien. `livree_at` dit si c'est fait. */
  if (commande.status === 'payee') return reponse(true, await livrer(commande, false))
  if (commande.status === 'annulee') return reponse(false, false, 'echec')

  const stripe = await stripeDuCabinet(cabinetId)
  let etat: EtatSession
  try {
    etat = await lireSession(stripe, sessionId)
  } catch {
    throw new HttpError(502, 'Le paiement n’a pas pu être vérifié. Réessayez dans un instant.')
  }
  const issue = await appliquer(commande, etat)
  if (issue.payee) return reponse(true, issue.livre)
  return reponse(false, false, etat === 'reglement' ? 'reglement' : etat === 'echouee' ? 'echec' : 'abandon')
}

/**
 * Demande l'état d'une session à Stripe, paiement sous-jacent compris.
 *
 * Le paiement n'est lu que pour une session close et non payée — le seul cas
 * où il départage un prélèvement en cours d'un prélèvement rejeté.
 */
async function lireSession(stripe: Stripe, sessionId: string): Promise<EtatSession> {
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] })
  } catch (err) {
    /* Une clé restreinte peut lire les sessions sans lire les paiements : on
       relit sans le détail. Un prélèvement rejeté reste alors « en attente »
       au lieu d'être annulé — jamais l'inverse, qui livrerait sans argent. */
    if ((err as { type?: string }).type !== 'StripePermissionError') throw err
    session = await stripe.checkout.sessions.retrieve(sessionId)
  }
  const intention = session.payment_intent
  const paiement = intention && typeof intention === 'object' ? intention.status : null
  return etatDeSession({ status: session.status, payment_status: session.payment_status, paiement })
}

/**
 * Écrit ce que Stripe a dit d'une commande encore en attente.
 *
 * Payée : l'état passe D'ABORD, conditionnellement, pour que deux
 * vérifications simultanées — le retour de Stripe et la reprise, lancés au
 * même montage — ne journalisent pas deux fois ; puis on livre. Expirée ou
 * rejetée : la commande est annulée, rien n'est dû. Le reste attend.
 */
async function appliquer(
  commande: OrderRow,
  etat: EtatSession,
): Promise<{ payee: boolean; livre: boolean; annulee: boolean }> {
  const db = admin()
  if (etat === 'payee') {
    const { data: passee } = await db
      .from('orders')
      .update({ status: 'payee', paid_at: new Date().toISOString() })
      .eq('id', commande.id)
      .eq('status', 'en_attente')
      .select('id')
    const livre = await livrer(commande, Boolean(passee?.length))
    return { payee: true, livre, annulee: false }
  }
  if (etat === 'expiree' || etat === 'echouee') {
    await db.from('orders').update({ status: 'annulee' }).eq('id', commande.id).eq('status', 'en_attente')
    return { payee: false, livre: false, annulee: true }
  }
  return { payee: false, livre: false, annulee: false }
}

/**
 * Ce qu'un achat déclenche : un audio rejoint la bibliothèque du patient.
 *
 * Rend vrai quand il n'y a plus rien à livrer — livraison faite (maintenant
 * ou avant), ou produit sans livraison automatique (une séance, un
 * programme, qui se règlent hors de l'application). Faux quand l'écriture a
 * échoué : l'appelant le dit, et la reprise suivante recommence.
 *
 * Une fois faite, la livraison est NOTÉE (`livree_at`) et ne se refait plus :
 * sans cela, la reprise remettrait dans la bibliothèque du patient l'audio
 * que sa thérapeute vient d'en retirer, à chaque ouverture de la boutique.
 */
async function livrer(commande: OrderRow, journaliser: boolean): Promise<boolean> {
  const db = admin()
  if (journaliser) {
    await db.from('audit_log').insert({
      cabinet_id: commande.cabinet_id,
      action: 'boutique.commande_payee',
      target_table: 'orders',
      target_id: commande.id,
    })
  }
  if (commande.livree_at) return true
  if (commande.product_id) {
    const { data: produit, error: e1 } = await db
      .from('products')
      .select('cabinet_id, kind, audio_id, audio:audio_library (cabinet_id)')
      .eq('id', commande.product_id)
      .maybeSingle<{
        cabinet_id: string
        kind: string
        audio_id: string | null
        audio: { cabinet_id: string } | null
      }>()
    if (e1) {
      console.error(`[boutique] livraison — commande ${commande.id} · produit illisible · ${e1.message}`)
      return false
    }
    if (produit?.kind === 'audio' && produit.audio_id) {
      /* LE CONTENU D'UN AUTRE CABINET NE SORT PAS D'ICI. La base le refuse
         depuis 0044, au produit comme à l'envoi ; on le revérifie pourtant
         avec la clé de service, qui passe au-dessus des politiques : c'est
         la dernière porte avant la bibliothèque d'un patient. On ne livre
         pas, et l'échec reste visible — une commande payée non livrée. */
      if (produit.cabinet_id !== commande.cabinet_id || produit.audio?.cabinet_id !== commande.cabinet_id) {
        console.error(`[boutique] livraison refusée — commande ${commande.id} · audio hors du cabinet`)
        return false
      }
      const { error } = await db
        .from('patient_audios')
        .upsert(
          { cabinet_id: commande.cabinet_id, patient_id: commande.patient_id, audio_id: produit.audio_id },
          { onConflict: 'patient_id,audio_id', ignoreDuplicates: true },
        )
      if (error) {
        // Journal technique seulement : ni dossier, ni contenu.
        console.error(`[boutique] livraison — commande ${commande.id} · ${error.message}`)
        return false
      }
    }
  }
  const { error: e2 } = await db
    .from('orders')
    .update({ livree_at: new Date().toISOString() })
    .eq('id', commande.id)
    .is('livree_at', null)
  // Livré, mais pas noté : la reprise suivante réécrira la même ligne, sans
  // doublon (l'envoi est idempotent). Mieux vaut cela qu'un échec annoncé.
  if (e2) console.error(`[boutique] livraison non notée — commande ${commande.id} · ${e2.message}`)
  return true
}

/* ------------------------------------------------------------------ *
 * Reprendre ce qui attend
 * ------------------------------------------------------------------ */

export interface RepriseBody {
  /** Qui demande : le patient pour ses commandes, le cabinet pour les siennes. */
  cote: 'patient' | 'cabinet'
}

export interface CommandeEnAttente {
  id: string
  title: string
  amount_cents: number
  currency: string
  created_at: string
  /** Le nom de la fiche, pour l'écran du cabinet ; null côté patient. */
  patient: string | null
  /**
   * `reglement` : validée, la banque n'a pas encore confirmé.
   * `inverifiable` : Stripe n'a pas répondu, ou la clé du cabinet a changé ;
   * elle sera redemandée au prochain passage.
   */
  etat: 'reglement' | 'inverifiable'
}

export interface Reprise {
  /**
   * Payées : confirmées par Stripe pendant ce passage (`nouvelle`), ou payées
   * plus tôt et dont la livraison vient d'être reprise. `livre` faux : elle a
   * encore échoué, le passage suivant recommencera.
   */
  confirmees: Array<{ id: string; title: string; livre: boolean; nouvelle: boolean }>
  /** Rejetées par la banque pendant ce passage : rien n'est dû. */
  echouees: Array<{ id: string; title: string }>
  /** Ce qui attend encore, à montrer. */
  enAttente: CommandeEnAttente[]
}

/** Au-delà, le passage suivant reprendra le reste : la page ne doit pas attendre. */
const REPRISE_MAX = 25

interface LigneReprise extends OrderRow {
  amount_cents: number
  currency: string
  created_at: string
  stripe_session_id: string
  fiche: { display_name: string } | null
}

/**
 * La reprise : repasse chez Stripe les commandes en attente de l'appelant,
 * et relivre ce qui a été payé sans arriver.
 *
 * Côté patient, ses commandes à lui, nommément — comme « Vos achats », et
 * pour la même raison : un compte qui est à la fois membre d'un cabinet et
 * titulaire d'une fiche ne doit pas reprendre le carnet du cabinet sous son
 * nom de patient. Côté cabinet, toutes celles du cabinet.
 *
 * Elle ne lève que pour qui n'a pas le droit de demander. Une clé Stripe
 * absente ou un Stripe muet ne sont pas des pannes de la page : les
 * commandes restent « à vérifier », et le passage suivant recommence.
 */
export async function verifierEnAttente(token: string | null, raw: unknown): Promise<Reprise> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<RepriseBody>
  const appelant = await identifier(token)
  let cabinetId: string
  let patientId: string | null = null
  if (body.cote === 'cabinet') {
    cabinetId = exigerCabinet(appelant)
  } else {
    if (!appelant.patientId || !appelant.patientCabinetId) {
      throw new HttpError(403, "La boutique est réservée à l'espace d'un patient.")
    }
    cabinetId = appelant.patientCabinetId
    patientId = appelant.patientId
  }

  const db = admin()
  let requete = db
    .from('orders')
    .select(`${COLONNES_COMMANDE}, amount_cents, currency, created_at, stripe_session_id, fiche:patients (display_name)`)
    .eq('cabinet_id', cabinetId)
    .or('status.eq.en_attente,and(status.eq.payee,livree_at.is.null)')
    .order('created_at', { ascending: false })
    .limit(REPRISE_MAX)
  if (patientId) requete = requete.eq('patient_id', patientId)
  const { data, error } = await requete
  if (error) throw new HttpError(502, 'Les commandes en attente n’ont pas pu être relues.')
  const lignes = (data ?? []) as unknown as LigneReprise[]

  const reprise: Reprise = { confirmees: [], echouees: [], enAttente: [] }
  if (!lignes.length) return reprise

  // Une clé absente n'empêche pas de relivrer ce qui est déjà payé.
  let stripe: Stripe | null = null
  if (lignes.some((l) => l.status === 'en_attente')) {
    try {
      stripe = await stripeDuCabinet(cabinetId)
    } catch {
      stripe = null
    }
  }

  const attend = (l: LigneReprise, etat: CommandeEnAttente['etat']) =>
    reprise.enAttente.push({
      id: l.id,
      title: l.title,
      amount_cents: l.amount_cents,
      currency: l.currency,
      created_at: l.created_at,
      patient: patientId ? null : (l.fiche?.display_name ?? null),
      etat,
    })

  await Promise.all(
    lignes.map(async (l) => {
      if (l.status === 'payee') {
        reprise.confirmees.push({ id: l.id, title: l.title, livre: await livrer(l, false), nouvelle: false })
        return
      }
      if (!stripe) {
        attend(l, 'inverifiable')
        return
      }
      let etat: EtatSession
      try {
        etat = await lireSession(stripe, l.stripe_session_id)
      } catch (err) {
        console.error(`[boutique] reprise — commande ${l.id} · ${(err as Error).message}`)
        attend(l, 'inverifiable')
        return
      }
      const issue = await appliquer(l, etat)
      if (issue.payee) reprise.confirmees.push({ id: l.id, title: l.title, livre: issue.livre, nouvelle: true })
      else if (etat === 'echouee') reprise.echouees.push({ id: l.id, title: l.title })
      else if (etat === 'reglement') attend(l, 'reglement')
      // Expirée : annulée, rien n'est dû. Ouverte : un panier, pas une dette.
    }),
  )
  // L'ordre d'arrivée des réponses de Stripe n'est pas celui des commandes.
  reprise.enAttente.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return reprise
}
