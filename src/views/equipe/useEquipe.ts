/**
 * L'équipe du cabinet, branchée sur la base.
 *
 * Les membres se lisent par `equipe_du_cabinet()` (0042) : leurs adresses
 * vivent dans la table des comptes, que le navigateur ne lit pas, et la
 * fonction ne les rend qu'aux membres du cabinet. Les invitations se lisent
 * directement, sous la RLS : toute l'équipe les voit, seule la titulaire les
 * écrit.
 *
 * Aucune règle n'est décidée ici. Qui peut inviter, relancer, retirer : c'est
 * la base qui tranche, et ce module rapporte sa réponse.
 */
import { useCallback, useEffect, useState } from 'react'
import { messageRetrait } from '@/lib/equipe'
import { supabase } from '@/lib/supabase'
import { useRetour } from '@/lib/useRetour'
import { annulerInvitation, poserInvitation, relancerInvitation } from '@/services/equipe'
import { demanderInvitation } from '@/services/invitations'

export interface Membre {
  user_id: string
  display_name: string
  email: string | null
  role: string
  created_at: string
}

export interface InvitationEquipe {
  id: string
  email: string
  role: string
  display_name: string | null
  expires_at: string
  created_at: string
}

export interface Resultat {
  ok: boolean
  message: string
  /** Enregistrée, mais le courriel n'est pas parti : l'écran ne le peint pas en vert. */
  partiel?: boolean
}

export interface EquipeData {
  membres: Membre[]
  invitations: InvitationEquipe[]
  chargement: boolean
  erreur: string
  recharger: () => Promise<void>
  inviter: (nom: string, email: string) => Promise<Resultat>
  relancer: (invitation: InvitationEquipe) => Promise<Resultat>
  annuler: (invitation: InvitationEquipe) => Promise<Resultat>
  retirer: (membre: Membre) => Promise<Resultat>
}

export function useEquipe(cabinetId: string | null): EquipeData {
  const [membres, setMembres] = useState<Membre[]>([])
  const [invitations, setInvitations] = useState<InvitationEquipe[]>([])
  const [chargement, setChargement] = useState(Boolean(cabinetId))
  const [erreur, setErreur] = useState('')

  const recharger = useCallback(async () => {
    const db = supabase()
    if (!db || !cabinetId) {
      setChargement(false)
      return
    }
    const [lus, attente] = await Promise.all([
      db.rpc('equipe_du_cabinet', { p_cabinet: cabinetId }),
      db
        .from('cabinet_invitations')
        .select('id, email, role, display_name, expires_at, created_at')
        .eq('cabinet_id', cabinetId)
        .is('accepted_at', null)
        .order('created_at'),
    ])
    /* Une lecture en échec ne vide pas l'écran : on garde ce qu'on avait, et
       on le dit. Une liste vide passerait pour une équipe vide. */
    if (!lus.error) setMembres((lus.data ?? []) as Membre[])
    if (!attente.error) setInvitations((attente.data ?? []) as InvitationEquipe[])
    setErreur(lus.error || attente.error ? "L'équipe n'a pas pu être lue en entier. Réessayez dans un instant." : '')
    setChargement(false)
  }, [cabinetId])

  useEffect(() => {
    void recharger()
  }, [recharger])

  /* Une consœur accepte son invitation pendant que la titulaire regarde la
     liste : au retour sur l'onglet, elle passe des invitations à l'équipe. */
  useRetour(() => void recharger())

  /** Après l'écriture, le courriel : l'invitation vaut même s'il ne part pas. */
  const envoyer = useCallback(
    async (email: string, quoi: string): Promise<Resultat> => {
      if (!cabinetId) return { ok: false, message: '' }
      const envoi = await demanderInvitation({ email, cabinetId, kind: 'consoeur' })
      await recharger()
      return {
        ok: true,
        partiel: !envoi.ok,
        message: envoi.message || `${quoi} ${email}, valable trente jours. La personne se connectera avec cette adresse.`,
      }
    },
    [cabinetId, recharger],
  )

  const inviter = useCallback(
    async (nom: string, email: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Connectez-vous à votre cabinet pour inviter.' }
      const ecrit = await poserInvitation(db, { cabinetId, email, nom, role: 'therapist' })
      if (!ecrit.ok) {
        await recharger()
        return { ok: false, message: ecrit.message }
      }
      return envoyer(ecrit.email ?? email.trim(), 'Invitation prête pour')
    },
    [cabinetId, envoyer, recharger],
  )

  const relancer = useCallback(
    async (invitation: InvitationEquipe): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Connectez-vous à votre cabinet pour relancer.' }
      /* Le rôle est reposé : relancer l'invitation d'ouverture restée sans
         suite en fait une invitation de membre — le cabinet a déjà sa
         titulaire, la base n'en accepterait pas une seconde. */
      const ecrit = await relancerInvitation(db, { id: invitation.id, role: 'therapist' })
      if (!ecrit.ok || !ecrit.email) {
        await recharger()
        return { ok: false, message: ecrit.message }
      }
      return envoyer(ecrit.email, 'Invitation relancée pour')
    },
    [cabinetId, envoyer, recharger],
  )

  const annuler = useCallback(
    async (invitation: InvitationEquipe): Promise<Resultat> => {
      const db = supabase()
      if (!db) return { ok: false, message: 'Connectez-vous à votre cabinet pour annuler.' }
      const r = await annulerInvitation(db, { id: invitation.id, role: 'therapist' })
      await recharger()
      return r
    },
    [recharger],
  )

  const retirer = useCallback(
    async (membre: Membre): Promise<Resultat> => {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Connectez-vous à votre cabinet.' }
      const { data, error } = await db.rpc('retirer_du_cabinet', { p_cabinet: cabinetId, p_user: membre.user_id })
      await recharger()
      return messageRetrait(error ? null : (data as string | null), membre.display_name)
    },
    [cabinetId, recharger],
  )

  return { membres, invitations, chargement, erreur, recharger, inviter, relancer, annuler, retirer }
}
