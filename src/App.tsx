import { AppHeader } from '@/components/layout/AppHeader'
import { useAppState } from '@/state/store'
import { TherapistView } from '@/views/therapist/TherapistView'
import { PatientView } from '@/views/patient/PatientView'
import { SessionView } from '@/views/session/SessionView'
import { AtelierView } from '@/views/atelier/AtelierView'
import { AudiosView } from '@/views/audios/AudiosView'
import { NotificationsView } from '@/views/notifications/NotificationsView'

/** Une seule vue est affichée à la fois, choisie par le commutateur de l'en-tête. */
export function App() {
  const { mode } = useAppState()
  return (
    <div>
      <AppHeader />
      {mode === 'therapist' && <TherapistView />}
      {mode === 'patient' && <PatientView />}
      {mode === 'session' && <SessionView />}
      {mode === 'atelier' && <AtelierView />}
      {mode === 'audios' && <AudiosView />}
      {mode === 'notif' && <NotificationsView />}
    </div>
  )
}
