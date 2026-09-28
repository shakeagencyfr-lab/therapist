/**
 * Les rappels, jusqu'au téléphone.
 *
 * La thérapeute programme un rappel ; à l'heure dite, la base le voit dû et
 * réveille ce serveur (0040, `declencher_rappels()`). Ici, on réclame les
 * envois dus, on les pousse vers chaque téléphone inscrit, et l'on écrit ce
 * qui s'est passé — pour que l'écran de la thérapeute dise la vérité : parti,
 * aucun téléphone, échec.
 *
 * LE PROTOCOLE. Web Push (RFC 8030) : le navigateur de la patiente donne une
 * adresse chez le service de son fabricant — Google, Apple, Mozilla,
 * Microsoft — et deux clés. On chiffre le message pour ce navigateur seul
 * (RFC 8291), on le signe de notre clé VAPID (RFC 8292) et on le dépose à
 * cette adresse. Le fabricant ne lit pas le contenu : il le porte.
 *
 * UNE SEULE VARIABLE À POSER. La clé publique VAPID se déduit de la privée :
 * on ne demande que `VAPID_PRIVATE_KEY`, et l'on ne risque jamais une paire
 * dépareillée — la faute la plus silencieuse de ce protocole, puisque les
 * services refusent alors tout sans rien dire au navigateur.
 */
import { createECDH } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { clientAdmin } from './auth.js'
import { HttpError } from './errors.js'

/* ------------------------------------------------------------------ *
 * Les clés
 * ------------------------------------------------------------------ */

export interface CleVapid {
  publique: string
  privee: string
  sujet: string
}

/**
 * La clé publique, déduite de la privée.
 *
 * La privée est un scalaire P-256 de 32 octets en base64url — le format que
 * rend `web-push generate-vapid-keys`. Rien d'autre n'est accepté : une clé
 * mal collée doit se voir ici, pas dans le silence des services d'envoi.
 */
export function clePubliqueDe(privee: string): string | null {
  const brute = privee.trim()
  if (!/^[A-Za-z0-9_-]{43}$/.test(brute)) return null
  try {
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(brute, 'base64url'))
    return ecdh.getPublicKey().toString('base64url')
  } catch {
    return null
  }
}

/**
 * Le contact que les services d'envoi joignent en cas d'abus.
 *
 * Une adresse du site, par défaut : elle est publique et la nôtre. Un
 * courriel ne s'invente pas — il s'expose à chaque fabricant de téléphone —
 * donc il ne vient que d'une variable posée exprès.
 */
function sujetVapid(): string {
  const brut = (process.env.VAPID_SUBJECT ?? '').trim()
  if (/^(mailto:[^@\s]+@[^@\s]+|https:\/\/\S+)$/.test(brut)) return brut
  return 'https://klaroweb.site'
}

/** Les clés du serveur, ou rien si elles ne sont pas posées. */
export function clesVapid(): CleVapid | null {
  const privee = (process.env.VAPID_PRIVATE_KEY ?? '').trim()
  if (!privee) return null
  const publique = clePubliqueDe(privee)
  if (!publique) return null
  return { publique, privee, sujet: sujetVapid() }
}

/** La clé publique, pour le navigateur qui s'inscrit. */
export function clePubliqueDuServeur(): string {
  const cles = clesVapid()
  if (!cles) {
    throw new HttpError(
      503,
      "Les rappels sur le téléphone ne sont pas encore activés sur ce serveur (VAPID_PRIVATE_KEY).",
    )
  }
  return cles.publique
}

/* ------------------------------------------------------------------ *
 * Ce qui part
 * ------------------------------------------------------------------ */

/**
 * Les services qui livrent réellement les notifications.
 *
 * La même liste que la contrainte de 0040. Doublée ici parce que c'est CE
 * serveur qui poste à ces adresses : une ligne glissée en base sans passer
 * par la fonction d'inscription ne doit pas en faire un relais.
 */
const SERVICES = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//

export function serviceDePushConnu(endpoint: string): boolean {
  return SERVICES.test(endpoint)
}

/** Le chemin à rouvrir, tenu à la forme que 0040 accepte. */
function cheminSur(chemin: string | null | undefined): string {
  return chemin && /^\/([a-z0-9][a-z0-9-]{0,62}\/)?mon\/?$/.test(chemin) ? chemin : '/mon'
}

