import type { CSSProperties } from 'react'
import { Segmented } from '@/components/ui'
import { cabinetById } from '@/state/resellerSelectors'
import { useStore } from '@/state/store'
import type { Space, ViewMode } from '@/state/state'
import s from './AppHeader.module.css'

const VIEWS: Array<{ value: ViewMode; label: string }> = [
  { value: 'therapist', label: 'Vue thérapeute' },
  { value: 'patient', label: 'Vue patient' },
  { value: 'session', label: 'Séance' },
  { value: 'atelier', label: 'Atelier' },
  { value: 'audios', label: 'Audios' },
  { value: 'notif', label: 'Notifications' },
]

const SPACES: Array<{ value: Space; label: string }> = [
  { value: 'cabinet', label: 'Cabinet' },
  { value: 'reseller', label: 'Revendeur' },
]

export function AppHeader() {
  const { state, set } = useStore()
  const reseller = state.space === 'reseller'

  // L'en-tête porte la marque du cabinet ouvert : c'est là que la marque
  // blanche se voit en premier. Côté revendeur, c'est sa propre enseigne.
  const cabinet = cabinetById(state, state.rSel)

  return (
    <header
      className={s.header}
      style={reseller ? undefined : ({ '--c-accent': cabinet.branding.accent } as CSSProperties)}
    >
      <div className={s.brand}>
        <div className={s.logo}>{reseller ? 'SH' : cabinet.branding.logo}</div>
        <div className={s.names}>
          <span className={s.cabinet}>{reseller ? 'Shake' : cabinet.name}</span>
          <span className={s.tagline}>{reseller ? 'Espace revendeur' : cabinet.tagline}</span>
        </div>
      </div>
      <div className={s.right}>
        {!reseller && (
          <Segmented options={VIEWS} value={state.mode} onChange={(mode) => set({ mode })} />
        )}
        <Segmented options={SPACES} value={state.space} onChange={(space) => set({ space })} />
        <div className={s.me}>{reseller ? 'SH' : cabinet.branding.logo}</div>
      </div>
    </header>
  )
}
