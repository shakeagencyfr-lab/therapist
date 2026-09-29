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
 * DEUX SORTES DE RAPPELS, UN SEUL PASSAGE (0055). Les mots du cabinet —
 * écrits à la main, ou par la base pour un rappel qui revient — et le rappel
 * du soir que la personne suivie a choisi. Les deux passent par ici, et les
 * deux arrivent masqués sur l'écran verrouillé tant qu'elle n'a pas choisi
 * de les y lire.
 *
 * UNE SEULE VARIABLE À POSER. La clé publique VAPID se déduit de la privée :
 * on ne demande que `VAPID_PRIVATE_KEY`, et l'on ne risque jamais une paire
 * dépareillée — la faute la plus silencieuse de ce protocole, puisque les
 * services refusent alors tout sans rien dire au navigateur.
 */
import { createECDH } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { SOIR_MASQUE, texteAAfficher, type TexteRappel } from '../src/lib/discretion.js'
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
 *
 * Il reçoit le texte DÉJÀ choisi (`texteAAfficher`) : c'est ce qui s'écrira
 * sur l'écran verrouillé, et rien d'autre ne passe par ici.
 */
export function contenuDuRappel(
  rappel: TexteRappel,
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

/**
 * Un mot réclamé. `masque` vient de 0055 : quand il vaut vrai, la base a
 * déjà remplacé le titre et le texte par les neutres. Absent — une base plus
 * ancienne —, on masque aussi (`texteAAfficher`).
 */
interface Reclame {
  push_id: string
  patient_id: string
  titre: string
  corps: string
  masque?: boolean | null
}

/** Un rappel du soir réclamé (0055) : pour qui, et pour quel jour de Paris. */
interface SoirReclame {
  patient_id: string
  jour: string
  titre: string
  corps: string
  masque?: boolean | null
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
  /** Rappels du soir traités pendant ce passage (0055), et ceux arrivés. */
  soirs: number
  soirsArrives: number
}

/** Au-delà, on rend la main : le passage suivant reprendra le reste. */
const BUDGET_MS = 45_000
/** Envois menés de front : assez pour ne pas traîner, pas assez pour inonder. */
const DE_FRONT = 6
const LOT = 50

/**
 * La fonction demandée n'existe pas dans cette base.
 *
 * Le serveur peut être mis en ligne avant 0055 : les mots doivent alors
 * partir comme avant, et le rappel du soir attendre la migration sans
 * encombrer le journal à chaque minute.
 */
export function fonctionAbsente(erreur: { code?: string | null; message?: string | null }): boolean {
  return erreur.code === 'PGRST202' || erreur.code === '42883' || /could not find the function/i.test(erreur.message ?? '')
}

/** Ce qu'on fait des téléphones d'un lot, une fois les envois faits. */
interface Retours {
  perimes: Set<string>
  livres: Set<string>
}

async function appareilsDe(admin: SupabaseClient, patientes: string[]): Promise<Appareil[]> {
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, patient_id, endpoint, p256dh, auth, chemin')
    .in('patient_id', [...new Set(patientes)])
  if (error) throw new HttpError(502, `Les téléphones inscrits n'ont pas pu être lus : ${error.message}`)
  return ((data ?? []) as Appareil[]).filter((a) => serviceDePushConnu(a.endpoint))
}

/**
 * Pose le même texte sur chacun de ses téléphones, et rend leurs réponses.
 *
 * Le texte arrive déjà passé par `texteAAfficher` : ce qui s'écrit ici est
 * exactement ce que l'écran verrouillé montrera.
 */
async function pousserVers(
  siens: Appareil[],
  texte: TexteRappel,
  etiquette: string,
  envoyer: Envoyeur,
  cles: CleVapid,
  retours: Retours,
): Promise<Reponse[]> {
  return Promise.all(
    siens.map(async (a) => {
      const reponse = lireReponse(await envoyer(a, contenuDuRappel(texte, a.chemin, etiquette), cles))
      if (reponse === 'perime') retours.perimes.add(a.id)
      if (reponse === 'livre') retours.livres.add(a.id)
      return reponse
    }),
  )
}

/** Efface les inscriptions périmées, date les téléphones qui ont reçu. */
async function rangerLesAppareils(
  admin: SupabaseClient,
  retours: Retours,
  bilan: BilanRappels,
  maintenant: () => number,
): Promise<void> {
  if (retours.perimes.size) {
    const { error } = await admin.from('push_subscriptions').delete().in('id', [...retours.perimes])
    if (error) console.error(`[rappels] inscriptions périmées non effacées — ${error.message}`)
    else bilan.appareilsRetires += retours.perimes.size
  }
  if (retours.livres.size) {
    await admin
      .from('push_subscriptions')
      .update({ last_success_at: new Date(maintenant()).toISOString(), failures: 0 })
      .in('id', [...retours.livres])
  }
}

async function parPaquets<T>(elements: T[], traiter: (e: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < elements.length; i += DE_FRONT) {
    await Promise.all(elements.slice(i, i + DE_FRONT).map(traiter))
  }
}

/**
 * Pousse tous les rappels dus : les mots du cabinet, puis les rappels du soir.
 *
 * Réclame par lots, envoie, écrit le statut — et recommence tant qu'il reste
 * du travail et du temps. Une ligne réclamée mais non traitée (serveur
 * tombé en route) est rendue au passage suivant par la base elle-même, cinq
 * minutes plus tard.
 *
 * LE CONTENU MASQUÉ N'ARRIVE PAS ICI. La base rend déjà le texte neutre
 * quand la personne a choisi la discrétion (0055) ; `texteAAfficher` le
 * reprend quand même, et masque ce qu'une base plus ancienne rendrait sans
 * le dire. Aucune ligne de ce passage n'écrit de titre ni de texte au
 * journal : seulement des nombres et les messages d'erreur de la base.
 */
export async function pousserLesRappels(
  admin: SupabaseClient,
  cles: CleVapid,
  envoyer: Envoyeur = envoyerParWebPush,
  maintenant: () => number = Date.now,
): Promise<BilanRappels> {
  const bilan: BilanRappels = {
    reclames: 0,
    envoyes: 0,
    sansAppareil: 0,
    echecs: 0,
    appareilsRetires: 0,
    soirs: 0,
    soirsArrives: 0,
  }
  const debut = maintenant()

  while (maintenant() - debut < BUDGET_MS) {
    const { data: lot, error } = await admin.rpc('rappels_a_pousser', { p_limite: LOT })
    if (error) throw new HttpError(502, `Les rappels dus n'ont pas pu être lus : ${error.message}`)
    const reclames = (lot ?? []) as Reclame[]
    if (!reclames.length) break
    bilan.reclames += reclames.length

    const appareils = await appareilsDe(admin, reclames.map((r) => r.patient_id))
    const retours: Retours = { perimes: new Set(), livres: new Set() }

    await parPaquets(reclames, async (r) => {
      const siens = appareils.filter((a) => a.patient_id === r.patient_id)
      const statut = statutDeLEnvoi(await pousserVers(siens, texteAAfficher(r), r.push_id, envoyer, cles, retours))
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
    })

    await rangerLesAppareils(admin, retours, bilan, maintenant)
    if (reclames.length < LOT) break
  }

  /* LE RAPPEL DU SOIR (0055), dans le même passage et le même budget. Une
     panne ici ne défait pas ce qui précède : les mots sont partis, et le
     soir sera repris au passage suivant. */
  while (maintenant() - debut < BUDGET_MS) {
    const { data: lot, error } = await admin.rpc('rappels_du_soir_a_pousser', { p_limite: LOT })
    if (error) {
      if (!fonctionAbsente(error)) console.error(`[rappels] rappels du soir illisibles — ${error.message}`)
      break
    }
    const soirs = (lot ?? []) as SoirReclame[]
    if (!soirs.length) break
    bilan.soirs += soirs.length

    const appareils = await appareilsDe(admin, soirs.map((s) => s.patient_id))
    const retours: Retours = { perimes: new Set(), livres: new Set() }

    await parPaquets(soirs, async (s) => {
      const siens = appareils.filter((a) => a.patient_id === s.patient_id)
      // Une étiquette par soir : reçu deux fois, le rappel ne s'empile pas.
      const texte = texteAAfficher(s, SOIR_MASQUE)
      const statut = statutDeLEnvoi(await pousserVers(siens, texte, `soir-${s.jour}`, envoyer, cles, retours))
      if (statut === 'envoyee') bilan.soirsArrives += 1

      /* Le jour traité, quoi qu'il soit arrivé : un seul rappel par soir. Un
         échec ne se retente pas à 23 h — la note du soir attendra demain. */
      const { error: e3 } = await admin
        .from('preferences_rappels')
        .update({ soir_envoye_le: s.jour, soir_statut: statut, soir_reclame_le: null })
        .eq('patient_id', s.patient_id)
      if (e3) console.error(`[rappels] soir non noté — ${e3.message}`)
    })

    await rangerLesAppareils(admin, retours, bilan, maintenant)
    if (soirs.length < LOT) break
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
