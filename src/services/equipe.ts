/**
 * Écrire les invitations d'un cabinet, depuis l'un ou l'autre espace.
 *
 * Le revendeur invite la titulaire d'un cabinet vide ; la titulaire invite
 * son équipe. Les deux écrivent la même table, sous deux politiques
 * différentes (0042), et butaient sur le même piège : l'index unique
 * (cabinet, adresse) des invitations en attente. Une invitation expirée reste
 * « en attente » — personne ne l'a acceptée — et interdisait d'en poser une
 * nouvelle pour la même adresse. Le revendeur lisait « L'invitation n'a pas
 * pu être enregistrée », à chaque essai, pour toujours.
 *
 * La réponse n'est donc pas d'en poser une autre : c'est de RELANCER celle qui
 * attend. La base repose alors sa date et son autrice (0042) ; l'écran n'a
 * qu'à dire l'échéance.
 *
 * Aucun courriel ne part d'ici : ce module écrit, l'appelant envoie ensuite
 * par /api/invitations.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { motifExact, nouvelleEcheance, refusInvitation } from '@/lib/equipe'

/** `owner` : l'amorçage, par le revendeur. `therapist` : l'équipe, par la titulaire. */
export type RoleInvitation = 'owner' | 'therapist'

export interface EcritureInvitation {
  ok: boolean
  message: string
  /** L'adresse telle qu'elle est enregistrée — celle à qui écrire. */
  email?: string
  cabinetId?: string
}

function depuis(role: RoleInvitation): 'titulaire' | 'revendeur' {
  return role === 'owner' ? 'revendeur' : 'titulaire'
}

/** Le nom saisi, ou rien : une chaîne vide n'est pas un nom (claim_access retombe sur l'adresse). */
function nomSaisi(nom: string | undefined): string | null {
  const n = (nom ?? '').trim()
  return n ? n : null
}

/**
 * Pose une invitation — ou relance celle qui attend déjà cette adresse.
 *
 * Relancer plutôt que refuser : c'est le seul geste qui débloque une
 * invitation échue, et c'est ce que la personne voulait en saisissant
 * l'adresse une seconde fois.
 */
export async function poserInvitation(
  db: SupabaseClient,
  input: { cabinetId: string; email: string; nom?: string; role: RoleInvitation },
): Promise<EcritureInvitation> {
  const email = input.email.trim().toLowerCase()
  const nom = nomSaisi(input.nom)
  const { error } = await db.from('cabinet_invitations').insert({
    cabinet_id: input.cabinetId,
    email,
    role: input.role,
    display_name: nom,
    expires_at: nouvelleEcheance(),
  })
  if (!error) return { ok: true, message: '', email, cabinetId: input.cabinetId }
  if (error.code !== '23505') return { ok: false, message: refusInvitation(error.code, depuis(input.role)) }

  /* Une invitation attend déjà cette adresse. On la relance ; le nom n'est
     remplacé que s'il en a été saisi un. */
  const champs: Record<string, unknown> = { role: input.role, expires_at: nouvelleEcheance() }
  if (nom) champs.display_name = nom
  const { data, error: eRelance } = await db
    .from('cabinet_invitations')
    .update(champs)
    .eq('cabinet_id', input.cabinetId)
    .is('accepted_at', null)
    .ilike('email', motifExact(email))
    .select('id')
  if (eRelance) return { ok: false, message: refusInvitation(eRelance.code, depuis(input.role)) }
  if (!data?.length) return { ok: false, message: refusInvitation('42501', depuis(input.role)) }
  return { ok: true, message: '', email, cabinetId: input.cabinetId }
}

/**
 * Relance une invitation en attente : trente jours de plus à partir
 * d'aujourd'hui. Éventuellement vers une autre adresse, ou sous un autre nom.
 *
 * On redemande la ligne touchée : un `update` que la politique écarte ne
 * touche rien et ne se plaint pas.
 */
export async function relancerInvitation(
  db: SupabaseClient,
  input: { id: string; role: RoleInvitation; email?: string; nom?: string },
): Promise<EcritureInvitation> {
  const champs: Record<string, unknown> = { role: input.role, expires_at: nouvelleEcheance() }
  if (input.email !== undefined) champs.email = input.email.trim().toLowerCase()
  const nom = nomSaisi(input.nom)
  if (nom) champs.display_name = nom
  const { data, error } = await db
    .from('cabinet_invitations')
    .update(champs)
    .eq('id', input.id)
    .is('accepted_at', null)
    .select('email, cabinet_id')
  if (error) return { ok: false, message: refusInvitation(error.code, depuis(input.role)) }
  const ligne = (data ?? [])[0] as { email: string; cabinet_id: string } | undefined
  if (!ligne) {
    return {
      ok: false,
      message: "Cette invitation n'est plus en attente : elle a été acceptée ou annulée entre-temps.",
    }
  }
  return { ok: true, message: '', email: ligne.email, cabinetId: ligne.cabinet_id }
}

/** Annule une invitation en attente. Son lien, s'il a été ouvert, ne rattache plus personne. */
export async function annulerInvitation(
  db: SupabaseClient,
  input: { id: string; role: RoleInvitation },
): Promise<EcritureInvitation> {
  const { data, error } = await db
    .from('cabinet_invitations')
    .delete()
    .eq('id', input.id)
    .is('accepted_at', null)
    .select('id')
  if (error) return { ok: false, message: refusInvitation(error.code, depuis(input.role)) }
  if (!data?.length) {
    return {
      ok: false,
      message: "Cette invitation n'est plus en attente : elle a été acceptée ou annulée entre-temps.",
    }
  }
  return { ok: true, message: 'Invitation annulée. Son lien ne donne plus accès au cabinet.' }
}