/** Coupe sans casser un mot en deux, ni une lettre accentuée. */
function couper(texte: string, max: number): string {
  const propre = texte.replace(/\s+/g, ' ').trim()
  if (propre.length <= max) return propre
  const coupe = Array.from(propre).slice(0, max - 1).join('')
  const espace = coupe.lastIndexOf(' ')
  return `${(espace > max * 0.6 ? coupe.slice(0, espace) : coupe).trimEnd()}…`
}

/**
 * Le message tel qu'il part vers un téléphone.
 *
 * Borné : un service d'envoi refuse au-delà de 4 Ko chiffrés, et un écran
 * verrouillé n'affiche de toute façon que les premières lignes. Le texte
 * entier reste dans l'espace de la patiente.
 */
export function contenuDuRappel(
  rappel: { titre: string; corps: string },
  chemin: string | null | undefined,
  pushId: string,
): string {
  return JSON.stringify({
    titre: couper(rappel.titre || 'Un mot de votre thérapeute', 80),
    corps: couper(rappel.corps, 600),
    url: cheminSur(chemin),
    // Deux rappels identiques ne s'empilent pas : le second remplace.
    etiquette: pushId,
  })
}

/* ------------------------------------------------------------------ *
 * Ce qui revient
 * ------------------------------------------------------------------ */

/**
 * Ce qu'un téléphone a répondu.
 *
 *   livre   le service a pris le message (201, parfois 200 ou 202) ;
 *   perime  l'inscription n'existe plus (404, 410) : la patiente a retiré
 *           l'autorisation, désinstallé l'espace, ou changé de téléphone.
 *           On l'efface — la garder, c'est échouer à chaque rappel ;
 *   echec   le reste : service indisponible, refus de la signature…
 */
export type Reponse = 'livre' | 'perime' | 'echec'

export function lireReponse(code: number): Reponse {
  if (code >= 200 && code < 300) return 'livre'
  if (code === 404 || code === 410) return 'perime'
  return 'echec'
}

export type StatutEnvoi = 'envoyee' | 'sans_appareil' | 'echec'

/**
 * Ce qu'on écrira pour la thérapeute.
 *
 * Un seul téléphone qui reçoit suffit : le rappel est arrivé. Aucun
 * téléphone inscrit n'est PAS un échec — c'est une patiente qui n'a pas
 * activé les rappels, et l'écran doit le dire autrement, puisque la
 * thérapeute peut y remédier en séance.
 */
export function statutDeLEnvoi(reponses: Reponse[]): StatutEnvoi {
  if (reponses.length === 0) return 'sans_appareil'
  return reponses.includes('livre') ? 'envoyee' : 'echec'
}

/* ------------------------------------------------------------------ *
 * Le passage
 * ------------------------------------------------------------------ */

export interface Appareil {
  id: string
  patient_id: string
  endpoint: string
  p256dh: string
  auth: string
  chemin: string | null
}

interface Reclame {
  push_id: string
  patient_id: string
  titre: string
  corps: string
}

/** Pose un message chez un service d'envoi et rend son code d'état. */
export type Envoyeur = (appareil: Appareil, contenu: string, cles: CleVapid) => Promise<number>

/**
 * L'envoyeur réel.
 *
 * TTL de deux heures : un téléphone éteint à 20 h et rallumé à 21 h 30
 * reçoit encore son rappel ; rallumé le lendemain, non — la même fenêtre que
 * celle au-delà de laquelle la base marque un rappel expiré.
 */
export const envoyerParWebPush: Envoyeur = async (appareil, contenu, cles) => {
  try {
    const r = await webpush.sendNotification(
      { endpoint: appareil.endpoint, keys: { p256dh: appareil.p256dh, auth: appareil.auth } },
      contenu,
      {
        vapidDetails: { subject: cles.sujet, publicKey: cles.publique, privateKey: cles.privee },
        TTL: 2 * 3600,
        urgency: 'high',
        timeout: 8_000,
      },
    )
    return r.statusCode
  } catch (err) {
    return (err as { statusCode?: number }).statusCode ?? 0
  }
}

export interface BilanRappels {
  /** Envois réclamés pendant ce passage. */
  reclames: number
  envoyes: number
  sansAppareil: number
  echecs: number
  /** Inscriptions effacées parce que le téléphone ne les connaît plus. */
  appareilsRetires: number
}

