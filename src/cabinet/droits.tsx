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

/** Places restantes sur le plafond de fiches actives. null = sans limite. */
export function placesRestantes(droits: Droits | null): number | null {
  if (!droits || droits.maxPatients === null) return null
  return Math.max(0, droits.maxPatients - droits.patientesActives)
}
