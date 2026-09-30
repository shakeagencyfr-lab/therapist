/**
 * Les jetons du revendeur, partagés par ses écrans.
 *
 * Trois écrans les lisent : l'onglet « Jetons IA » qui les règle, l'éditeur
 * d'offres où chaque cabinet montre son solde et reçoit un geste, et la fiche
 * du cabinet. Un seul appel à /api/revendeur pour les trois, monté par
 * l'espace revendeur à côté de son portefeuille (src/reseller/context.tsx) —
 * sans quoi un geste fait dans l'un ne se verrait pas dans l'autre.
 *
 * LA BASE ET LE SERVEUR JUGENT. Lire est à toute l'équipe ; régler, au
 * propriétaire, en « aal2 » pour un compte protégé (server/revendeur.ts).
 * L'écran ne fait que ne pas proposer ce qu'ils refuseraient — et rapporte
 * leur refus tel quel quand il arrive.
 *
 * Sans session (démonstration publique, banc de rendu), l'onglet montre des
 * réglages fictifs, en lecture seule.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ETAT_REVENDEUR_DEMO } from '@/data/jetons'
import { supabase } from '@/lib/supabase'
import { useRetour } from '@/lib/useRetour'
import { agirJetonsRevendeur, lireJetonsRevendeur } from '@/services/revendeur'
import type { ActionRevendeur, CabinetJetons, EtatRevendeurJetons } from '@/types/jetons'
import type { Resultat } from './useReseller'

export interface JetonsRevendeurData {
  etat: EtatRevendeurJetons | null
  /** Vrai quand l'état vient du serveur et non de la démonstration. */
  reel: boolean
  chargement: boolean
  erreur: string
  /** Le geste en cours : « cle », « stripe », « bareme », « recharge-<id> », « offrir-<cabinet> »… */
  enCours: string
  recharger: () => Promise<void>
  /** Un geste du propriétaire. `cle` nomme le geste pour l'écran ; `confirmation` dit la réussite. */
  agir: (cle: string, action: ActionRevendeur, confirmation: string) => Promise<Resultat>
  /** Le solde et la consommation du mois d'un cabinet, s'ils sont lus. */
  duCabinet: (cabinetId: string) => CabinetJetons | null
}

const Ctx = createContext<JetonsRevendeurData | null>(null)

/**
 * Le contexte lui-même, pour poser un état à la main : le banc de rendu y
 * met celui d'un propriétaire, que la démonstration (sans session) ne peut
 * pas être.
 */
export const JetonsRevendeurContexte = Ctx

function useChargement(): JetonsRevendeurData {
  const sansBase = !supabase()
  const [etat, setEtat] = useState<EtatRevendeurJetons | null>(() => (sansBase ? ETAT_REVENDEUR_DEMO : null))
  const [reel, setReel] = useState(false)
  const [chargement, setChargement] = useState(!sansBase)
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState('')

  const recharger = useCallback(async () => {
    const db = supabase()
    const session = db ? (await db.auth.getSession()).data.session : null
    if (!db || !session) {
      setEtat(ETAT_REVENDEUR_DEMO)
      setReel(false)
      setChargement(false)
      return
    }
    setReel(true)
    try {
      setEtat(await lireJetonsRevendeur())
      setErreur('')
    } catch (err) {
      /* Une lecture en échec ne vide pas l'écran : des réglages absents
         passeraient pour des réglages à zéro. On garde ce qu'on avait. */
      setErreur((err as Error).message)
    }
    setChargement(false)
  }, [])

  useEffect(() => {
    void recharger()
  }, [recharger])

  useRetour(() => void recharger())

  const agir = useCallback(
    async (cle: string, action: ActionRevendeur, confirmation: string): Promise<Resultat> => {
      if (!reel) return { ok: false, message: 'Connectez-vous pour régler vos jetons.' }
      if (enCours) return { ok: false, message: 'Un réglage est déjà en cours : attendez sa réponse.' }
      setEnCours(cle)
      try {
        // Le serveur rend l'état qui en résulte : pas de seconde lecture.
        setEtat(await agirJetonsRevendeur(action))
        setErreur('')
        return { ok: true, message: confirmation }
      } catch (err) {
        return { ok: false, message: (err as Error).message }
      } finally {
        setEnCours('')
      }
    },
    [enCours, reel],
  )

  const duCabinet = useCallback(
    (cabinetId: string) => etat?.cabinets.find((c) => c.cabinetId === cabinetId) ?? null,
    [etat],
  )

  return { etat, reel, chargement, erreur, enCours, recharger, agir, duCabinet }
}

export function JetonsRevendeurProvider({ children }: { children: ReactNode }) {
  const data = useChargement()
  return createElement(Ctx.Provider, { value: data }, children)
}

/** Les jetons du revendeur, ou null hors de l'espace revendeur. */
export function useJetonsRevendeur(): JetonsRevendeurData | null {
  return useContext(Ctx)
}
