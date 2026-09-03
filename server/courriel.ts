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
 *      saisie, pas le jour où une patiente attend son lien.
 *   2. Le mot de passe ne REVIENT jamais au navigateur : il dort chiffré
 *      dans `cabinet_secrets` (aucune politique pour le rôle authentifié) et
 *      n'est déchiffré que pour servir un envoi.
 *   3. Sans SMTP configuré, rien ne casse : l'envoi retombe sur le service
 *      de la plateforme, comme avant.
 */
import nodemailer from 'nodemailer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminConfigure, clientAdmin, exigerCabinet, identifier } from './auth.js'
import { droitsDuCabinet, exigerDroit, levierDuCabinet } from './droits.js'
import { HttpError } from './errors.js'
import { chiffrementConfigure, chiffrer, dechiffrer, empreinte } from './secrets.js'

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
  /** « …AB12 » : de quoi reconnaître le mot de passe sans le rendre. */
  hint: string | null
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

  /* L'empreinte du mot de passe est lue avec la clé de service : la table des
     secrets n'a aucune politique pour le rôle authentifié, et c'est voulu. On
     n'en tire que les quatre derniers caractères. */
  let hint: string | null = null
  if (data?.smtp_set_at && adminConfigure()) {
    const { data: secret } = await admin()
      .from('cabinet_secrets')
      .select('smtp_pass_enc')
      .eq('cabinet_id', cabinetId)
      .maybeSingle<{ smtp_pass_enc: string | null }>()
    if (secret?.smtp_pass_enc) {
      try {
        hint = empreinte(dechiffrer(secret.smtp_pass_enc))
      } catch {
        hint = '…'
      }
    }
  }

  return {
    host: data?.smtp_host ?? null,
    port: data?.smtp_port ?? null,
    user: data?.smtp_user ?? null,
    from: data?.smtp_from ?? null,
    hint,
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
function transport(smtp: SmtpPret) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    // 465 est le port du TLS implicite ; 587 et 25 montent en STARTTLS.
    secure: smtp.port === 465,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
}

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
  const expediteur = courriel.fromName ? `"${courriel.fromName.replace(/"/g, '')}" <${smtp.from}>` : smtp.from
  try {
    await transport(smtp).sendMail({
      from: expediteur,
      to: courriel.to,
      subject: courriel.subject,
      text: courriel.text,
      html: courriel.html,
    })
    return true
  } catch (err) {
    // Journal technique seulement : ni mot de passe, ni contenu de dossier.
    console.error(`[courriel] cabinet ${cabinetId} — ${(err as Error).message}`)
    throw new HttpError(502, "Le courriel n'a pas pu être envoyé depuis votre serveur d'envoi.")
  }
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
 * Éprouve le SMTP par une vraie connexion.
 *
 * `verify()` ouvre la connexion, monte le TLS et s'authentifie sans rien
 * envoyer. C'est exactement ce qu'on veut vérifier — et le seul moyen de
 * distinguer « mot de passe faux » de « port fermé ».
 */
async function eprouver(smtp: SmtpPret): Promise<void> {
  try {
    await transport(smtp).verify()
  } catch (err) {
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
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const droits = await droitsDuCabinet(cabinetId, appelant.client)
  exigerDroit(droits, 'marqueBlanche')
  if (!chiffrementConfigure()) chiffrer('') // lève le 503 explicite

  const body = (raw && typeof raw === 'object' ? raw : {}) as SmtpBody
  const host = String(body.host ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, '')
  const port = Number(body.port ?? 0)
  const user = String(body.user ?? '').trim()
  const from = String(body.from ?? '').trim().toLowerCase()
  const pass = String(body.pass ?? '')

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    throw new HttpError(400, "Le serveur d'envoi n'est pas valide. Entrez par exemple smtp.votre-hebergeur.fr.")
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new HttpError(400, 'Le port doit être un nombre — 465 en SSL, 587 en STARTTLS.')
  }
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
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
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
