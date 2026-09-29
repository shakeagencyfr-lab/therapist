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
 * Et, une fois l'argent encaissé (0058) :
 *
 *   rembourserCommande  la titulaire rembourse une vente, avec la même clé.
 *                       Rien n'est retiré au patient — voir plus bas.
 *
 *   recuDeCommande      ce qu'il faut pour imprimer le reçu, le même pour
 *                       le patient et pour le cabinet.
 *
 * Aucun rôle authentifié n'écrit dans `orders` : un patient ne peut pas
 * se déclarer payée, seul Stripe le dit au serveur.
 */
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cheminEspacePatient } from '../src/lib/domaine.js'
import { clientAdmin, exigerCabinet, identifier, identifierPourGesteSensible } from './auth.js'
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
  let lue: SessionLue
  try {
    lue = await lireSession(stripe, sessionId)
  } catch {
    throw new HttpError(502, 'Le paiement n’a pas pu être vérifié. Réessayez dans un instant.')
  }
  const etat = lue.etat
  const issue = await appliquer(commande, lue)
  if (issue.payee) return reponse(true, issue.livre)
  return reponse(false, false, etat === 'reglement' ? 'reglement' : etat === 'echouee' ? 'echec' : 'abandon')
}

/** Ce qu'une session dit, et le paiement qu'elle a ouvert. */
interface SessionLue {
  etat: EtatSession
  /** Le paiement Stripe (pi_…) derrière la session, s'il existe déjà. */
  paiement: string | null
  /** Faux en mode test : le tableau de bord Stripe n'a pas la même adresse. */
  livemode: boolean
}

/** L'identifiant d'un paiement, qu'il soit rendu seul ou déplié. */
export function idDuPaiement(intention: string | { id: string } | null | undefined): string | null {
  const id = typeof intention === 'string' ? intention : (intention?.id ?? null)
  return id && /^pi_[A-Za-z0-9]+$/.test(id) ? id : null
}

/**
 * Demande l'état d'une session à Stripe, paiement sous-jacent compris.
 *
 * Le paiement n'est lu que pour une session close et non payée — le seul cas
 * où il départage un prélèvement en cours d'un prélèvement rejeté.
 */
async function lireSession(stripe: Stripe, sessionId: string): Promise<SessionLue> {
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
  return {
    etat: etatDeSession({ status: session.status, payment_status: session.payment_status, paiement }),
    paiement: idDuPaiement(intention),
    livemode: session.livemode,
  }
}

/**
 * Note le paiement Stripe d'une commande (0058) : il sert à la rembourser
 * sans relire la session, et à l'ouvrir dans le tableau de bord Stripe.
 *
 * À part, et sans rien exiger : l'argent est déjà là, la livraison ne doit
 * pas dépendre d'une note. Si elle échoue, le remboursement relira la
 * session.
 */
