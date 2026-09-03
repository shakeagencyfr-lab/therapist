import { useState, type CSSProperties } from 'react'
import { Marque, Segmented } from '@/components/ui'
import { useMaybeAuth } from '@/auth/session'
import { cabinetById } from '@/state/resellerSelectors'
import { useStore } from '@/state/store'
import type { Space, ViewMode } from '@/state/state'
import s from './AppHeader.module.css'

/**
 * La navigation, en deux groupes.
 *
 * Dix pilules à plat, c'était une rangée qui défilait dès l'écran moyen et
 * mettait « Intégrations » au même niveau que « Séance ». Une praticienne
 * passe sa journée sur cinq écrans ; les cinq autres se règlent une fois.
 * Les premiers restent à plat, les seconds vivent derrière « Réglages ».
 *
 * L'aperçu de l'application patiente n'est plus une entrée : il se lit
 * depuis la fiche de la patiente, à côté de son nom, là où il a un sens.
 */
const VUES: Array<{ value: ViewMode; label: string }> = [
  { value: 'therapist', label: 'Patientes' },
  { value: 'session', label: 'Séance' },
  { value: 'atelier', label: 'Atelier' },
  { value: 'audios', label: 'Audios' },
  { value: 'notif', label: 'Notifications' },
]

const REGLAGES: Array<{ value: ViewMode; label: string }> = [
  { value: 'programmes', label: 'Programmes' },
  { value: 'boutique', label: 'Boutique' },
  { value: 'marque', label: 'Marque' },
  { value: 'site', label: 'Site vitrine' },
  { value: 'integrations', label: 'Intégrations' },
]

/** Toutes les vues, pour le menu des petits écrans et le libellé courant. */
const VIEWS = [...VUES, { value: 'patient' as ViewMode, label: 'Aperçu patiente' }, ...REGLAGES]

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
      {/* Grand écran : les vues en pilules, à plat. */}
      <div className={s.right}>
        {!reseller && (
          <>
            <Segmented
              options={VUES}
              value={REGLAGES.some((r) => r.value === state.mode) || state.mode === 'patient' ? ('' as ViewMode) : state.mode}
              onChange={(mode) => set({ mode })}
            />
            <MenuReglages vues={REGLAGES} vue={state.mode} onVue={(mode) => set({ mode })} />
          </>
        )}
        {montrerCommutateur && (
          <Segmented options={SPACES} value={state.space} onChange={(space) => set({ space })} />
        )}
      </div>

      {/* Hors de la rangée qui défile : un panneau posé dans un conteneur à
          débordement caché serait rogné sur écran étroit. */}
      <Compte
        initiales={reseller ? logoRevendeur : cabinet.branding.logo}
        logoUrl={reseller ? null : cabinet.branding.logoUrl}
        email={identite?.email ?? null}
        role={reseller ? marqueRevendeur : cabinet.name}
        seDeconnecter={auth?.seDeconnecter}
      />

      {/* Téléphone : neuf pilules dans une rangée qui défile, ce sont huit
          vues qu'on ne voit pas. Un menu les montre toutes. */}
      <MenuMobile
        vues={reseller ? [] : VIEWS}
        vue={state.mode}
        espaces={montrerCommutateur ? SPACES : []}
        espace={state.space}
        role={reseller ? marqueRevendeur : cabinet.name}
        email={identite?.email ?? null}
        onVue={(mode) => set({ mode })}
        onEspace={(space) => set({ space })}
        seDeconnecter={auth?.seDeconnecter}
      />
    </header>
  )
}

/**
 * Les réglages, derrière un seul bouton.
 *
 * Il prend le nom de la vue ouverte quand c'en est une : on sait où l'on est
 * sans dérouler, et le bouton reste allumé tant qu'on y est.
 */
