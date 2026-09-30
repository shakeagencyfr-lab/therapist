/**
 * Les jetons d'analyse du cabinet, partagés par les écrans.
 *
 * Un seul appel pour toute l'application, comme les droits (droits.tsx) :
 * le compteur de l'en-tête, la carte d'Intégrations et les phrases posées à
 * côté de chaque bouton d'analyse lisent le même état. Huit écrans qui le
 * liraient chacun finiraient par annoncer huit soldes différents le temps
 * d'une séance.
 *
 * LE SOLDE SUIT LES ANALYSES SANS RELIRE. Chaque analyse payée en jetons
 * émet `klaro:jetons` avec le solde qui reste (src/services/aiClient.ts) :
 * le compteur bouge aussitôt, et la relecture complète — forfait, achats,
 * historique — suit en arrière-plan.
 *
 * LE RETOUR DE STRIPE SE TRAITE ICI. La page de paiement renvoie à la
 * racine avec `?jetons=…` : le fournisseur le lit au montage, fait vérifier
 * l'achat par le serveur, et garde ce qu'il en dit pour la carte
 * d'Intégrations. Le paramètre ne quitte l'adresse qu'avec un VERDICT —
 * crédité, ou refusé pour de bon — ou quand la praticienne ferme l'avis :
 * tant que Stripe n'a pas confirmé, ou que la vérification a échoué, un
 * rechargement revérifie, et « Vérifier de nouveau » garde de quoi le faire.
 * Le retirer au premier essai perdait le seul numéro de la commande. Le
 * serveur, lui, relit de toute façon les commandes en attente à chaque
 * lecture de l'état (server/jetons.ts) : un onglet fermé ne perd rien.
 *
 * Sans cabinet — démonstration publique, banc de rendu — aucun fournisseur
 * n'est monté : `useJetons()` rend null, et chaque écran garde ses textes
 * d'avant, ceux de la clé du cabinet.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useDroits } from '@/cabinet/droits'
import { devisJetons, retourDit, type Devis } from '@/lib/jetonsIA'
import { useRetour } from '@/lib/useRetour'
import {
  acheterJetons,
  devisDuProfil,
  EVENEMENT_JETONS,
  lireJetons,
  lireRetourDePaiement,
  verifierAchat,
  type AchatVerifie,
  type EtatJetons,
} from '@/services/jetons'
import type { ActionJetons, Bareme, JetonsDeLAppel, ModeFacturation, RechargeProposee } from '@/types/jetons'

/** Ce que la carte dit au retour de la page de paiement. */
export interface RetourDePaiement {
  ton: 'ok' | 'warn' | 'attente'
  texte: string
  /** Stripe n'a pas encore confirmé : la session à revérifier. */
  session?: string
}

export interface JetonsData {
  etat: EtatJetons | null
  chargement: boolean
  erreur: string
  /** Le mode, une fois lu. Null tant qu'on ne sait pas : les écrans gardent alors leurs textes d'avant. */
  mode: ModeFacturation | null
  solde: number | null
  bareme: Bareme | null
  hypnose: EtatJetons['hypnose'] | null
  recharges: RechargeProposee[]
  optionHypnose: EtatJetons['optionHypnose'] | null
  paiementPossible: boolean
  /** Le retour de Stripe, tant que la praticienne ne l'a pas fermé. */
  retour: RetourDePaiement | null
  effacerRetour: () => void
  /** Revérifier un paiement que Stripe n'avait pas encore confirmé. */
  reverifier: () => Promise<void>
  recharger: () => Promise<void>
  /** Part vers la page de paiement ; rend la phrase d'échec, ou null si l'on part. */
  acheter: (choix: { recharge: string } | { option: 'hypnose' }) => Promise<string | null>
  verifier: (session: string) => Promise<AchatVerifie>
}

const Ctx = createContext<JetonsData | null>(null)

/**
 * Le contexte lui-même, pour le banc de rendu seulement : il y pose un mode
 * de facturation à la main (un cabinet qui paie avec sa propre clé) sans
 * base derrière.
 */
export const JetonsContexte = Ctx

/** Retire `?jetons=…` de l'adresse, sans recharger ni toucher au reste. */
function oublierLeRetour(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('jetons')) return
  url.searchParams.delete('jetons')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

