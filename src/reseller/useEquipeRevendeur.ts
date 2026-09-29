/**
 * L'équipe du revendeur et ses coordonnées de support, branchées sur la base.
 *
 * Les membres se lisent par `equipe_du_revendeur()` (0057) : leurs adresses
 * vivent dans la table des comptes, que le navigateur ne lit pas. Les
 * invitations se lisent directement, sous la RLS : toute l'équipe les voit,
 * seul un propriétaire les écrit. Aucune règle n'est décidée ici — la base
 * tranche, ce module rapporte sa réponse.
 *
 * Sans session (démonstration publique, banc de rendu), l'onglet montre une
 * équipe fictive, en lecture seule.
 */
import { useCallback, useEffect, useState } from 'react'
import { EQUIPE_DEMO } from '@/data/reseller'
import { supabase } from '@/lib/supabase'
import { useRetour } from '@/lib/useRetour'
import {
  messageRetraitRevendeur,
  type Coordonnees,
  type InvitationRevendeur,
  type MembreRevendeur,
  type RoleRevendeur,
} from '@/lib/revendeur'
import {
  annulerInvitationEquipe,
  enregistrerCoordonnees,
  inviterDansLEquipe,
  lireEquipe,
  relancerInvitationEquipe,
  retirerDeLEquipe,
  type Organisation,
} from '@/services/equipeRevendeur'
import { demanderInvitation } from '@/services/invitations'
import type { Resultat } from './useReseller'

export interface EquipeRevendeurData {
  organisation: Organisation | null
  membres: MembreRevendeur[]
  invitations: InvitationRevendeur[]
  /** Vrai quand les données viennent de la base et non de la démonstration. */
  reel: boolean
  /** La personne connectée est-elle propriétaire du compte ? La base reste juge. */
  proprietaire: boolean
  chargement: boolean
  erreur: string
  recharger: () => Promise<void>
  inviter: (email: string, role: RoleRevendeur) => Promise<Resultat>
  relancer: (invitation: InvitationRevendeur) => Promise<Resultat>
  annuler: (invitation: InvitationRevendeur) => Promise<Resultat>
  retirer: (membre: MembreRevendeur) => Promise<Resultat>
  enregistrer: (c: Coordonnees) => Promise<Resultat>
}

export function useEquipeRevendeur(): EquipeRevendeurData {
  const sansBase = !supabase()
  const [organisation, setOrganisation] = useState<Organisation | null>(() => (sansBase ? EQUIPE_DEMO.organisation : null))
  const [membres, setMembres] = useState<MembreRevendeur[]>(() => (sansBase ? EQUIPE_DEMO.membres : []))
  const [invitations, setInvitations] = useState<InvitationRevendeur[]>(() => (sansBase ? EQUIPE_DEMO.invitations : []))
  const [reel, setReel] = useState(false)
  const [chargement, setChargement] = useState(!sansBase)
  const [erreur, setErreur] = useState('')

  const recharger = useCallback(async () => {
    const db = supabase()
    const session = db ? (await db.auth.getSession()).data.session : null
    if (!db || !session) {
      setOrganisation(EQUIPE_DEMO.organisation)
      setMembres(EQUIPE_DEMO.membres)
      setInvitations(EQUIPE_DEMO.invitations)
      setReel(false)
      setChargement(false)
      return
    }
    setReel(true)
    const lu = await lireEquipe(db)
    /* Une lecture en échec ne vide pas l'écran : une liste vide passerait pour
       une équipe vide. On garde ce qu'on avait, et on le dit. */
    if (!lu.erreur || lu.membres.length) {
      setMembres(lu.membres)
      setInvitations(lu.invitations)
      if (lu.organisation) setOrganisation(lu.organisation)
    }
    setErreur(lu.erreur)
    setChargement(false)
  }, [])

  useEffect(() => {
    void recharger()
  }, [recharger])

  // Une invitée accepte pendant qu'on regarde la liste : au retour, elle y est.
  useRetour(() => void recharger())

  /* La démonstration se lit sans se régler, comme l'écran Offres : des
     champs éditables sans compte ne mèneraient qu'à « connectez-vous ». */
  const proprietaire = reel && membres.some((m) => m.moi && m.role === 'owner')
  const resellerId = organisation?.id ?? membres.find((m) => m.moi)?.reseller_id ?? null

  /** Après l'écriture, le courriel : l'invitation vaut même s'il ne part pas. */
  const envoyer = useCallback(
    async (email: string, quoi: string): Promise<Resultat> => {
      const envoi = await demanderInvitation({ email, kind: 'collaborateur' })
      await recharger()
      return {
        ok: true,
        partiel: !envoi.ok,
        message:
          envoi.message ||
          `${quoi} ${email}, valable trente jours. La personne se connectera avec cette adresse.`,
      }
    },
    [recharger],
  )

  const inviter = useCallback(
    async (email: string, role: RoleRevendeur): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel || !resellerId) return { ok: false, message: 'Connectez-vous à votre espace revendeur pour inviter.' }
      const ecrit = await inviterDansLEquipe(db, { resellerId, email, role })
      if (!ecrit.ok) {
        await recharger()
        return { ok: false, message: ecrit.message }
      }
      return envoyer(ecrit.email ?? email.trim(), 'Invitation prête pour')
    },
    [envoyer, recharger, reel, resellerId],
  )

  const relancer = useCallback(
    async (invitation: InvitationRevendeur): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) return { ok: false, message: 'Connectez-vous pour relancer une invitation.' }
      const ecrit = await relancerInvitationEquipe(db, invitation.id)
      if (!ecrit.ok || !ecrit.email) {
        await recharger()
        return { ok: false, message: ecrit.message }
      }
      return envoyer(ecrit.email, 'Invitation relancée pour')
    },
    [envoyer, recharger, reel],
  )

  const annuler = useCallback(
    async (invitation: InvitationRevendeur): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) return { ok: false, message: 'Connectez-vous pour annuler une invitation.' }
      const r = await annulerInvitationEquipe(db, invitation.id)
      await recharger()
      return r
    },
    [recharger, reel],
  )

  const retirer = useCallback(
    async (membre: MembreRevendeur): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) return { ok: false, message: 'Connectez-vous à votre espace revendeur.' }
      const { code } = await retirerDeLEquipe(db, membre.reseller_id, membre.user_id)
      await recharger()
      return messageRetraitRevendeur(code, membre.email)
    },
    [recharger, reel],
  )

  const enregistrer = useCallback(
    async (c: Coordonnees): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel || !resellerId) return { ok: false, message: 'Connectez-vous pour régler vos coordonnées.' }
      const r = await enregistrerCoordonnees(db, resellerId, c)
      await recharger()
      return r
    },
    [recharger, reel, resellerId],
  )

  return {
    organisation,
    membres,
    invitations,
    reel,
    proprietaire,
    chargement,
    erreur,
    recharger,
    inviter,
    relancer,
    annuler,
    retirer,
    enregistrer,
  }
}
