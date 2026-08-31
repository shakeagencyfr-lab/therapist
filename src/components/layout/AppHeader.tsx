import { Segmented } from '@/components/ui'
import { useStore } from '@/state/store'
import type { ViewMode } from '@/state/state'
import { defaultTheme } from '@/theme/theme'
import s from './AppHeader.module.css'

const VIEWS: Array<{ value: ViewMode; label: string }> = [
  { value: 'therapist', label: 'Vue thérapeute' },
  { value: 'patient', label: 'Vue patient' },
  { value: 'session', label: 'Séance' },
  { value: 'atelier', label: 'Atelier' },
  { value: 'audios', label: 'Audios' },
  { value: 'notif', label: 'Notifications' },
]

export function AppHeader() {
  const { state, set } = useStore()
  const theme = defaultTheme
  return (
    <header className={s.header}>
      <div className={s.brand}>
        <div className={s.logo}>{theme.logo}</div>
        <div className={s.names}>
          <span className={s.cabinet}>{theme.name}</span>
          <span className={s.tagline}>{theme.tagline}</span>
        </div>
      </div>
      <div className={s.right}>
        <Segmented options={VIEWS} value={state.mode} onChange={(mode) => set({ mode })} />
        <div className={s.me}>{theme.logo}</div>
      </div>
    </header>
  )
}