export function JetonsProvider({ actif, children }: { actif: boolean; children: ReactNode }) {
  const droits = useDroits()
  const [etat, setEtat] = useState<EtatJetons | null>(null)
  const [chargement, setChargement] = useState(actif)
  const [erreur, setErreur] = useState('')
  const [retour, setRetour] = useState<RetourDePaiement | null>(null)
  /** Une seule vérification par retour, même si l'effet se rejoue. */
  const retourLu = useRef(false)
  const rechargerDroits = droits?.recharger

  const recharger = useCallback(async () => {
    if (!actif) {
      setEtat(null)
      setChargement(false)
      return
    }
    try {
      setEtat(await lireJetons())
      setErreur('')
    } catch (err) {
      /* Une lecture en échec ne ferme rien : les écrans retombent sur leurs
         textes d'avant, et le serveur reste seul juge au moment de l'appel.
         L'état déjà lu est gardé — un compteur qui disparaît le temps d'un
         réseau capricieux ferait croire à un solde vide. */
      setErreur((err as Error).message)
    }
    setChargement(false)
  }, [actif])

  useEffect(() => {
    void recharger()
  }, [recharger])

  useRetour(() => void recharger())

  /* Le compteur suit chaque analyse. */
  useEffect(() => {
    if (!actif || typeof window === 'undefined') return
    const ecouter = (e: Event) => {
      const detail = (e as CustomEvent<JetonsDeLAppel>).detail
      if (!detail) return
      const solde = detail.solde
      if (typeof solde === 'number') setEtat((prev) => (prev ? { ...prev, solde } : prev))
      void recharger()
    }
    window.addEventListener(EVENEMENT_JETONS, ecouter)
    return () => window.removeEventListener(EVENEMENT_JETONS, ecouter)
  }, [actif, recharger])

  const verifier = useCallback(
    async (session: string): Promise<AchatVerifie> => {
      const v = await verifierAchat(session)
      if (v.ok) {
        await recharger()
        // Le pass Hypnose ouvre un droit : les écrans d'hypnose le lisent dans les droits.
        if (v.objet === 'option_hypnose') await rechargerDroits?.()
      }
      return v
    },
    [recharger, rechargerDroits],
  )

  const traiterRetour = useCallback(
    async (session: string) => {
      setRetour({ ton: 'attente', texte: 'Vérification de votre paiement auprès de Stripe…' })
      try {
        const dit = retourDit(await verifier(session))
        if (dit.attente) {
          // Pas encore de verdict : la session reste, dans l'écran ET dans l'adresse.
          setRetour({ ton: 'warn', texte: dit.texte, session })
          return
        }
        setRetour({ ton: dit.ton, texte: dit.texte })
        oublierLeRetour()
      } catch (err) {
        // Une panne n'est pas un verdict : rien n'est oublié, un rechargement revérifie.
        setRetour({ ton: 'warn', texte: (err as Error).message, session })
      }
    },
    [verifier],
  )

  useEffect(() => {
    if (!actif || retourLu.current || typeof window === 'undefined') return
    const lu = lireRetourDePaiement(window.location.search)
    if (!lu) return
    retourLu.current = true
    if ('annule' in lu) {
      oublierLeRetour()
      setRetour({ ton: 'warn', texte: "Paiement abandonné : rien n'a été débité, rien n'a été crédité." })
      return
    }
    void traiterRetour(lu.session)
  }, [actif, traiterRetour])

  const reverifier = useCallback(async () => {
    if (retour?.session) await traiterRetour(retour.session)
  }, [retour?.session, traiterRetour])

  const acheter = useCallback(async (choix: { recharge: string } | { option: 'hypnose' }) => {
    try {
      const { url } = await acheterJetons(choix)
      // L'adresse vient du serveur, qui la tient de Stripe : on n'ouvre qu'une page sûre.
      if (!/^https:\/\//.test(url)) return "La page de paiement n'a pas pu s'ouvrir. Réessayez dans un instant."
      window.location.assign(url)
      return null
    } catch (err) {
      return (err as Error).message
    }
  }, [])

  const data: JetonsData = {
    etat,
    chargement,
    erreur,
    mode: etat?.mode ?? null,
    solde: etat ? etat.solde : null,
    bareme: etat?.bareme ?? null,
    hypnose: etat?.hypnose ?? null,
    recharges: etat?.recharges ?? [],
    optionHypnose: etat?.optionHypnose ?? null,
    paiementPossible: etat?.paiementPossible === true,
    retour,
    // Fermer l'avis, c'est renoncer à revérifier d'ici : le serveur, lui, s'en chargera.
    effacerRetour: () => {
      setRetour(null)
      oublierLeRetour()
    },
    reverifier,
    recharger,
    acheter,
    verifier,
  }

  return createElement(Ctx.Provider, { value: data }, children)
}

/** Les jetons, ou null hors de tout fournisseur (démonstration, banc de rendu). */
export function useJetons(): JetonsData | null {
  return useContext(Ctx)
}

/** Le cabinet paie-t-il ses analyses en jetons ? Faux tant qu'on ne le sait pas. */
export function enJetons(data: JetonsData | null): boolean {
  return data?.mode === 'jetons'
}

/**
 * Ce qu'une action coûtera, pour l'écran qui la propose. Null hors du mode
 * jetons — ou tant qu'il n'est pas lu : l'écran garde alors ses textes
 * d'avant. `compris` : l'action est déjà payée par le forfait d'une séance.
 */
export function useDevis(action: ActionJetons, compris = false): Devis | null {
  return devisJetons(useJetons()?.etat ?? null, action, compris)
}

/**
 * L'actualisation du profil tirée de cette séance est-elle encore comprise ?
 *
 * LA BASE LE DIT, pas l'écran. Une séance comprend UNE actualisation, et
 * seulement si son brouillon a été payé : annoncer « incluse » dès qu'une
 * séance existe faisait payer sans prévenir la seconde, et celle d'une séance
 * analysée avant les jetons. Relue à chaque relecture de l'état — donc après
 * chaque analyse, qui émet `klaro:jetons`. Faux tant qu'on ne sait pas : on
 * annonce alors le prix plein, jamais une gratuité qui n'en serait pas une.
 */
export function useProfilCompris(seance: string | null): boolean {
  const jetons = useJetons()
  const modeJetons = jetons?.mode === 'jetons'
  const etat = jetons?.etat ?? null
  const [lu, setLu] = useState<{ seance: string; compris: boolean } | null>(null)
  useEffect(() => {
    if (!modeJetons || !seance) return
    let vivant = true
    devisDuProfil(seance)
      .then((d) => {
        if (vivant) setLu({ seance, compris: d.profilCompris === true })
      })
      .catch(() => {
        if (vivant) setLu({ seance, compris: false })
      })
    return () => {
      vivant = false
    }
    // `etat` : chaque relecture (après une analyse, au retour sur l'onglet) redemande.
  }, [modeJetons, seance, etat])
  return Boolean(modeJetons && seance && lu?.seance === seance && lu.compris)
}
