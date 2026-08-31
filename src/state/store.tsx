import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { type AppState, initialState } from './state'

/** Mise à jour partielle de l'état, valeur ou fonction du précédent. */
export type StatePatch = Partial<AppState> | ((prev: AppState) => Partial<AppState>)

export interface AppStore {
  state: AppState
  /** Fusionne un correctif dans l'état, à la manière de `setState`. */
  set: (patch: StatePatch) => void
  /** Lecture de l'état courant hors rendu (timers, callbacks asynchrones). */
  read: () => AppState
}

const StoreContext = createContext<AppStore | null>(null)

export function AppStoreProvider({
  children,
  initial,
}: {
  children: ReactNode
  initial?: Partial<AppState>
}) {
  const [state, setState] = useState<AppState>(() => ({ ...initialState, ...initial }))
  const ref = useRef(state)
  ref.current = state

  const set = useCallback((patch: StatePatch) => {
    setState((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))
  }, [])

  const read = useCallback(() => ref.current, [])

  const store = useMemo<AppStore>(() => ({ state, set, read }), [state, set, read])
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): AppStore {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore doit être utilisé dans <AppStoreProvider>')
  return store
}

/** Raccourci de lecture seule. */
export function useAppState(): AppState {
  return useStore().state
}

/** Raccourci d'écriture seule. */
export function useSetState(): (patch: StatePatch) => void {
  return useStore().set
}
