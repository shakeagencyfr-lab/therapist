import type { CSSProperties } from 'react'
import { AppHeader } from '@/components/layout/AppHeader'
import { useMaybeAuth } from '@/auth/session'
import { useAppState } from '@/state/store'
import { TherapistView } from '@/views/therapist/TherapistView'
import { PatientView } from '@/views/patient/PatientView'
import { SessionView } from '@/views/session/SessionView'
import { AtelierView } from '@/views/atelier/AtelierView'
import { AudiosView } from '@/views/audios/AudiosView'
import { NotificationsView } from '@/views/notifications/NotificationsView'
import { ResellerSpace } from '@/views/reseller/ResellerSpace'
import { IntegrationsView } from '@/views/integrations/IntegrationsView'
import { BoutiqueView } from '@/views/boutique/BoutiqueView'
import { MarqueView } from '@/views/marque/MarqueView'
import { ProgrammesView } from '@/views/programmes/ProgrammesView'

/**
 * Deux espaces, deux métiers : la thérapeute suit ses patients, le revendeur
 * suit ses cabinets. Dans le produit réel, l'espace ouvert découle du rôle du
 * compte connecté, pas d'un commutateur.
 *
 * La marque du cabinet s'applique ici, sur le sous-arbre de son espace, et
 * non sur la racine du document : un compte qui porte les deux rôles ne doit
 * pas voir l'espace revendeur teinté aux couleurs de son cabinet.
 */
export function App() {
  const { mode, space } = useAppState()
  const cabinet = useMaybeAuth()?.context?.cabinet ?? null

  if (space === 'reseller') {
    return (
      <div>
        <AppHeader />
        <ResellerSpace />
      </div>
    )
  }

  const marque = cabinet?.branding
  const couleurs = marque
    ? ({
        '--c-accent': marque.accent,
        '--c-accent-hover': marque.accentHover,
        '--c-accent-deep': marque.accentDeep,
        '--c-dark': marque.dark,
      } as CSSProperties)
    : undefined

  return (
    <div style={couleurs}>
      <AppHeader />
      {mode === 'therapist' && <TherapistView />}
      {mode === 'patient' && <PatientView />}
      {mode === 'session' && <SessionView />}
      {mode === 'atelier' && <AtelierView />}
      {mode === 'audios' && <AudiosView />}
      {mode === 'notif' && <NotificationsView />}
      {mode === 'boutique' && <BoutiqueView />}
      {mode === 'programmes' && <ProgrammesView />}
      {mode === 'marque' && <MarqueView />}
      {mode === 'integrations' && <IntegrationsView />}
    </div>
  )
}
