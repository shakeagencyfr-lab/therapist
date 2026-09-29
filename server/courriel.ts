/**
 * Les courriels du cabinet, partis de son adresse.
 *
 * C'est la dernière chose qui trahit le fournisseur : une thérapeute peut
 * avoir son domaine, ses couleurs et son logo, si le lien de connexion arrive
 * de « noreply@notre-plateforme », la marque blanche s'arrête là.
 *
 * Trois règles, les mêmes que pour les clés d'intégration :
 *
 *   1. Le serveur SMTP est ÉPROUVÉ avant d'être enregistré — connexion et
 *      authentification réelles. Un mot de passe faux se découvre à la
 *      saisie, pas le jour où un patient attend son lien.
 *   2. Le mot de passe ne REVIENT jamais au navigateur : il dort chiffré
 *      dans `cabinet_secrets` (aucune politique pour le rôle authentifié) et
 *      n'est déchiffré que pour servir un envoi.
 *   3. Sans SMTP configuré, rien ne casse : l'envoi retombe sur le service
 *      de la plateforme, comme avant.
 */
import nodemailer from 'nodemailer'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  adminConfigure,
  clientAdmin,
  exigerCabinet,
  exigerTitulaire,
  identifier,
  identifierPourGesteSensible,
} from './auth.js'
import { droitsDuCabinet, exigerDroit, levierDuCabinet } from './droits.js'
import { lookup } from 'node:dns/promises'
import { HttpError } from './errors.js'
import { AdresseInterne, priveOuLocal as interne, resoudrePublic } from './reseau.js'
import { chiffrementConfigure, chiffrer, dechiffrer } from './secrets.js'

/* ------------------------------------------------------------------ *
 * Ce que l'écran reçoit
 * ------------------------------------------------------------------ */

export interface EtatSmtp {
  /** Le serveur d'envoi, tel qu'il a été saisi. */
  host: string | null
  port: number | null
  user: string | null
  /** L'adresse d'expédition, celle que la destinataire voit. */
  from: string | null
  /* Pas d'empreinte du mot de passe, pas même ses derniers caractères : un
     mot de passe de messagerie n'est pas une clé d'API qu'on reconnaît par sa
     fin, c'est souvent celui de toute la boîte du cabinet. L'écran promet
     qu'il « ne revient jamais à votre navigateur » ; il n'en revient rien.
     Le réglage se reconnaît à son serveur, son identifiant et sa date. */
  setAt: string | null
  /** L'offre du cabinet ouvre-t-elle la marque blanche ? */
  droit: boolean
  offre: string
  /** Le serveur sait-il chiffrer ? Sinon, l'écran le dit avant la saisie. */
  chiffrement: boolean
}

interface SmtpRow {
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_from: string | null
  smtp_set_at: string | null
}

/** Le SMTP prêt à servir, mot de passe déchiffré. Ne quitte pas le serveur. */
export interface SmtpPret {
  host: string
  port: number
  user: string
  pass: string
  from: string
}

/* ------------------------------------------------------------------ *
 * Lecture
 * ------------------------------------------------------------------ */

function admin(): SupabaseClient {
  const client = clientAdmin()
  if (!client || !adminConfigure()) {
    throw new HttpError(
      503,
      "Le serveur n'a pas sa clé de service (SUPABASE_SERVICE_ROLE_KEY) : il ne peut pas enregistrer de réglage d'envoi.",
    )
  }
  return client
}

export async function etatSmtp(token: string | null): Promise<EtatSmtp> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const droits = await droitsDuCabinet(cabinetId, appelant.client)
  const { data, error } = await appelant.client
    .from('cabinet_settings')
    .select('smtp_host, smtp_port, smtp_user, smtp_from, smtp_set_at')
    .eq('cabinet_id', cabinetId)
    .maybeSingle<SmtpRow>()
  if (error) throw new HttpError(502, "Vos réglages d'envoi n'ont pas pu être lus.")

  return {
    host: data?.smtp_host ?? null,
    port: data?.smtp_port ?? null,
    user: data?.smtp_user ?? null,
    from: data?.smtp_from ?? null,
    setAt: data?.smtp_set_at ?? null,
    droit: droits.marqueBlanche,
    offre: droits.offre,
    chiffrement: chiffrementConfigure(),
  }
}