function MenuReglages({
  vues,
  vue,
  onVue,
}: {
  vues: Array<{ value: ViewMode; label: string }>
  vue: ViewMode
  onVue: (v: ViewMode) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const courante = vues.find((v) => v.value === vue)

  return (
    <div className={s.reglages}>
      <button
        type="button"
        className={courante ? `${s.reglagesBtn} ${s.reglagesBtnOn}` : s.reglagesBtn}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
      >
        {courante ? courante.label : 'Réglages'}
        <span className={s.reglagesChevron} aria-hidden>
          ▾
        </span>
      </button>
      {ouvert ? (
        <>
          <button type="button" className={s.voile} aria-label="Fermer les réglages" onClick={() => setOuvert(false)} />
          <div className={s.menu} role="menu">
            {vues.map((v) => (
              <button
                key={v.value}
                type="button"
                role="menuitem"
                className={v.value === vue ? `${s.menuItem} ${s.menuItemOn}` : s.menuItem}
                onClick={() => {
                  onVue(v.value)
                  setOuvert(false)
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

/**
 * Le menu des petits écrans.
 *
 * Il ne double pas la navigation : il la remplace sous 900 px, où la rangée
 * de pilules ne montrait que deux vues sur neuf et demandait de deviner
 * qu'elle défilait. Tout y tient à plat — les vues, l'espace quand le compte
 * en porte deux, le compte lui-même et sa sortie — parce qu'un menu qu'il
 * faut parcourir en plusieurs gestes n'est pas un progrès.
 */
function MenuMobile({
  vues,
  vue,
  espaces,
  espace,
  role,
  email,
  onVue,
  onEspace,
  seDeconnecter,
}: {
  vues: Array<{ value: ViewMode; label: string }>
  vue: ViewMode
  espaces: Array<{ value: Space; label: string }>
  espace: Space
  role: string
  email: string | null
  onVue: (v: ViewMode) => void
  onEspace: (e: Space) => void
  seDeconnecter?: () => Promise<void>
}) {
  const [ouvert, setOuvert] = useState(false)
  const courante = vues.find((v) => v.value === vue)

  return (
    <div className={s.mobile}>
      <button
        type="button"
        className={s.burger}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
      >
        <span className={s.burgerLabel}>{courante?.label ?? 'Menu'}</span>
        <span className={ouvert ? `${s.burgerTrait} ${s.burgerTraitOn}` : s.burgerTrait} aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </button>

      {ouvert ? (
        <>
          <button
            type="button"
            className={s.voile}
            aria-label="Fermer le menu"
            onClick={() => setOuvert(false)}
          />
          <div className={s.panneau} role="menu">
            {vues
              .filter((v) => !REGLAGES.some((r) => r.value === v.value))
              .map((v) => (
                <button
                  key={v.value}
                  type="button"
                  role="menuitem"
                  className={v.value === vue ? `${s.panneauItem} ${s.panneauItemOn}` : s.panneauItem}
                  aria-current={v.value === vue ? 'page' : undefined}
                  onClick={() => {
                    onVue(v.value)
                    setOuvert(false)
                  }}
                >
                  {v.label}
                </button>
              ))}

            {vues.some((v) => REGLAGES.some((r) => r.value === v.value)) ? (
              <div className={s.panneauGroupe}>
                <span className={s.panneauTitre}>Réglages</span>
                {REGLAGES.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    role="menuitem"
                    className={v.value === vue ? `${s.panneauItem} ${s.panneauItemOn}` : s.panneauItem}
                    onClick={() => {
                      onVue(v.value)
                      setOuvert(false)
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            ) : null}

            {espaces.length > 0 ? (
              <div className={s.panneauGroupe}>
                <span className={s.panneauTitre}>Espace</span>
                {espaces.map((e) => (
                  <button
                    key={e.value}
                    type="button"
                    role="menuitem"
                    className={e.value === espace ? `${s.panneauItem} ${s.panneauItemOn}` : s.panneauItem}
                    onClick={() => {
                      onEspace(e.value)
                      setOuvert(false)
                    }}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            ) : null}

            {seDeconnecter ? (
              <div className={s.panneauGroupe}>
                <span className={s.panneauTitre}>{role}</span>
                {email ? <span className={s.panneauMail}>{email}</span> : null}
                <button
                  type="button"
                  role="menuitem"
                  className={s.panneauItem}
                  onClick={() => {
                    setOuvert(false)
                    void seDeconnecter()
                  }}
                >
                  Se déconnecter
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
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
