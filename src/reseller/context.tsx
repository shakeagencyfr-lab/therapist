/**
 * Les trois vues du revendeur lisent la même source.
 *
 * `ResellerSpace` appelle `useReseller()` une fois et le partage : sans cela,
 * chaque vue rechargerait le portefeuille de son côté, et un cabinet ouvert
 * dans l'une n'apparaîtrait pas dans l'autre.
 */
import { createContext, useContext, type ReactNode } from 'react'
import { useReseller, type ResellerData } from './useReseller'

const Ctx = createContext<ResellerData | null>(null)

export function ResellerProvider({ children }: { children: ReactNode }) {
  const data = useReseller()
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>
}

export function useResellerData(): ResellerData {
  const data = useContext(Ctx)
  if (!data) throw new Error('useResellerData doit être utilisé dans <ResellerProvider>')
  return data
}
