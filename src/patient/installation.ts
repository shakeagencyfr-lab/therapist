/**
 * L'espace sur l'écran d'accueil, côté navigateur.
 *
 * L'ANNONCE NE PASSE QU'UNE FOIS. Chrome et Edge émettent
 * `beforeinstallprompt` une seule fois par chargement de page, et souvent
 * avant que React ait monté le moindre écran. Un composant qui l'écouterait
 * lui-même arriverait après — et le bouton ne s'afficherait jamais. On
 * l'écoute donc au démarrage (patient-main.tsx), on la garde ici, et les
 * écrans s'y abonnent.
 */
import { useSyncExternalStore } from 'react'
import { etatInstallation, type EtatInstallation } from '@/lib/installable'
import { surIOS } from '@/lib/rappels'

/** L'annonce du navigateur. Absente des types du DOM : on la décrit. */
interface InvitationInstallation extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let invitation: InvitationInstallation | null = null
let installeeIci = false
let version = 0
const abonnes = new Set<() => void>()

function prevenir(): void {
  version += 1
  abonnes.forEach((f) => f())
}

/** L'espace s'ouvre-t-il déjà depuis son icône, en plein écran ? */
export function estInstallee(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone,
  )
}

/**
 * À appeler une fois, au démarrage, avant le premier rendu.
 *
 * `preventDefault()` retient le bandeau que Chrome afficherait de lui-même
 * au bas de l'écran : c'est notre bouton qui le remplace, au bon endroit,
 * avec une phrase qui dit à quoi sert l'installation. Le menu de Chrome
 * garde de toute façon son entrée « Installer l'application ».
 */
export function ecouterInstallation(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (evenement) => {
    evenement.preventDefault()
    invitation = evenement as InvitationInstallation
    prevenir()
  })
  window.addEventListener('appinstalled', () => {
    invitation = null
    installeeIci = true
    prevenir()
  })
}

function lire(): EtatInstallation {
  if (typeof window === 'undefined') return 'impossible'
  return etatInstallation({
    installee: installeeIci || estInstallee(),
    invitation: invitation !== null,
    ios: surIOS(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
    userAgent: navigator.userAgent,
  })
}

function abonner(rappel: () => void): () => void {
  abonnes.add(rappel)
  return () => abonnes.delete(rappel)
}

export type IssueInstallation = 'acceptee' | 'refusee' | 'indisponible'

/**
 * Ouvre la fenêtre d'installation du navigateur.
 *
 * Une annonce ne sert qu'une fois : acceptée ou refusée, le navigateur n'y
 * répondra plus. On l'oublie aussitôt, pour qu'aucun bouton ne reste à
 * l'écran sans rien derrière.
 */
export async function installer(): Promise<IssueInstallation> {
  const annonce = invitation
  if (!annonce) return 'indisponible'
  invitation = null
  try {
    await annonce.prompt()
    const { outcome } = await annonce.userChoice
    if (outcome === 'accepted') installeeIci = true
    return outcome === 'accepted' ? 'acceptee' : 'refusee'
  } catch {
    return 'indisponible'
  } finally {
    prevenir()
  }
}

/** Ce que cet appareil permet, tenu à jour quand le navigateur parle. */
export function useInstallation(): EtatInstallation {
  // La version change à chaque annonce ; l'état se relit alors.
  useSyncExternalStore(abonner, () => version, () => 0)
  return lire()
}
