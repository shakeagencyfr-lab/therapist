/**
 * Les rappels sur le téléphone, vus du navigateur — la part qui se raisonne
 * sans navigateur.
 *
 * Ce qui touche vraiment au téléphone (autorisation, service worker,
 * inscription) vit dans src/patient/rappelsNavigateur.ts. Ici, seulement ce
 * qui décide : dans quel état est ce téléphone, et quelle adresse rouvrir.
 */
import type { BilanTelephone } from '@/types/domain'

/**
 * Où en est ce téléphone.
 *
 *   indisponible  le navigateur ne sait pas recevoir de notifications ;
 *   a-installer   iPhone ou iPad, espace ouvert dans Safari : les rappels
 *                 n'y arrivent QUE si l'espace est installé sur l'écran
 *                 d'accueil. Proposer « Activer » ici échouerait à tous les
 *                 coups — il faut d'abord dire comment installer ;
 *   refusee       l'autorisation a été refusée : seul le réglage du
 *                 téléphone peut la rendre, aucun bouton de la page ;
 *   fermee        le serveur n'envoie pas encore de rappels (sa clé n'est pas
 *                 posée) : proposer le bouton, c'est promettre ce qu'on ne
 *                 tiendra pas ;
 *   inactive      tout est possible, rien n'est fait ;
 *   active        ce téléphone reçoit les rappels.
 */
export type EtatRappels = 'indisponible' | 'a-installer' | 'refusee' | 'fermee' | 'inactive' | 'active'

export interface Environnement {
  serviceWorker: boolean
  pushManager: boolean
  notification: boolean
  permission: 'default' | 'granted' | 'denied' | null
  ios: boolean
  installee: boolean
}

/** L'état qu'on peut établir sans rien demander au téléphone. */
export function etatDeDepart(env: Environnement): EtatRappels {
  // L'ordre compte : sur iPhone non installé, PushManager est absent, et
  // l'on dirait « indisponible » là où il suffit d'installer l'espace.
  if (env.ios && !env.installee) return 'a-installer'
  if (!env.serviceWorker || !env.pushManager || !env.notification) return 'indisponible'
  if (env.permission === 'denied') return 'refusee'
  return 'inactive'
}

/**
 * Un iPhone, ou un iPad — qui se présente désormais comme un Mac.
 *
 * Depuis iPadOS 13, Safari sur iPad annonce « MacIntel » : seul l'écran
 * tactile le trahit. Un Mac n'en a pas.
 */
export function surIOS(ua: string, plateforme = '', pointsDeContact = 0): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true
  return plateforme === 'MacIntel' && pointsDeContact > 1
}

/**
 * L'adresse de l'espace à rouvrir depuis une notification.
 *
 * /son-cabinet/mon porte la marque du cabinet dès la porte ; /mon, la nôtre.
 * On garde donc celle d'où la patiente a activé les rappels.
 */
export function cheminDeLEspace(pathname: string): string {
  const m = /^\/([a-z0-9][a-z0-9-]{0,62})\/mon\/?$/.exec(pathname)
  return m ? `/${m[1]}/mon` : '/mon'
}

/**
 * Le manifeste à annoncer depuis cette page.
 *
 * Le même fichier pour tous, mais LU depuis l'adresse du cabinet : ses
 * chemins relatifs (« ./mon ») se résolvent alors en /son-cabinet/mon, et
 * l'espace installé rouvre la bonne porte.
 */
export function adresseDuManifeste(pathname: string): string {
  const chemin = cheminDeLEspace(pathname)
  return chemin === '/mon' ? '/manifest.webmanifest' : `${chemin.slice(0, -'/mon'.length)}/manifest.webmanifest`
}

/**
 * La clé publique du serveur, telle que `pushManager.subscribe` la veut.
 *
 * Elle voyage en base64url ; le navigateur exige des octets.
 */
export function cleEnOctets(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const complete = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binaire = atob(complete)
  const octets = new Uint8Array(binaire.length)
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i)
  return octets
}

/** Le rappel « plus tard » tient une semaine : assez pour ne pas harceler. */
export const PLUS_TARD_MS = 7 * 24 * 3600 * 1000

export function plusTardEncoreValable(horodatage: string | null, maintenant: number): boolean {
  const t = Number(horodatage)
  return Number.isFinite(t) && t > 0 && maintenant - t < PLUS_TARD_MS
}

/* ------------------------------------------------------------------ *
 * Côté thérapeute : ce qui est arrivé
 * ------------------------------------------------------------------ */

/** Le sort d'un mot, compté depuis le statut de chaque destinataire. */
export function bilanTelephone(statuts: Array<string | null | undefined>): BilanTelephone {
  const bilan: BilanTelephone = { arrivees: 0, sansTelephone: 0, echecs: 0, tardives: 0, enAttente: 0 }
  for (const statut of statuts) {
    if (statut === 'envoyee') bilan.arrivees += 1
    else if (statut === 'sans_appareil') bilan.sansTelephone += 1
    else if (statut === 'echec') bilan.echecs += 1
    else if (statut === 'expiree') bilan.tardives += 1
    else bilan.enAttente += 1
  }
  return bilan
}

/**
 * La ligne du journal des envois.
 *
 * Vide tant que rien n'a été traité : un mot qui attend son heure n'a rien
 * à dire des téléphones, et l'écran le dit déjà (« Part le … »).
 */
export function phraseTelephone(b: BilanTelephone): string {
  const morceaux: string[] = []
  if (b.arrivees) {
    morceaux.push(
      b.arrivees === 1 ? "arrivé sur le téléphone d'une personne" : `arrivé sur le téléphone de ${b.arrivees} personnes`,
    )
  }
  if (b.sansTelephone) {
    morceaux.push(
      b.sansTelephone === 1
        ? '1 sans rappels activés : lu à sa prochaine ouverture'
        : `${b.sansTelephone} sans rappels activés : lu à leur prochaine ouverture`,
    )
  }
  if (b.echecs) morceaux.push(`${b.echecs} injoignable${b.echecs > 1 ? 's' : ''} sur leur téléphone`)
  if (b.tardives) morceaux.push(`${b.tardives} non envoyé${b.tardives > 1 ? 's' : ''} : l'heure était passée`)
  if (b.enAttente && morceaux.length) morceaux.push(`${b.enAttente} en cours`)
  if (!morceaux.length) return ''
  const phrase = morceaux.join(' · ')
  return phrase.charAt(0).toUpperCase() + phrase.slice(1)
}
