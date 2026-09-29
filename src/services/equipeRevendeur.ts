/**
 * L'équipe du revendeur et ses coordonnées de support, lues et écrites depuis
 * l'onglet « Équipe ».
 *
 * Même logique que src/services/equipe.ts pour l'équipe d'un cabinet : la base
 * signe les invitations et tient les droits (0057) ; ce module écrit, redemande
 * les lignes touchées — un `update` que la politique écarte ne se plaint pas —
 * et traduit les refus. Aucun courriel ne part d'ici : l'appelant l'envoie
 * ensuite par /api/invitations.
 *
 * Rien de ce qui passe ici ne touche une donnée de santé : des adresses de
 * collègues, un nom d'enseigne, une adresse de support.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { motifExact, nouvelleEcheance } from '@/lib/equipe'
import {
  refusInvitationRevendeur,
  versLigneCoordonnees,
  type Coordonnees,
  type InvitationRevendeur,
  type MembreRevendeur,
  type RoleRevendeur,
} from '@/lib/revendeur'

/** L'organisation du revendeur, telle que l'onglet la montre. */
export interface Organisation {
  id: string
  nom: string
  /** Vide quand aucune adresse de support n'est posée. */
  courriel: string
}

export interface LectureEquipe {
  organisation: Organisation | null
  membres: MembreRevendeur[]
  invitations: InvitationRevendeur[]
  erreur: string
}

export interface EcritureEquipe {
  ok: boolean
  message: string
  /** L'adresse telle qu'elle est enregistrée — celle à qui écrire. */
  email?: string
}

/** L'équipe, ses invitations en attente, et l'organisation qui les porte. */
export async function lireEquipe(db: SupabaseClient): Promise<LectureEquipe> {
  const [equipe, attente] = await Promise.all([
    db.rpc('equipe_du_revendeur'),
    db
      .from('reseller_invitations')
      .select('id, reseller_id, email, role, expires_at, created_at')
      .is('accepted_at', null)
      .order('created_at'),
  ])
  if (equipe.error) {
    return { organisation: null, membres: [], invitations: [], erreur: "Votre équipe n'a pas pu être lue. Réessayez dans un instant." }
  }
  const membres = (equipe.data ?? []) as MembreRevendeur[]
  /* L'organisation se lit par l'identifiant de SA ligne d'équipe : un compte
     qui est aussi praticienne lit un second revendeur (celui de son cabinet,
     politique « cabinet lit son revendeur »), et `limit 1` aurait pu rendre
     celui-là. */
  const moi = membres.find((m) => m.moi)
  let organisation: Organisation | null = null
  let erreur = attente.error ? "Les invitations en attente n'ont pas pu être lues." : ''
  if (moi) {
    const { data, error } = await db
      .from('resellers')
      .select('id, name, support_email')
      .eq('id', moi.reseller_id)
      .maybeSingle<{ id: string; name: string; support_email: string | null }>()
    if (error) erreur = "Les coordonnées de votre organisation n'ont pas pu être lues."
    if (data) organisation = { id: data.id, nom: data.name, courriel: data.support_email ?? '' }
  }
  const invitations = ((attente.data ?? []) as InvitationRevendeur[]).filter(
    (i) => !moi || i.reseller_id === moi.reseller_id,
  )
  return { organisation, membres: membres.filter((m) => !moi || m.reseller_id === moi.reseller_id), invitations, erreur }
}

/**
 * Invite une personne dans l'équipe — ou relance l'invitation qui l'attend.
 *
 * Relancer plutôt que refuser : c'est ce que voulait la personne qui saisit
 * une seconde fois la même adresse, et le seul geste qui débloque une
 * invitation échue.
 */