async function noterLePaiement(commandeId: string, paiement: string | null, livemode: boolean | null): Promise<void> {
  if (!paiement) return
  const { error } = await admin()
    .from('orders')
    .update({ stripe_payment_intent: paiement, stripe_livemode: livemode })
    .eq('id', commandeId)
    .is('stripe_payment_intent', null)
  if (error) console.error(`[boutique] paiement non noté — commande ${commandeId} · ${error.message}`)
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
  lue: SessionLue,
): Promise<{ payee: boolean; livre: boolean; annulee: boolean }> {
  const db = admin()
  const etat = lue.etat
  if (etat === 'payee') {
    const { data: passee } = await db
      .from('orders')
      .update({ status: 'payee', paid_at: new Date().toISOString() })
      .eq('id', commande.id)
      .eq('status', 'en_attente')
      .select('id')
    await noterLePaiement(commande.id, lue.paiement, lue.livemode)
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
      let lue: SessionLue
      try {
        lue = await lireSession(stripe, l.stripe_session_id)
      } catch (err) {
        console.error(`[boutique] reprise — commande ${l.id} · ${(err as Error).message}`)
        attend(l, 'inverifiable')
        return
      }
      const etat = lue.etat
      const issue = await appliquer(l, lue)
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

/* ------------------------------------------------------------------ *
 * Rembourser (0058)
 * ------------------------------------------------------------------ */

export interface RembourserBody {
  commandeId: string
}

/** Ce que l'écran du cabinet reçoit ; il en fait une phrase (src/lib/ventes.ts). */
export interface Remboursement {
  /** La vente est remboursée — par ce geste, ou avant lui. */
  rembourse: boolean
  /** Stripe l'a accepté ; la banque ne l'a pas encore crédité. */
  enCours: boolean
  /** Déjà remboursée avant ce geste — ici, ou depuis le tableau de bord Stripe. */
  deja: boolean
  rembourseLe: string | null
  /**
   * Non remboursée : pourquoi. `droits` — la clé du cabinet ne peut pas
   * rembourser ; `cle` — plus de clé, ou une clé que Stripe n'accepte plus ;
   * `refus` — Stripe refuse ce remboursement-là ; `action` — Stripe attend
   * une étape de plus. Dans tous les cas, l'écran ouvre le paiement dans le
   * tableau de bord Stripe.
   */
  raison: 'droits' | 'cle' | 'refus' | 'action' | null
  /** De quoi ouvrir le paiement dans le tableau de bord Stripe. */
  paiement: string | null
  livemode: boolean | null
}

type ErreurStripe = { type?: string; code?: string; statusCode?: number; message?: string }

/**
 * Ce qu'une erreur de Stripe veut dire pour un remboursement — pure.
 *
 *   deja    le paiement est déjà entièrement remboursé (depuis le tableau de
 *           bord Stripe, par exemple) : il n'y a plus qu'à le noter
 *   droits  la clé du cabinet est restreinte et n'a pas le droit de rembourser
 *   cle     la clé n'est plus acceptée — révoquée ou remplacée chez Stripe
 *   refus   Stripe refuse CE remboursement : paiement contesté, déjà
 *           remboursé en partie, montant supérieur à ce qui reste
 *   panne   Stripe n'a pas répondu : on peut réessayer sans risque de doublon
 */
export type IssueErreurStripe = 'deja' | 'droits' | 'cle' | 'refus' | 'panne'

export function issueDeLErreurStripe(err: ErreurStripe | null | undefined): IssueErreurStripe {
  if (err?.code === 'charge_already_refunded') return 'deja'
  if (err?.type === 'StripePermissionError' || err?.statusCode === 403) return 'droits'
  if (err?.type === 'StripeAuthenticationError' || err?.statusCode === 401) return 'cle'
  if (err?.type === 'StripeInvalidRequestError' || err?.type === 'StripeCardError') return 'refus'
  return 'panne'
}

/**
 * L'état d'un remboursement que Stripe vient de créer — pure.
 *
 * `pending` est un remboursement accepté que la banque n'a pas encore
 * crédité (un prélèvement SEPA, par exemple) : la vente est remboursée, le
 * crédit suit. Un état absent vaut de même : l'objet existe, Stripe le
 * mènera. `requires_action` attend une étape que seul le tableau de bord
 * propose ; `failed` et `canceled` n'ont rien rendu.
 */
export function issueDuRemboursement(status: string | null | undefined): 'fait' | 'en_cours' | 'action' | 'echec' {
  if (status === 'succeeded') return 'fait'
  if (status === 'pending' || status == null) return 'en_cours'
  if (status === 'requires_action') return 'action'
  return 'echec'
}

/** Un identifiant de commande a la forme d'un uuid ; sinon, il ne désigne rien. */
function estIdentifiant(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

/** Un identifiant de remboursement qu'on peut noter (0058 en vérifie la forme). */
function idDuRemboursement(id: string | null | undefined): string | null {
  return id && /^(re|pyr)_[A-Za-z0-9]+$/.test(id) ? id : null
}

interface LigneARembourser {
  id: string
  cabinet_id: string
  status: OrderRow['status'] | 'remboursee'
  amount_cents: number
  stripe_session_id: string
  stripe_payment_intent: string | null
  stripe_livemode: boolean | null
  rembourse_at: string | null
}

/**
 * Rembourse une vente, en entier, avec la clé Stripe du cabinet.
 *
 * UN GESTE D'ARGENT, RÉSERVÉ À LA PERSONNE TITULAIRE. L'argent repart du
 * compte Stripe de la titulaire : une consœur ou une assistante de l'équipe
 * voit les ventes et en télécharge les reçus, elle ne les rembourse pas. Et
 * le second facteur est exigé s'il est activé, comme pour la clé Stripe
 * elle-même.
 *
 * EN ENTIER, ET UNE SEULE FOIS. Le montant est celui de la commande, passé
 * explicitement : si la vente a déjà été remboursée en partie dans Stripe,
 * Stripe refuse, et le livre des recettes ne note pas un remboursement
 * complet qui n'a pas eu lieu. La clé d'idempotence tient le double clic,
 * la seconde fenêtre et la reprise après une coupure : Stripe rend le même
 * remboursement au lieu d'en créer un second.
 *
 * RIEN N'EST RETIRÉ AU PATIENT. Un audio acheté reste dans sa bibliothèque :
 * le remboursement est un geste d'argent, pas une décision de soin — et la
 * même ligne de bibliothèque peut venir d'un envoi de la thérapeute, qu'on
 * ne distinguerait pas de l'achat. Retirer l'audio devient possible, depuis
 * la fiche, si c'est sa décision : la garde de 0045, qui le tient chez le
 * patient tant que la vente est payée, ne tient plus une vente remboursée.
 *
 * Quand Stripe ne rembourse pas — clé restreinte, paiement contesté —, rien
 * n'est noté, et l'écran ouvre le paiement dans le tableau de bord Stripe.
 */
export async function rembourserCommande(token: string | null, raw: unknown): Promise<Remboursement> {
  const appelant = await identifierPourGesteSensible(token)
  const cabinetId = exigerCabinet(appelant)
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<RembourserBody>
  const commandeId = String(body.commandeId ?? '').trim()
  if (!commandeId) throw new HttpError(400, 'Vente manquante.')
  if (!estIdentifiant(commandeId)) throw new HttpError(404, 'Vente introuvable.')

  const { data: titulaire, error: eTitulaire } = await appelant.client.rpc('est_titulaire_du_cabinet', {
    p_cabinet: cabinetId,
  })
  if (eTitulaire) throw new HttpError(502, "Vos droits n'ont pas pu être vérifiés. Réessayez dans un instant.")
  if (titulaire !== true) {
    throw new HttpError(403, 'Le remboursement est réservé à la personne titulaire du cabinet.')
  }

  const db = admin()
  const { data: commande, error } = await db
    .from('orders')
    .select('id, cabinet_id, status, amount_cents, stripe_session_id, stripe_payment_intent, stripe_livemode, rembourse_at')
    .eq('id', commandeId)
    .maybeSingle<LigneARembourser>()
  if (error) throw new HttpError(502, 'La vente n’a pas pu être relue. Réessayez dans un instant.')
  // Une vente d'un autre cabinet n'existe pas, à ses yeux.
  if (!commande || commande.cabinet_id !== cabinetId) throw new HttpError(404, 'Vente introuvable.')

  let paiement = commande.stripe_payment_intent
  let livemode = commande.stripe_livemode
  const issue = (x: Partial<Remboursement>): Remboursement => ({
    rembourse: false,
    enCours: false,
    deja: false,
    rembourseLe: null,
    raison: null,
    paiement,
    livemode,
    ...x,
  })
  if (commande.status === 'remboursee') return issue({ rembourse: true, deja: true, rembourseLe: commande.rembourse_at })
  if (commande.status !== 'payee') {
    throw new HttpError(409, "Seule une vente payée se rembourse : celle-ci n'a pas été encaissée.")
  }

  const cle = await cleStripeDuCabinet(cabinetId)
  if (!cle) return issue({ raison: 'cle' })
  const stripe = new Stripe(cle)

  /* Le paiement : noté à l'encaissement depuis 0058 ; relu dans la session
     pour une vente plus ancienne, et noté au passage. */
  if (!paiement) {
    try {
      const session = await stripe.checkout.sessions.retrieve(commande.stripe_session_id)
      paiement = idDuPaiement(session.payment_intent)
      livemode = session.livemode
    } catch (err) {
      const e = issueDeLErreurStripe(err as ErreurStripe)
      if (e === 'panne') {
        throw new HttpError(502, "Stripe n'a pas répondu. Rien n'a été remboursé : réessayez dans un instant.")
      }
      return issue({ raison: e === 'deja' ? 'refus' : e })
    }
    if (!paiement) return issue({ raison: 'refus' })
    await noterLePaiement(commande.id, paiement, livemode)
  }

  let rendu: Stripe.Refund
  try {
    rendu = await stripe.refunds.create(
      {
        payment_intent: paiement,
        amount: commande.amount_cents,
        reason: 'requested_by_customer',
        metadata: { commande: commande.id },
      },
      { idempotencyKey: `remboursement-${commande.id}` },
    )
  } catch (err) {
    const e = issueDeLErreurStripe(err as ErreurStripe)
    /* Déjà rendu, depuis le tableau de bord : on le constate. Une clé
       restreinte ne le dit pas — elle refuse avant de regarder ; et Stripe
       garde vingt-quatre heures la réponse d'une clé d'idempotence, si bien
       qu'un refus (« déjà remboursé en partie ») reviendrait tel quel après
       que la praticienne a terminé dans le tableau de bord. Dans ces deux
       cas, on lit le paiement, que la boutique sait déjà lire. */
    const aVerifier = e === 'droits' || e === 'refus'
    if (e === 'deja' || (aVerifier && (await dejaRembourseChezStripe(stripe, paiement)))) {
      const le = await noterRemboursee(commande.id, null, appelant.userId, cabinetId)
      return issue({ rembourse: true, deja: true, rembourseLe: le })
    }
    if (e === 'panne') {
      console.error(`[boutique] remboursement — commande ${commande.id} · ${(err as Error).message}`)
      throw new HttpError(
        502,
        "Stripe n'a pas répondu. Réessayez dans un instant : le même remboursement ne peut pas partir deux fois.",
      )
    }
    // Journal technique : la commande et la catégorie du refus, rien d'autre.
    console.error(`[boutique] remboursement refusé — commande ${commande.id} · ${e}`)
    return issue({ raison: e })
  }

  const etat = issueDuRemboursement(rendu.status)
  if (etat === 'echec') return issue({ raison: 'refus' })
  if (etat === 'action') return issue({ raison: 'action' })
  const le = await noterRemboursee(commande.id, rendu.id, appelant.userId, cabinetId)
  return issue({ rembourse: true, enCours: etat === 'en_cours', rembourseLe: le })
}

/** Le paiement est-il déjà entièrement remboursé chez Stripe ? Dans le doute, non. */
async function dejaRembourseChezStripe(stripe: Stripe, paiement: string): Promise<boolean> {
  try {
    const intention = await stripe.paymentIntents.retrieve(paiement, { expand: ['latest_charge'] })
    const charge = intention.latest_charge
    return Boolean(charge && typeof charge === 'object' && charge.refunded)
  } catch {
    return false
  }
}

/**
 * Note la vente remboursée — conditionnellement, pour que deux gestes
 * simultanés ne journalisent pas deux fois — et rend l'instant noté.
 *
 * Si l'écriture échoue, l'argent est pourtant rendu : on le dit, et un
 * nouvel essai le notera (Stripe rendra le même remboursement, ou dira
 * « déjà remboursé »). Au journal d'accès, la vente et qui l'a remboursée —
 * ni montant, ni produit, ni patient.
 */
async function noterRemboursee(
  commandeId: string,
  remboursementId: string | null,
  acteur: string,
  cabinetId: string,
): Promise<string> {
  const db = admin()
  const le = new Date().toISOString()
  const { data, error } = await db
    .from('orders')
    .update({ status: 'remboursee', rembourse_at: le, stripe_refund_id: idDuRemboursement(remboursementId) })
    .eq('id', commandeId)
    .eq('status', 'payee')
    .select('rembourse_at')
  if (error) {
    console.error(`[boutique] remboursement non noté — commande ${commandeId} · ${error.message}`)
    throw new HttpError(
      502,
      "Le remboursement est parti chez Stripe, mais n'a pas pu être noté ici. Réessayez : il ne partira pas deux fois.",
    )
  }
  if (!data?.length) {
    // Un autre geste l'a noté entre-temps : c'est son instant qui compte.
    const { data: relue } = await db
      .from('orders')
      .select('rembourse_at')
      .eq('id', commandeId)
      .maybeSingle<{ rembourse_at: string | null }>()
    return relue?.rembourse_at ?? le
  }
  const { error: eJournal } = await db.from('audit_log').insert({
    cabinet_id: cabinetId,
    actor_user_id: acteur,
    action: remboursementId ? 'boutique.commande_remboursee' : 'boutique.remboursement_constate',
    target_table: 'orders',
    target_id: commandeId,
  })
  if (eJournal) console.error(`[boutique] remboursement non journalisé — commande ${commandeId} · ${eJournal.message}`)
  return (data[0] as { rembourse_at: string }).rembourse_at
}

/* ------------------------------------------------------------------ *
 * Le reçu (0058)
 * ------------------------------------------------------------------ */

export interface RecuBody {
  commandeId: string
  /** Le patient pour ses achats, le cabinet pour ses ventes. */
  cote: 'patient' | 'cabinet'
}

/** De quoi imprimer un reçu (src/lib/recuPdf.ts). Le même des deux côtés. */
export interface Recu {
  commandeId: string
  cabinet: string
  praticien: string | null
  adresse: string | null
  numeroPro: string | null
  payeur: string | null
  produit: string
  montantCents: number
  devise: string
  payeLe: string
  rembourseLe: string | null
  paiementStripe: string | null
}

interface LigneRecu {
  id: string
  cabinet_id: string
  title: string
  amount_cents: number
  currency: string
  status: string
  paid_at: string | null
  rembourse_at: string | null
  stripe_payment_intent: string | null
  fiche: { display_name: string } | null
}

/**
 * Ce qu'il faut pour imprimer le reçu d'un achat.
 *
 * Servi par le serveur parce que le patient ne lit ni le nom du cabinet en
 * base ni son identité de facturation, que le reçu doit porter — celle-là
 * même que la praticienne imprime sur ses notes d'honoraires (0053). Le
 * patient ne reçoit que SES achats, nommément ; le cabinet, les siens.
 */
export async function recuDeCommande(token: string | null, raw: unknown): Promise<Recu> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<RecuBody>
  const commandeId = String(body.commandeId ?? '').trim()
  if (!commandeId) throw new HttpError(400, 'Achat manquant.')
  if (!estIdentifiant(commandeId)) throw new HttpError(404, 'Achat introuvable.')
  const appelant = await identifier(token)
  let colonne: 'cabinet_id' | 'patient_id'
  let valeur: string
  if (body.cote === 'cabinet') {
    colonne = 'cabinet_id'
    valeur = exigerCabinet(appelant)
  } else {
    if (!appelant.patientId) throw new HttpError(403, "Les reçus d'achat se lisent depuis l'espace d'un patient.")
    colonne = 'patient_id'
    valeur = appelant.patientId
  }

  const db = admin()
  const { data: c, error } = await db
    .from('orders')
    .select(
      'id, cabinet_id, title, amount_cents, currency, status, paid_at, rembourse_at, stripe_payment_intent, fiche:patients (display_name)',
    )
    .eq('id', commandeId)
    .eq(colonne, valeur)
    .maybeSingle<LigneRecu>()
  if (error) throw new HttpError(502, 'Le reçu n’a pas pu être préparé. Réessayez dans un instant.')
  if (!c) throw new HttpError(404, 'Achat introuvable.')
  if ((c.status !== 'payee' && c.status !== 'remboursee') || !c.paid_at) {
    throw new HttpError(409, "Pas de reçu pour cet achat : il n'a pas été payé.")
  }

  const [cabinet, facturation] = await Promise.all([
    db.from('cabinets').select('name').eq('id', c.cabinet_id).maybeSingle<{ name: string | null }>(),
    db
      .from('cabinet_facturation')
      .select('praticien, adresse, numero_pro')
      .eq('cabinet_id', c.cabinet_id)
      .maybeSingle<{ praticien: string | null; adresse: string | null; numero_pro: string | null }>(),
  ])
  // Sans nom de cabinet lisible, pas de reçu : il n'aurait pas d'émetteur.
  if (cabinet.error || !cabinet.data?.name) {
    throw new HttpError(502, 'Le reçu n’a pas pu être préparé. Réessayez dans un instant.')
  }
  const f = facturation.error ? null : facturation.data
  return {
    commandeId: c.id,
    cabinet: cabinet.data.name,
    praticien: f?.praticien?.trim() || null,
    adresse: f?.adresse?.trim() || null,
    numeroPro: f?.numero_pro?.trim() || null,
    payeur: c.fiche?.display_name?.trim() || null,
    produit: c.title,
    montantCents: c.amount_cents,
    devise: c.currency,
    payeLe: c.paid_at,
    rembourseLe: c.status === 'remboursee' ? c.rembourse_at : null,
    paiementStripe: c.stripe_payment_intent,
  }
}
