/**
 * L'équipe d'un cabinet et ses invitations : ce que les écrans en disent.
 *
 * Deux écrans parlent des mêmes invitations — le portefeuille du revendeur,
 * qui ouvre le cabinet, et l'écran « Équipe » de la titulaire, qui y fait
 * entrer ses consœurs. Tant que chacun calculait de son côté ce qu'« expirée »
 * voulait dire, l'un finissait par afficher « Invitation envoyée » sur une
 * invitation morte depuis des semaines. C'est ce qui arrivait : `expires_at`
 * était lu, jamais comparé à rien.
 *
 * La règle, elle, vit en base (0042) : ce module ne décide rien, il dit.
 */
import { dateLongue, plural } from './format'

export { motifExact } from './motifExact'

/** Trente jours : ce que pose la base par défaut, et ce que pose une relance. */
export const DUREE_INVITATION_JOURS = 30

const JOUR_MS = 86_400_000

/** L'échéance d'une invitation posée ou relancée maintenant. */
export function nouvelleEcheance(maintenant: number = Date.now()): string {
  return new Date(maintenant + DUREE_INVITATION_JOURS * JOUR_MS).toISOString()
}

/** Une invitation échue ne rattache plus personne (claim_access la refuse). */
export function invitationExpiree(expiresAt: string | null | undefined, maintenant: number = Date.now()): boolean {
  if (!expiresAt) return false
  const t = Date.parse(expiresAt)
  return Number.isFinite(t) && t <= maintenant
}

/** « expire le 12 octobre 2026 », ou « expirée depuis le 3 octobre 2026 ». */
export function echeanceDite(expiresAt: string | null | undefined, maintenant: number = Date.now()): string {
  if (!expiresAt) return ''
  return invitationExpiree(expiresAt, maintenant)
    ? `expirée depuis le ${dateLongue(expiresAt)}`
    : `expire le ${dateLongue(expiresAt)}`
}

/** Le rôle, tel qu'on le lit à l'écran. Neutre : on ne sait pas qui l'occupe. */
export function libelleRole(role: string): string {
  if (role === 'owner') return 'Titulaire'
  if (role === 'assistant') return 'Assistance'
  return "Membre de l'équipe"
}

/** Même contrôle que le serveur d'envoi : on le dit avant d'écrire. */
export function adressePlausible(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}


/**
 * Pourquoi la base a refusé d'écrire une invitation.
 *
 * `titulaire` : l'écriture venait de l'écran « Équipe ». Sinon, du
 * portefeuille du revendeur, qui n'écrit que dans un cabinet encore vide.
 */
export function refusInvitation(code: string | undefined, depuis: 'titulaire' | 'revendeur'): string {
  if (code === '42501') {
    return depuis === 'titulaire'
      ? 'Seule la titulaire du cabinet peut inviter, relancer ou annuler une invitation.'
      : "Ce cabinet a déjà sa praticienne : c'est elle qui invite désormais, depuis l'écran Équipe de ses réglages."
  }
  if (code === '23505') return 'Une autre invitation attend déjà cette adresse dans ce cabinet.'
  if (code === '23514') return 'Ce nom est trop long : 120 caractères au plus.'
  return "L'invitation n'a pas pu être enregistrée. Réessayez dans un instant."
}

/** Les mots que rend `retirer_du_cabinet()`. */
export type CodeRetrait = 'ok' | 'pas_titulaire' | 'soi_meme' | 'derniere_titulaire' | 'inconnue'

/** Ce que l'écran dit après un retrait, réussi ou non. */
export function messageRetrait(code: string | null | undefined, nom: string): { ok: boolean; message: string } {
  switch (code) {
    case 'ok':
      return {
        ok: true,
        message: `${nom} ne fait plus partie de l'équipe. Ses accès au cabinet sont fermés ; les dossiers restent au cabinet.`,
      }
    case 'pas_titulaire':
      return { ok: false, message: "Seule la titulaire du cabinet peut retirer quelqu'un de l'équipe." }
    case 'soi_meme':
      return { ok: false, message: 'Vous ne pouvez pas vous retirer vous-même : le cabinet resterait sans personne pour le gérer.' }
    case 'derniere_titulaire':
      return { ok: false, message: 'La dernière titulaire du cabinet ne peut pas être retirée.' }
    case 'inconnue':
      return { ok: false, message: `${nom} ne fait déjà plus partie de l'équipe.` }
    default:
      return { ok: false, message: "Le retrait n'a pas pu être fait. Réessayez dans un instant." }
  }
}

/**
 * Peut-on proposer « Retirer » sur cette ligne ?
 *
 * Même règle que la base, pour ne pas montrer un bouton qu'elle refusera :
 * jamais soi-même, jamais la dernière titulaire, et seulement quand on est
 * titulaire. La base reste seule juge.
 */
export function peutRetirer(
  membre: { user_id: string; role: string },
  moi: { user_id: string | null; titulaire: boolean },
  titulaires: number,
): boolean {
  if (!moi.titulaire || !moi.user_id) return false
  if (membre.user_id === moi.user_id) return false
  if (membre.role === 'owner' && titulaires <= 1) return false
  return true
}

/**
 * Ce que le portefeuille du revendeur écrit sous le nom d'un cabinet.
 *
 * La titulaire d'abord — c'est elle, son interlocutrice —, puis le nombre des
 * autres. Sans membre : l'état de l'invitation d'ouverture, ou son absence.
 */
export function etiquetteEquipe(
  membres: Array<{ display_name: string; role: string }>,
  invitation: { expires_at: string } | null | undefined,
  maintenant: number = Date.now(),
): string {
  if (membres.length) {
    const tete = membres.find((m) => m.role === 'owner') ?? membres[0]
    const autres = membres.length - 1
    return autres > 0
      ? `${tete.display_name} et ${plural(autres, 'autre praticienne', 'autres praticiennes')}`
      : tete.display_name
  }
  if (!invitation) return 'Aucune praticienne'
  return invitationExpiree(invitation.expires_at, maintenant) ? 'Invitation expirée' : 'Invitation envoyée'
}
