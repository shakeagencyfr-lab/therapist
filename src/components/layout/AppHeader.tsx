import { useState, type CSSProperties } from 'react'
import { Marque, Segmented } from '@/components/ui'
import { useMaybeAuth } from '@/auth/session'
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
  { value: 'boutique', label: 'Boutique' },
  { value: 'marque', label: 'Marque' },
  { value: 'integrations', label: 'Intégrations' },
]

const SPACES: Array<{ value: Space; label: string }> = [
  { value: 'cabinet', label: 'Cabinet' },
  { value: 'reseller', label: 'Revendeur' },
]

/** Deux ou trois initiales, à défaut d'un vrai logo. */
function initiales(nom: string): string {
  return (
    nom
      .split(/\s+/)
      .filter((mot) => /[A-Za-zÀ-ÿ]/.test(mot))
      .slice(-2)
      .map((mot) => mot[0]?.toUpperCase() ?? '')
      .join('') || 'CB'
  )
}

export function AppHeader() {
  const { state, set } = useStore()
  const reseller = state.space === 'reseller'

  // L'en-tête porte la marque de qui est connecté : c'est là que la marque
  // blanche se voit en premier. Sans session — démonstration publique, banc
  // de rendu — on retombe sur le cabinet fictif.
  const auth = useMaybeAuth()
  const identite = auth?.context ?? null

  const enseigne = identite?.reseller
  const monCabinet = identite?.cabinet
  const fictif = cabinetById(state, state.rSel)

  const cabinet = monCabinet
    ? {
        name: monCabinet.name,
        tagline: monCabinet.tagline,
        branding: monCabinet.branding,
      }
    : { name: fictif.name, tagline: fictif.tagline, branding: fictif.branding }

  const marqueRevendeur = enseigne?.name ?? 'Shake'
  const logoRevendeur = initiales(marqueRevendeur)

  // Le commutateur d'espace vient du prototype, où il servait de présentoir.
  // Dans le produit, l'espace découle du rôle : on ne l'affiche qu'aux comptes
  // qui portent réellement les deux — un revendeur qui est aussi praticienne.
  // Sans session (démonstration publique), on le garde : c'est ce qui permet
  // de montrer tous les écrans.
  const deuxRoles = Boolean(enseigne && monCabinet)
  const montrerCommutateur = !identite || deuxRoles

  return (
    <header
      className={s.header}
      style={reseller ? undefined : ({ '--c-accent': cabinet.branding.accent } as CSSProperties)}
    >
      <div className={s.brand}>
        <Marque
          className={s.logo}
          logo={reseller ? logoRevendeur : cabinet.branding.logo}
          url={reseller ? null : cabinet.branding.logoUrl}
        />
        <div className={s.names}>
          <span className={s.cabinet}>{reseller ? marqueRevendeur : cabinet.name}</span>
          <span className={s.tagline}>{reseller ? 'Espace revendeur' : cabinet.tagline}</span>
        </div>
      </div>
      <div className={s.right}>
        {!reseller && (
          <Segmented options={VIEWS} value={state.mode} onChange={(mode) => set({ mode })} />
        )}
        {montrerCommutateur && (
          <Segmented options={SPACES} value={state.space} onChange={(space) => set({ space })} />
        )}
      </div>
      {/* Hors de la rangée qui défile : un menu posé dans un conteneur à
          débordement caché serait rogné sur écran étroit. */}
      <Compte
        initiales={reseller ? logoRevendeur : cabinet.branding.logo}
        logoUrl={reseller ? null : cabinet.branding.logoUrl}
        email={identite?.email ?? null}
        role={reseller ? marqueRevendeur : cabinet.name}
        seDeconnecter={auth?.seDeconnecter}
      />
    </header>
  )
}

/**
 * Le compte connecté, et la porte de sortie.
 *
 * Sans session — démonstration publique, banc de rendu — il ne reste que les
 * initiales : il n'y a rien à quitter. Le voile derrière le menu ferme au
 * premier clic ailleurs, sans écouteur posé sur le document.
 */
function Compte({
  initiales,
  logoUrl,
  email,
  role,
  seDeconnecter,
}: {
  initiales: string
  logoUrl?: string | null
  email: string | null
  role: string
  seDeconnecter?: () => Promise<void>
}) {
  const [ouvert, setOuvert] = useState(false)

  if (!seDeconnecter) return <Marque className={s.me} logo={initiales} url={logoUrl} />

  return (
    <div className={s.compte}>
      <button
        type="button"
        className={s.me}
        onClick={() => setOuvert((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label="Votre compte"
      >
        {logoUrl ? <Marque className={s.meImage} logo={initiales} url={logoUrl} /> : initiales}
      </button>

      {ouvert ? (
        <>
          <button
            type="button"
            className={s.voile}
            aria-label="Fermer le menu du compte"
            onClick={() => setOuvert(false)}
          />
          <div className={s.menu} role="menu">
            <div className={s.menuTete}>
              <span className={s.menuRole}>{role}</span>
              {email ? <span className={s.menuMail}>{email}</span> : null}
            </div>
            <button
              type="button"
              className={s.menuItem}
              role="menuitem"
              onClick={() => {
                setOuvert(false)
                void seDeconnecter()
              }}
            >
              Se déconnecter
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