/** Au-delà, on rend la main : le passage suivant reprendra le reste. */
const BUDGET_MS = 45_000
/** Envois menés de front : assez pour ne pas traîner, pas assez pour inonder. */
const DE_FRONT = 6
const LOT = 50

/**
 * Pousse tous les rappels dus.
 *
 * Réclame par lots, envoie, écrit le statut — et recommence tant qu'il reste
 * du travail et du temps. Une ligne réclamée mais non traitée (serveur
 * tombé en route) est rendue au passage suivant par la base elle-même, cinq
 * minutes plus tard.
 */
export async function pousserLesRappels(
  admin: SupabaseClient,
  cles: CleVapid,
  envoyer: Envoyeur = envoyerParWebPush,
  maintenant: () => number = Date.now,
): Promise<BilanRappels> {
  const bilan: BilanRappels = { reclames: 0, envoyes: 0, sansAppareil: 0, echecs: 0, appareilsRetires: 0 }
  const debut = maintenant()

  while (maintenant() - debut < BUDGET_MS) {
    const { data: lot, error } = await admin.rpc('rappels_a_pousser', { p_limite: LOT })
    if (error) throw new HttpError(502, `Les rappels dus n'ont pas pu être lus : ${error.message}`)
    const reclames = (lot ?? []) as Reclame[]
    if (!reclames.length) break
    bilan.reclames += reclames.length

    const patientes = [...new Set(reclames.map((r) => r.patient_id))]
    const { data: lus, error: e2 } = await admin
      .from('push_subscriptions')
      .select('id, patient_id, endpoint, p256dh, auth, chemin')
      .in('patient_id', patientes)
    if (e2) throw new HttpError(502, `Les téléphones inscrits n'ont pas pu être lus : ${e2.message}`)
    const appareils = ((lus ?? []) as Appareil[]).filter((a) => serviceDePushConnu(a.endpoint))

    const perimes = new Set<string>()
    const livres = new Set<string>()

    const traiter = async (r: Reclame) => {
      const siens = appareils.filter((a) => a.patient_id === r.patient_id)
      const reponses = await Promise.all(
        siens.map(async (a) => {
          const reponse = lireReponse(await envoyer(a, contenuDuRappel(r, a.chemin, r.push_id), cles))
          if (reponse === 'perime') perimes.add(a.id)
          if (reponse === 'livre') livres.add(a.id)
          return reponse
        }),
      )
      const statut = statutDeLEnvoi(reponses)
      if (statut === 'envoyee') bilan.envoyes += 1
      else if (statut === 'sans_appareil') bilan.sansAppareil += 1
      else bilan.echecs += 1

      const { error: e3 } = await admin
        .from('push_recipients')
        .update({ push_status: statut, pushed_at: new Date(maintenant()).toISOString() })
        .eq('push_id', r.push_id)
        .eq('patient_id', r.patient_id)
      // Le rappel est parti ; seul son compte rendu manque. Le passage
      // suivant le reprendra dans cinq minutes — un doublon plutôt qu'un
      // statut faux.
      if (e3) console.error(`[rappels] statut non écrit — ${e3.message}`)
    }

    for (let i = 0; i < reclames.length; i += DE_FRONT) {
      await Promise.all(reclames.slice(i, i + DE_FRONT).map(traiter))
    }

    if (perimes.size) {
      const { error: e4 } = await admin.from('push_subscriptions').delete().in('id', [...perimes])
      if (e4) console.error(`[rappels] inscriptions périmées non effacées — ${e4.message}`)
      else bilan.appareilsRetires += perimes.size
    }
    if (livres.size) {
      await admin
        .from('push_subscriptions')
        .update({ last_success_at: new Date(maintenant()).toISOString(), failures: 0 })
        .in('id', [...livres])
    }

    if (reclames.length < LOT) break
  }

  return bilan
}

/** Le passage, tel que la route planifiée l'appelle. */
export async function pousserLesRappelsDus(): Promise<BilanRappels> {
  const cles = clesVapid()
  if (!cles) {
    throw new HttpError(503, "VAPID_PRIVATE_KEY n'est pas posée : aucun rappel ne peut partir.")
  }
  const client = clientAdmin()
  if (!client) {
    throw new HttpError(503, "Le serveur n'a pas sa clé de service : il ne peut pas lire les rappels dus.")
  }
  const admin: SupabaseClient = client
  return pousserLesRappels(admin, cles)
}
