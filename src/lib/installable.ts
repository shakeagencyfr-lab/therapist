/**
 * L'espace sur l'écran d'accueil — la part qui se raisonne sans navigateur.
 *
 * Deux mondes, et aucun ne se commande de la même façon :
 *
 *   Android, et Chrome ou Edge sur ordinateur : le navigateur ANNONCE qu'il
 *   sait installer l'espace (l'événement `beforeinstallprompt`). On garde
 *   cette annonce, et un vrai bouton la déclenche.
 *
 *   iPhone et iPad : Apple ne donne à aucun site le moyen de proposer
 *   l'installation. Il n'y a que le geste de la patiente — Partager, puis
 *   « Sur l'écran d'accueil » — et encore, depuis Safari seulement : les
 *   navigateurs intégrés aux applications (Gmail, Instagram…) ne le
 *   permettent pas du tout.
 */

/**
 * Ce qu'on peut proposer sur cet appareil.
 *
 *   installee      l'espace s'ouvre déjà depuis son icône : rien à proposer ;
 *   bouton         le navigateur a annoncé qu'il sait l'installer ;
 *   ios            Safari sur iPhone ou iPad : les étapes, à la main ;
 *   ios-ailleurs   un autre navigateur sur iPhone, ou le navigateur intégré
 *                  d'une application : il faut d'abord rouvrir la page dans
 *                  Safari ;
 *   impossible     rien ne s'offre (Firefox sur ordinateur, navigateur qui
 *                  n'a pas encore annoncé, ou qui a déjà essuyé un refus) —
 *                  on se tait plutôt que de montrer un bouton inerte.
 */
export type EtatInstallation = 'installee' | 'bouton' | 'ios' | 'ios-ailleurs' | 'impossible'

export interface EnvInstallation {
  installee: boolean
  /** Le navigateur a-t-il annoncé qu'il sait installer l'espace ? */
  invitation: boolean
  ios: boolean
  userAgent: string
}

/**
 * Chrome, Firefox, Edge et Opera sur iPhone signent leur nom ; les
 * navigateurs intégrés aux applications aussi (Facebook, Instagram,
 * l'application Google, Gmail…). Safari, lui, ne signe rien de tout ça.
 */
const PAS_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|GSA\/|Line\/|Twitter|LinkedInApp|GmailApp/

export function etatInstallation(env: EnvInstallation): EtatInstallation {
  if (env.installee) return 'installee'
  if (env.invitation) return 'bouton'
  if (env.ios) return PAS_SAFARI.test(env.userAgent) ? 'ios-ailleurs' : 'ios'
  return 'impossible'
}

/** Y a-t-il quelque chose à proposer — c'est-à-dire un geste qui aboutit ? */
export function installationAProposer(etat: EtatInstallation): boolean {
  return etat === 'bouton' || etat === 'ios' || etat === 'ios-ailleurs'
}
