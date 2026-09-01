/**
 * Le dossier du cabinet, partagé par les écrans de l'espace thérapeute.
 *
 * Sans cabinet — démonstration publique, banc de rendu — le fournisseur ne
 * charge rien et les écrans gardent les fiches de démonstration déjà posées
 * dans l'état.
 */
import { createContext, useContext, type ReactNode } from 'react'
import { useCabinet, type CabinetData } from './useCabinet'

const Ctx = createContext<CabinetData | null>(null)

export function CabinetProvider({
  cabinetId,
  children,
}: {
  cabinetId: string | null
  children: ReactNode
}) {
  const data = useCabinet(cabinetId)
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>
}

/** Le dossier, ou null hors de tout fournisseur. */
export function useMaybeCabinet(): CabinetData | null {
  return useContext(Ctx)
}
