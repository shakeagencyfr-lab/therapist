/**
 * Les rappels, côté téléphone : autorisation, service worker, inscription.
 *
 * Chaque geste rend un état ET une phrase, parce que chaque issue appelle un
 * mot différent. « Refusé » se répare dans les réglages du téléphone ;
 * « pas encore répondu » se répare en recliquant ; « le serveur n'a pas pu
 * inscrire ce téléphone » se répare en réessayant. Les confondre, c'est
 * envoyer la patiente chercher au mauvais endroit.
 */
import { supabase } from '@/lib/supabase'
import { estInstallee } from './installation'
import {
  cheminDeLEspace,
  cleEnOctets,
  etatDeDepart,
  surIOS,
  type Environnement,
  type EtatRappels,
} from '@/lib/rappels'

export interface Issue {
  etat: EtatRappels
  message: string
}

export function environnement(): Environnement {
  const nav = typeof navigator === 'undefined' ? null : navigator
  const fen = typeof window === 'undefined' ? null : window
  const installee = estInstallee()
  return {
    serviceWorker: Boolean(nav && 'serviceWorker' in nav),
    pushManager: Boolean(fen && 'PushManager' in fen),
    notification: Boolean(fen && 'Notification' in fen),
    permission: fen && 'Notification' in fen ? Notification.permission : null,
    ios: nav ? surIOS(nav.userAgent, nav.platform, nav.maxTouchPoints) : false,
    installee,
  }
}

/**
 * La clé publique du serveur, demandée une fois par page.
 *
 * Demandée dès l'ouverture, pas au moment du geste : si le serveur n'envoie
 * pas de rappels, le bouton ne doit même pas s'afficher. Et au moment du
 * geste, elle est déjà là — Safari n'accorde l'autorisation qu'à une
 * demande qui part directement du toucher.
 */
let cleEnCours: Promise<string | null> | null = null

function cleDuServeur(): Promise<string | null> {
  cleEnCours ??= fetch('/api/push/cle')
    .then(async (reponse) => {
      const lu = (await reponse.json().catch(() => ({}))) as { cle?: string; message?: string }
      if (!reponse.ok || !lu.cle) {
        // Le détail va à la console ; la patiente n'a rien à en faire.
        console.warn('[rappels] clé du serveur indisponible —', lu.message ?? reponse.status)
        return null
      }
      return lu.cle
    })
    .catch(() => null)
    .then((cle) => {
      // Une panne passagère ne doit pas figer la page : on redemandera.
      if (!cle) cleEnCours = null
      return cle
    })
  return cleEnCours
}

async function inscriptionDuNavigateur(): Promise<PushSubscription | null> {
  const enregistrement = await navigator.serviceWorker.getRegistration('/')
  return (await enregistrement?.pushManager.getSubscription()) ?? null
}

/**
 * Où en est ce téléphone, pour la personne connectée.
 *
 * UN TÉLÉPHONE INSCRIT AU NOM D'UNE AUTRE NE RESTE PAS INSCRIT. Si le
 * navigateur porte une inscription que la base ne montre pas à la personne
 * connectée, c'est qu'une autre l'a faite ici et ne s'est pas déconnectée.
 * La garder, c'est laisser arriver SES rappels sur l'écran de quelqu'un
 * d'autre ; la reprendre en silence, c'est abonner la personne présente sans
 * qu'elle l'ait demandé. On la retire, et l'on propose d'activer.
 */
export async function lireEtat(): Promise<EtatRappels> {
  const depart = etatDeDepart(environnement())
  // Ni bouton ni conseil d'installation tant que le serveur n'envoie rien :
  // faire installer l'espace pour des rappels qui ne viendront pas, c'est
  // une promesse de plus qu'on ne tiendrait pas.
  if ((depart === 'inactive' || depart === 'a-installer') && !(await cleDuServeur())) return 'fermee'
  if (depart !== 'inactive') return depart
  const inscription = await inscriptionDuNavigateur()
  if (!inscription) return 'inactive'
  const db = supabase()
  if (!db) return 'inactive'
  const { data, error } = await db
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', inscription.endpoint)
    .maybeSingle()
  // Une panne de lecture ne vaut pas preuve : on ne retire rien sur un doute.
  if (error) return 'inactive'
  if (data) return 'active'
  await inscription.unsubscribe().catch(() => undefined)
  return 'inactive'
}

/** La clé d'une inscription est-elle celle que le serveur signe aujourd'hui ? */
function memeCle(inscription: PushSubscription, cle: Uint8Array): boolean {
  const actuelle = inscription.options.applicationServerKey
  if (!actuelle) return false
  const octets = new Uint8Array(actuelle)
  return octets.length === cle.length && octets.every((o, i) => o === cle[i])
}