/**
 * Le SMTP d'un cabinet, prêt à servir — ou null s'il n'en a pas.
 *
 * Appelé par le serveur pour lui-même (envoi d'invitation), donc avec la clé
 * de service : le mot de passe est dans une table qu'aucun rôle client ne
 * lit. Le droit, lui, a été vérifié à l'enregistrement ; on le revérifie ici
 * pour qu'un cabinet rétrogradé cesse d'envoyer depuis sa propre adresse
 * sans que personne n'ait à y penser.
 */
export async function smtpDuCabinet(cabinetId: string): Promise<SmtpPret | null> {
  if (!adminConfigure() || !chiffrementConfigure()) return null
  const db = admin()
  const { data } = await db
    .from('cabinet_settings')
    .select('smtp_host, smtp_port, smtp_user, smtp_from, smtp_set_at')
    .eq('cabinet_id', cabinetId)
    .maybeSingle<SmtpRow>()
  if (!data?.smtp_host || !data.smtp_port || !data.smtp_from) return null

  /* Le droit se lit ici avec `levierDuCabinet`, pas avec `cabinet_droits()` :
     cette dernière ne répond qu'à un membre du cabinet ou à son revendeur, et
     c'est le serveur qui demande, sous la clé de service, sans aucun
     `auth.uid()`. Elle rendait donc NULL à tous les coups — et le SMTP du
     cabinet, jamais utilisé, retombait silencieusement sur la plateforme. */
  const ouvert = await levierDuCabinet(cabinetId, 'marqueBlanche', db)
  if (!ouvert) return null

  const { data: secret } = await db
    .from('cabinet_secrets')
    .select('smtp_pass_enc')
    .eq('cabinet_id', cabinetId)
    .maybeSingle<{ smtp_pass_enc: string | null }>()
  if (!secret?.smtp_pass_enc) return null
  try {
    return {
      host: data.smtp_host,
      port: data.smtp_port,
      user: data.smtp_user ?? '',
      pass: dechiffrer(secret.smtp_pass_enc),
      from: data.smtp_from,
    }
  } catch {
    // Un secret illisible (clé changée) ne doit pas empêcher l'envoi : on
    // retombe sur le service de la plateforme.
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Envoi
 * ------------------------------------------------------------------ */

export interface Courriel {
  to: string
  subject: string
  text: string
  html?: string
  /** Le nom affiché de l'expéditeur : celui du cabinet. */
  fromName?: string
  /** Où arrive une réponse : la praticienne, pas l'adresse d'expédition. */
  replyTo?: string
  pieces?: PieceJointe[]
}

export interface PieceJointe {
  nom: string
  contenu: Buffer
  type: string
}

/**
 * Le nom affiché, sans ce qui ferait sortir de l'en-tête : guillemets,
 * chevrons, retours à la ligne. Le nom d'un cabinet est saisi par lui.
 */
export function nomAffiche(nom: string): string {
  return nom.replace(/["<>\r\n\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

function expediteurNomme(nom: string | undefined, adresse: string): string {
  const propre = nom ? nomAffiche(nom) : ''
  return propre ? `"${propre}" <${adresse}>` : adresse
}

/**
 * Le transport, avec des délais courts.
 *
 * Par défaut, nodemailer attend deux minutes avant d'abandonner une
 * connexion. L'hébergeur, lui, coupe la fonction à soixante secondes : la
 * thérapeute n'aurait jamais le message d'erreur, seulement une page qui
 * tourne puis une panne sans explication. Dix secondes suffisent à savoir si
 * un serveur d'envoi répond.
 */
async function transport(smtp: SmtpPret) {
  /* L'ADRESSE EST ÉPINGLÉE. Le nom avait été vérifié à l'enregistrement,
     puis nodemailer le résolvait de nouveau à chaque envoi : un nom public
     à l'enregistrement pouvait pointer vers 127.0.0.1 le lendemain (pentest
     P7). On résout ici, on refuse l'interne, et c'est l'adresse vérifiée
     qu'on joint ; le certificat, lui, est vérifié contre le nom. */
  if (!PORTS_SMTP.has(smtp.port)) throw new HttpError(400, MESSAGE_PORT)
  let ip: string
  try {
    ip = await resoudrePublic(smtp.host)
  } catch (err) {
    if (err instanceof AdresseInterne) console.error(`[courriel] hôte refusé — ${smtp.host} résout vers une adresse interne`)
    throw new HttpError(400, "Ce serveur d'envoi est introuvable : vérifiez son nom auprès de votre hébergeur de messagerie.")
  }
  return nodemailer.createTransport({
    host: ip,
    port: smtp.port,
    // 465 est le port du TLS implicite ; 587, 25 et 2525 montent en STARTTLS.
    secure: smtp.port === 465,
    tls: { servername: smtp.host },
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
}

/**
 * Les ports d'un serveur d'envoi, et eux seuls : 25, 465 (SSL), 587
 * (STARTTLS), 2525 (le 587 de secours de certains hébergeurs). Tout autre
 * port ne sert pas un SMTP — il sert à balayer une machine (pentest P7).
 */
export const PORTS_SMTP = new Set([25, 465, 587, 2525])
const MESSAGE_PORT = 'Le port doit être celui de votre serveur d’envoi : 465 en SSL, 587 en STARTTLS (ou 25, 2525).'

/**
 * Envoyer un courriel depuis l'adresse du cabinet.
 *
 * Rend false quand le cabinet n'a pas de SMTP : l'appelant retombe alors sur
 * le service de la plateforme. Une erreur d'envoi, en revanche, est une
 * erreur — on ne la maquille pas en succès.
 */
export async function envoyerParCabinet(cabinetId: string, courriel: Courriel): Promise<boolean> {
  const smtp = await smtpDuCabinet(cabinetId)
  if (!smtp) return false
  try {
    await (await transport(smtp)).sendMail({
      from: expediteurNomme(courriel.fromName, smtp.from),
      to: courriel.to,
      replyTo: courriel.replyTo,
      subject: courriel.subject,
      text: courriel.text,
      html: courriel.html,
      attachments: courriel.pieces?.map((p) => ({ filename: p.nom, content: p.contenu, contentType: p.type })),
    })
    return true
  } catch (err) {
    if (err instanceof HttpError) throw err
    // Journal technique seulement : ni mot de passe, ni contenu de dossier.
    console.error(`[courriel] cabinet ${cabinetId} — ${(err as Error).message}`)
    throw new HttpError(502, "Le courriel n'a pas pu être envoyé depuis votre serveur d'envoi.")
  }
}

/* ------------------------------------------------------------------ *
 * Envoi par la plateforme
 * ------------------------------------------------------------------ */

/**
 * L'adresse d'expédition de la plateforme, fixée côté serveur.
 *
 * `COURRIEL_EXPEDITEUR` si elle est posée, sinon `notes@` le domaine de
 * `PUBLIC_SITE_URL` — le domaine vérifié chez le service d'envoi. Jamais
 * reçue du navigateur.
 */
export function expediteurPlateforme(): string | null {
  const choisie = process.env.COURRIEL_EXPEDITEUR?.trim()
  if (choisie) return adresseValide(choisie) ? choisie : null
  try {
    const hote = new URL(process.env.PUBLIC_SITE_URL ?? '').hostname
    return hote.includes('.') ? `notes@${hote}` : null
  } catch {
    return null
  }
}

/** La plateforme sait-elle envoyer ? Il lui faut sa clé et son adresse. */
export function plateformeConfiguree(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim()) && Boolean(expediteurPlateforme())
}

export const ENVOI_HORS_SERVICE = "L'envoi par courriel n'est pas encore en service : téléchargez la note et remettez-la vous-même."

/**
 * Envoyer un courriel depuis l'adresse de la plateforme (Resend).
 *
 * L'adresse de l'API est fixe : rien de ce que le cabinet saisit ne décide
 * où le serveur se connecte. La clé ne sort que dans l'en-tête de cette
 * requête ; le journal ne garde que le statut et le nom de l'erreur.
 */
export async function envoyerParPlateforme(courriel: Courriel, idempotence?: string): Promise<void> {
  const cle = process.env.RESEND_API_KEY?.trim()
  const adresse = expediteurPlateforme()
  if (!cle || !adresse) throw new HttpError(503, ENVOI_HORS_SERVICE)
  let reponse: Response
  try {
    reponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cle}`,
        'Content-Type': 'application/json',
        ...(idempotence ? { 'Idempotency-Key': idempotence } : {}),
      },
      body: JSON.stringify({
        from: expediteurNomme(courriel.fromName, adresse),
        to: [courriel.to],
        reply_to: courriel.replyTo ? [courriel.replyTo] : undefined,
        subject: courriel.subject,
        text: courriel.text,
        html: courriel.html,
        // Le type se déduit de l'extension du nom : « .pdf ».
        attachments: courriel.pieces?.map((p) => ({ filename: p.nom, content: p.contenu.toString('base64') })),
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    console.error(`[courriel] plateforme — ${(err as Error).name}`)
    throw new HttpError(502, "Le service d'envoi ne répond pas. Réessayez dans un instant.")
  }
  if (reponse.ok) return
  const corps = (await reponse.json().catch(() => ({}))) as { name?: string }
  console.error(`[courriel] plateforme — ${reponse.status} ${corps.name ?? ''}`.trim())
  if (reponse.status === 429) {
    throw new HttpError(429, "Trop de courriels sont partis ces dernières minutes. Réessayez dans un instant.")
  }
  throw new HttpError(502, "Le courriel n'a pas pu être envoyé. Réessayez dans un instant.")
}

/* ------------------------------------------------------------------ *
 * Écriture
 * ------------------------------------------------------------------ */

export interface SmtpBody {
  host?: string
  port?: number | string
  user?: string
  pass?: string
  from?: string
}

/** Le motif technique va au journal ; l'écran reçoit une phrase française. */
function enregistrementImpossible(cause: string): HttpError {
  console.error(`[courriel] enregistrement — ${cause}`)
  return new HttpError(502, "Vos réglages d'envoi n'ont pas pu être enregistrés. Réessayez dans un instant.")
}

function adresseValide(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

/**
 * L'hôte est-il un vrai nom de domaine, et mène-t-il dehors ?
 *
 * `eprouver()` ouvre une VRAIE connexion TCP vers ce que la thérapeute écrit,
 * depuis notre serveur, et trie l'échec en trois messages distincts. Sur un
 * nom public, ce n'est qu'une aide au réglage : n'importe qui peut sonder
 * smtp.free.fr depuis sa propre machine. Sur `127.0.0.1`, `10.0.0.5` ou
 * `169.254.169.254`, cela devient un scanner de ports pointé sur NOTRE
 * infrastructure, et sur celle de l'hébergeur — l'adresse lien-local est
 * l'endroit exact où les fournisseurs de nuage servent les jetons d'instance.
 *
 * Deux barrières, parce qu'une seule ne suffit pas. La forme d'abord : un TLD
 * alphabétique écarte toutes les adresses IPv4 littérales, que la précédente
 * expression acceptait — les chiffres sont dans [a-z0-9]. La résolution
 * ensuite : un nom public peut parfaitement pointer sur 127.0.0.1, et c'est
 * même la manière habituelle de contourner un filtre qui ne regarde que la
 * chaîne.
 */
export { priveOuLocal } from './reseau.js'

async function exigerHotePublic(host: string): Promise<void> {
  const refus = new HttpError(
    400,
    "Ce serveur d'envoi n'est pas valide. Entrez le nom que vous a donné votre hébergeur de messagerie, par exemple smtp.votre-hebergeur.fr.",
  )
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(host)) {
    throw refus
  }
  let adresses: Array<{ address: string }>
  try {
    adresses = await lookup(host, { all: true })
  } catch {
    throw new HttpError(400, "Ce serveur d'envoi est introuvable : vérifiez son nom auprès de votre hébergeur de messagerie.")
  }
  if (!adresses.length || adresses.some((a) => interne(a.address))) {
    /* Le motif reste au journal : le dire à l'écran apprendrait à l'appelant
       ce qu'il cherchait précisément à savoir. */
    console.error(`[courriel] hôte refusé — ${host} résout vers une adresse interne`)
    throw refus
  }
}

/**
 * Éprouve le SMTP par une vraie connexion.
 *
 * `verify()` ouvre la connexion, monte le TLS et s'authentifie sans rien
 * envoyer. C'est exactement ce qu'on veut vérifier — et le seul moyen de
 * distinguer « mot de passe faux » de « port fermé ».
 */
async function eprouver(smtp: SmtpPret): Promise<void> {
  try {
    await (await transport(smtp)).verify()
  } catch (err) {
    if (err instanceof HttpError) throw err
    const message = (err as Error).message ?? ''
    if (/auth|credential|535|534|password/i.test(message)) {
      throw new HttpError(400, "Votre serveur refuse cet identifiant ou ce mot de passe. Vérifiez-les auprès de votre hébergeur de messagerie.")
    }
    if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(message)) {
      throw new HttpError(400, `Ce serveur d'envoi est injoignable sur le port ${smtp.port}. Vérifiez le nom du serveur et le port (465 en SSL, 587 en STARTTLS).`)
    }
    if (/certificate|self.signed|SSL|TLS/i.test(message)) {
      throw new HttpError(400, "Le certificat de ce serveur d'envoi n'est pas valide. Essayez le port 587, ou corrigez le nom du serveur.")
    }
    /* Le message de nodemailer est en anglais et parle de sockets : on le
       garde pour le journal, pas pour l'écran. */
    console.error(`[courriel] vérification — ${message}`)
    throw new HttpError(
      400,
      "Ce serveur d'envoi n'a pas répondu comme attendu. Vérifiez le nom du serveur, le port et l'identifiant auprès de votre hébergeur de messagerie.",
    )
  }
}

/** Enregistre le SMTP du cabinet, une fois éprouvé. */
export async function reglerSmtp(token: string | null, raw: unknown): Promise<EtatSmtp> {
  // Un mot de passe d'envoi posé : en « aal2 » pour un compte protégé.
  const appelant = await identifierPourGesteSensible(token)
  const cabinetId = exigerCabinet(appelant)
  /* Les liens d'ouverture de compte des patients partent par ce serveur :
     le régler est au titulaire seul (pentest P1). */
  await exigerTitulaire(appelant, cabinetId, 'Le serveur d’envoi')
  const droits = await droitsDuCabinet(cabinetId, appelant.client)
  exigerDroit(droits, 'marqueBlanche')
  if (!chiffrementConfigure()) chiffrer('') // lève le 503 explicite

  const body = (raw && typeof raw === 'object' ? raw : {}) as SmtpBody
  const host = String(body.host ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, '')
  const port = Number(body.port ?? 0)
  const user = String(body.user ?? '').trim()
  const from = String(body.from ?? '').trim().toLowerCase()
  const pass = String(body.pass ?? '')

  await exigerHotePublic(host)
  if (!PORTS_SMTP.has(port)) throw new HttpError(400, MESSAGE_PORT)
  if (!adresseValide(from)) {
    throw new HttpError(400, "L'adresse d'expédition n'est pas une adresse électronique.")
  }
  if (!pass) {
    throw new HttpError(400, "Entrez le mot de passe de ce compte d'envoi.")
  }

  await eprouver({ host, port, user, pass, from })

  const db = admin()
  const maintenant = new Date().toISOString()
  const { error: e1 } = await db.from('cabinet_settings').upsert(
    {
      cabinet_id: cabinetId,
      smtp_host: host,
      smtp_port: port,
      smtp_user: user || null,
      smtp_from: from,
      smtp_set_at: maintenant,
      updated_at: maintenant,
    },
    { onConflict: 'cabinet_id' },
  )
  if (e1) throw enregistrementImpossible(e1.message)
  const { error: e2 } = await db
    .from('cabinet_secrets')
    .upsert({ cabinet_id: cabinetId, smtp_pass_enc: chiffrer(pass), updated_at: maintenant }, { onConflict: 'cabinet_id' })
  if (e2) throw enregistrementImpossible(e2.message)

  await db.from('audit_log').insert({
    cabinet_id: cabinetId,
    actor_user_id: appelant.userId,
    action: 'smtp.pose',
    target_table: 'cabinet_settings',
    target_id: cabinetId,
  })

  return etatSmtp(token)
}

/** Retire le SMTP : les courriels repartent du service de la plateforme. */
export async function retirerSmtp(token: string | null): Promise<EtatSmtp> {
  const appelant = await identifierPourGesteSensible(token)
  const cabinetId = exigerCabinet(appelant)
  await exigerTitulaire(appelant, cabinetId, 'Le serveur d’envoi')
  const db = admin()
  const maintenant = new Date().toISOString()
  const { error } = await db
    .from('cabinet_settings')
    .update({
      smtp_host: null,
      smtp_port: null,
      smtp_user: null,
      smtp_from: null,
      smtp_set_at: null,
      updated_at: maintenant,
    })
    .eq('cabinet_id', cabinetId)
  if (error) throw new HttpError(502, "Le réglage d'envoi n'a pas pu être retiré.")
  await db
    .from('cabinet_secrets')
    .update({ smtp_pass_enc: null, updated_at: maintenant })
    .eq('cabinet_id', cabinetId)
  await db.from('audit_log').insert({
    cabinet_id: cabinetId,
    actor_user_id: appelant.userId,
    action: 'smtp.retire',
    target_table: 'cabinet_settings',
    target_id: cabinetId,
  })
  return etatSmtp(token)
}

/**
 * Pourquoi un envoi a échoué, dit à la thérapeute.
 *
 * La vérification de l'enregistrement ne prouve qu'une chose : le serveur
 * accepte l'identifiant. Elle ne prouve pas qu'il acceptera d'ENVOYER depuis
 * l'adresse d'expédition saisie — beaucoup d'hébergeurs refusent une adresse
 * qui n'est pas celle du compte, et c'est précisément ce que le courriel
 * d'essai fait apparaître. Le motif de nodemailer est en anglais et
 * technique : il va au journal, l'écran reçoit une phrase.
 */
export function motifEnvoi(message: string, from: string, port: number): string {
  /* L'adresse refusée d'abord : son message parle souvent d'« authenticated
     user », et se lirait sinon comme un mot de passe faux. */
  if (/\b(553|550|551|554)\b|sender|from address|not owned|relay|rejected/i.test(message)) {
    return `Votre serveur d'envoi refuse d'envoyer depuis ${from}. L'adresse d'expédition doit être celle du compte, ou un alias autorisé chez votre hébergeur de messagerie.`
  }
  if (/\b(535|534)\b|auth|credential|password/i.test(message)) {
    return "Votre serveur d'envoi refuse maintenant l'identifiant ou le mot de passe : il a peut-être été changé chez votre hébergeur de messagerie. Remplacez le réglage."
  }
  if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET/i.test(message)) {
    return `Votre serveur d'envoi ne répond pas sur le port ${port}. Réessayez dans un instant ; si cela persiste, vérifiez le serveur et le port.`
  }
  return "Le courriel d'essai n'a pas pu partir de votre serveur d'envoi. Vérifiez vos réglages auprès de votre hébergeur de messagerie."
}

/**
 * Envoyer un courriel d'essai, depuis le serveur d'envoi du cabinet.
 *
 * À l'adresse du compte connecté, et à AUCUNE autre : un champ « destinataire »
 * ferait de ce bouton un relais d'envoi vers n'importe qui, depuis la
 * messagerie du cabinet. La thérapeute voit ainsi arriver chez elle ce que
 * ses patients recevront — l'expéditeur, le nom du cabinet — et découvre ici,
 * pas le jour d'une invitation, qu'un hébergeur refuse l'adresse d'expédition.
 *
 * Aucune mention du fournisseur dans le message : c'est un courriel de la
 * marque blanche.
 */
export async function essayerSmtp(token: string | null): Promise<{ ok: true; message: string }> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const droits = await droitsDuCabinet(cabinetId, appelant.client)
  exigerDroit(droits, 'marqueBlanche')
  const destinataire = appelant.email?.trim()
  if (!destinataire) {
    throw new HttpError(400, "Votre compte n'a pas d'adresse électronique où recevoir l'essai.")
  }

  const smtp = await smtpDuCabinet(cabinetId)
  if (!smtp) {
    throw new HttpError(400, "Aucun serveur d'envoi n'est réglé pour votre cabinet : enregistrez-le d'abord.")
  }
  const { data: fiche } = await appelant.client
    .from('cabinets')
    .select('name')
    .eq('id', cabinetId)
    .maybeSingle<{ name: string }>()
  const cabinet = fiche?.name ?? 'Votre cabinet'

  try {
    await (await transport(smtp)).sendMail({
      from: `"${cabinet.replace(/"/g, '')}" <${smtp.from}>`,
      to: destinataire,
      subject: `Courriel d'essai — ${cabinet}`,
      text: [
        'Bonjour,',
        '',
        `Ce courriel d'essai est parti de ${smtp.from}, par le serveur d'envoi de votre cabinet.`,
        "Les invitations que vous envoyez à vos patients partiront de la même adresse, sous le même nom.",
        '',
        `— ${cabinet}`,
      ].join('\n'),
    })
  } catch (err) {
    if (err instanceof HttpError) throw err
    // Journal technique seulement : ni mot de passe, ni adresse de patient.
    console.error(`[courriel] essai cabinet ${cabinetId} — ${(err as Error).message}`)
    throw new HttpError(502, motifEnvoi((err as Error).message ?? '', smtp.from, smtp.port))
  }

  return {
    ok: true,
    message: `Courriel d'essai envoyé à ${destinataire}, depuis ${smtp.from}. S'il n'arrive pas d'ici quelques minutes, regardez dans les indésirables.`,
  }
}