export async function inviterDansLEquipe(
  db: SupabaseClient,
  input: { resellerId: string; email: string; role: RoleRevendeur },
): Promise<EcritureEquipe> {
  const email = input.email.trim().toLowerCase()
  const { error } = await db.from('reseller_invitations').insert({
    reseller_id: input.resellerId,
    email,
    role: input.role,
    expires_at: nouvelleEcheance(),
  })
  if (!error) return { ok: true, message: '', email }
  if (error.code !== '23505') return { ok: false, message: refusInvitationRevendeur(error.code) }

  const { data, error: eRelance } = await db
    .from('reseller_invitations')
    .update({ role: input.role, expires_at: nouvelleEcheance() })
    .eq('reseller_id', input.resellerId)
    .is('accepted_at', null)
    .ilike('email', motifExact(email))
    .select('id')
  if (eRelance) return { ok: false, message: refusInvitationRevendeur(eRelance.code) }
  if (!data?.length) return { ok: false, message: refusInvitationRevendeur('42501') }
  return { ok: true, message: '', email }
}

/** Trente jours de plus, à partir d'aujourd'hui. */
export async function relancerInvitationEquipe(db: SupabaseClient, id: string): Promise<EcritureEquipe> {
  const { data, error } = await db
    .from('reseller_invitations')
    .update({ expires_at: nouvelleEcheance() })
    .eq('id', id)
    .is('accepted_at', null)
    .select('email')
  if (error) return { ok: false, message: refusInvitationRevendeur(error.code) }
  const ligne = (data ?? [])[0] as { email: string } | undefined
  if (!ligne) {
    return { ok: false, message: "Cette invitation n'est plus en attente : elle a été acceptée ou annulée entre-temps." }
  }
  return { ok: true, message: '', email: ligne.email }
}

/** Annule une invitation en attente : son lien ne rattache plus personne. */
export async function annulerInvitationEquipe(db: SupabaseClient, id: string): Promise<EcritureEquipe> {
  const { data, error } = await db
    .from('reseller_invitations')
    .delete()
    .eq('id', id)
    .is('accepted_at', null)
    .select('id')
  if (error) return { ok: false, message: refusInvitationRevendeur(error.code) }
  if (!data?.length) {
    return { ok: false, message: "Cette invitation n'est plus en attente : elle a été acceptée ou annulée entre-temps." }
  }
  return { ok: true, message: "Invitation annulée. Son lien ne donne plus accès à l'espace revendeur." }
}

/** Retire une personne de l'équipe ; la base rend un mot, jamais une exception. */
export async function retirerDeLEquipe(
  db: SupabaseClient,
  resellerId: string,
  userId: string,
): Promise<{ code: string | null }> {
  const { data, error } = await db.rpc('retirer_du_revendeur', { p_reseller: resellerId, p_user: userId })
  if (error) return { code: null }
  return { code: typeof data === 'string' ? data : null }
}

/**
 * Enregistre le nom affiché et l'adresse de support.
 *
 * Deux colonnes seulement : la base n'en accorde pas d'autre (0057). On
 * redemande la ligne : un membre de l'équipe, que la politique écarte, ne
 * recevrait sinon aucun refus — et lirait « enregistré ».
 */
export async function enregistrerCoordonnees(
  db: SupabaseClient,
  resellerId: string,
  c: Coordonnees,
): Promise<EcritureEquipe> {
  const { data, error } = await db
    .from('resellers')
    .update(versLigneCoordonnees(c))
    .eq('id', resellerId)
    .select('id')
  if (error) {
    return {
      ok: false,
      message:
        error.code === '23514'
          ? 'Un nom de deux à quatre-vingts caractères et une adresse de support bien formée sont attendus.'
          : error.code === '42501'
            ? 'Seul un propriétaire du compte règle les coordonnées de support.'
            : "Les coordonnées n'ont pas pu être enregistrées. Réessayez dans un instant.",
    }
  }
  if (!data?.length) {
    return { ok: false, message: 'Seul un propriétaire du compte règle les coordonnées de support.' }
  }
  return {
    ok: true,
    message: "Coordonnées enregistrées. Vos praticiennes les lisent dès maintenant dans le bandeau de leur contrat.",
  }
}