/**
 * Activer les rappels sur ce téléphone.
 *
 * L'AUTORISATION D'ABORD, DANS LE GESTE MÊME. Safari ne l'accorde que si la
 * demande part directement du toucher ; attendre autre chose avant — la clé
 * du serveur, le service worker — et la demande est refusée d'office.
 */
export async function activer(patientId: string): Promise<Issue> {
  let permission: NotificationPermission
  try {
    permission = await Notification.requestPermission()
  } catch {
    return { etat: 'indisponible', message: "Ce navigateur ne sait pas demander l'autorisation d'afficher des rappels." }
  }
  if (permission === 'denied') {
    return {
      etat: 'refusee',
      message: 'Les notifications sont bloquées pour cet espace. Autorisez-les dans les réglages de votre téléphone, puis revenez ici.',
    }
  }
  if (permission !== 'granted') {
    return { etat: 'inactive', message: "Vous n'avez pas répondu à la demande : les rappels restent éteints." }
  }

  const db = supabase()
  if (!db) return { etat: 'inactive', message: "L'espace n'est pas relié à sa base." }

  let inscription: PushSubscription | null = null
  try {
    const enregistrement = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready

    const cleBrute = await cleDuServeur()
    if (!cleBrute) {
      return { etat: 'fermee', message: 'Les rappels sur le téléphone ne sont pas encore disponibles. Réessayez plus tard.' }
    }
    const cle = cleEnOctets(cleBrute)

    inscription = await enregistrement.pushManager.getSubscription()
    // Une inscription signée d'une ancienne clé ne recevra plus rien.
    if (inscription && !memeCle(inscription, cle)) {
      await inscription.unsubscribe()
      inscription = null
    }
    inscription ??= await enregistrement.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: cle as BufferSource,
    })
  } catch {
    return {
      etat: 'inactive',
      message: "Le service de notifications de votre téléphone n'a pas répondu. Réessayez dans un instant.",
    }
  }

  const cles = inscription.toJSON().keys ?? {}
  const { data, error } = await db.rpc('enregistrer_appareil', {
    p_patient: patientId,
    p_endpoint: inscription.endpoint,
    p_p256dh: cles.p256dh ?? '',
    p_auth: cles.auth ?? '',
    p_chemin: cheminDeLEspace(window.location.pathname),
    p_user_agent: navigator.userAgent,
  })
  if (error || !data) {
    // Le téléphone croirait recevoir des rappels que le serveur ignore : on
    // défait l'inscription plutôt que de laisser un « activé » mensonger.
    await inscription.unsubscribe().catch(() => undefined)
    return { etat: 'inactive', message: "Ce téléphone n'a pas pu être inscrit. Réessayez dans un instant." }
  }
  return { etat: 'active', message: 'Les rappels de votre thérapeute arriveront sur ce téléphone.' }
}

/**
 * Ne plus recevoir les rappels ici.
 *
 * Le navigateur se désinscrit dans tous les cas : même si l'effacement en
 * base échoue, l'adresse d'envoi meurt avec lui, et le serveur retirera la
 * ligne au premier envoi refusé.
 */
export async function desactiver(): Promise<Issue> {
  const inscription = await inscriptionDuNavigateur().catch(() => null)
  if (!inscription) return { etat: 'inactive', message: 'Ce téléphone ne recevait pas de rappels.' }
  const db = supabase()
  const suppression = db
    ? await db.from('push_subscriptions').delete().eq('endpoint', inscription.endpoint).select('id')
    : null
  await inscription.unsubscribe().catch(() => undefined)
  if (!suppression || suppression.error) {
    return {
      etat: 'inactive',
      message: "Ce téléphone ne recevra plus rien. Son inscription sera effacée d'elle-même au prochain envoi.",
    }
  }
  return { etat: 'inactive', message: 'Les rappels ne viendront plus sur ce téléphone.' }
}

/**
 * À la déconnexion : ce téléphone cesse de recevoir.
 *
 * Une patiente qui se déconnecte d'un téléphone — le sien qu'elle prête, ou
 * celui d'un proche — ne doit plus y voir apparaître ses rappels. Borné à
 * trois secondes : la déconnexion ne doit jamais attendre un réseau lent.
 */
export async function oublierCeTelephone(): Promise<void> {
  if (!environnement().serviceWorker) return
  await Promise.race([
    desactiver().catch(() => undefined),
    new Promise((resoudre) => setTimeout(resoudre, 3_000)),
  ])
}
