/**
 * Ce que l'offre du cabinet ouvre, partagé par les écrans.
 *
 * Un seul appel pour toute l'application : le plafond de fiches se lit dans
 * la colonne des patients, la boutique et le site vitrine s'ouvrent ou non
 * dans les réglages. Trois écrans qui interrogeraient chacun le serveur
 * finiraient par en donner trois versions le temps d'un changement d'offre.
 *
 * Sans cabinet — démonstration publique, banc de rendu — le fournisseur ne
 * charge rien et rend `null` : les écrans montrent alors tout, comme le reste
 * de la démonstration.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { lireDroits, type Droits } from '@/services/cabinet'
import { useRetour } from '@/lib/useRetour'

export interface DroitsData {
  droits: Droits | null
  chargement: boolean
  /** Après un changement d'offre ou l'archivage d'une fiche. */
  recharger: () => Promise<void>
}

const Ctx = createContext<DroitsData | null>(null)

export function DroitsProvider({ actif, children }: { actif: boolean; children: ReactNode }) {
  const [droits, setDroits] = useState<Droits | null>(null)
  const [chargement, setChargement] = useState(actif)

  const recharger = useCallback(async () => {
    if (!actif) {
      setDroits(null)
      setChargement(false)
      return
    }
    try {
      setDroits(await lireDroits())
    } catch {
      // Une offre illisible ne doit rien fermer : mieux vaut un écran complet
      // qu'un écran qui refuse ce que la cliente a payé.
      setDroits(null)
    }
    setChargement(false)
  }, [actif])

  useEffect(() => {
    void recharger()
  }, [recharger])

  /* CE QUI CHANGE PENDANT QU'ON REGARDE. Les droits n'étaient lus qu'une
     fois, au montage : le revendeur relevait le plafond, la thérapeute
     rappelait pour dire que « ça ne marche toujours pas », et il fallait
     recharger la page pour que le bouton se rouvre. L'essai qui expire, la
     boutique qu'on ouvre, l'offre qu'on change : rien de tout cela
     n'atteignait un onglet resté ouvert. Les deux autres fournisseurs se
     relisent au retour d'onglet depuis longtemps ; celui-ci ne le faisait
     pas. */
  useRetour(() => void recharger())

  return <Ctx.Provider value={{ droits, chargement, recharger }}>{children}</Ctx.Provider>
}

/** Les droits, ou null hors de tout fournisseur. */
export function useDroits(): DroitsData | null {
  return useContext(Ctx)
}

/**
 * Un levier est-il ouvert ?
 *
 * Sans droits chargés — démonstration, ou lecture en échec — on répond oui :
 * fermer par défaut ferait disparaître des écrans payés le temps d'un appel
 * réseau, ce qui est bien pire qu'un écran montré une seconde de trop.
 */
export function ouvert(data: DroitsData | null, levier: 'shop' | 'marqueBlanche' | 'site'): boolean {
  return data?.droits ? data.droits[levier] : true
}

/**
 * Le contrat du cabinet court-il ?
 *
 * Même prudence qu'`ouvert` : sans droits chargés on répond oui. Un écran de
 * cabinet barré d'un bandeau d'impayé le temps d'un appel réseau ferait plus
 * de dégâts qu'une seconde d'indulgence.
 */
export function enRegle(data: DroitsData | null): boolean {
  return data?.droits ? data.droits.enRegle : true
}

/** Places restantes sur le plafond de fiches actives. null = sans limite. */
export function placesRestantes(droits: Droits | null): number | null {
  if (!droits || droits.maxPatients === null) return null
  return Math.max(0, droits.maxPatients - droits.patientesActives)
}
