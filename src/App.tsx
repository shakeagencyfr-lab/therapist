import { AppHeader } from '@/components/layout/AppHeader'
import { useAppState } from '@/state/store'
import { TherapistView } from '@/views/therapist/TherapistView'
import { PatientView } from '@/views/patient/PatientView'
import { SessionView } from '@/views/session/SessionView'
import { AtelierView } from '@/views/atelier/AtelierView'
import { AudiosView } from '@/views/audios/AudiosView'
import { NotificationsView } from '@/views/notifications/NotificationsView'
import { ResellerSpace } from '@/views/reseller/ResellerSpace'

/**
 * Deux espaces, deux métiers : la thérapeute suit ses patients, le revendeur
 * suit ses cabinets. Dans le produit réel, l'espace ouvert découle du rôle du
 * compte connecté, pas d'un commutateur.
 */
export function App() {
  const { mode, space } = useAppState()
  return (
    <div>
      <AppHeader />
      {space === 'reseller' && <ResellerSpace />}
      {space === 'cabinet' && mode === 'therapist' && <TherapistView />}
      {space === 'cabinet' && mode === 'patient' && <PatientView />}
      {space === 'cabinet' && mode === 'session' && <SessionView />}
      {space === 'cabinet' && mode === 'atelier' && <AtelierView />}
      {space === 'cabinet' && mode === 'audios' && <AudiosView />}
      {space === 'cabinet' && mode === 'notif' && <NotificationsView />}
    </div>
  )
}
