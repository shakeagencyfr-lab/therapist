import type { ViewMode } from '@/state/state'
import s from './NavigationBas.module.css'

/**
 * La barre du bas de l'espace du cabinet, sur un téléphone.
 *
 * POURQUOI EN BAS. Sur un téléphone, tout passait par le menu de l'en-tête :
 * deux gestes, en haut de l'écran, hors de portée du pouce, pour aller d'une
 * fiche à la séance. Les quatre écrans de tous les jours — les patients, la
 * séance, l'atelier, les notifications — sont désormais à un geste, là où
 * tombe le pouce ; le reste (audios, aperçu, réglages, compte) est derrière
 * « Plus », qui ouvre le menu de l'en-tête.
 *
 * Elle n'existe qu'au-dessous de 640 pixels (la feuille de style la cache
 * ailleurs) et jamais pendant qu'une séance s'enregistre : un doigt qui
 * glisse ne doit pas quitter l'écran du micro.
 */
type Entree = { vue: ViewMode; libelle: string; icone: NomIcone }

const ENTREES: readonly Entree[] = [
  { vue: 'therapist', libelle: 'Patients', icone: 'patients' },
  { vue: 'session', libelle: 'Séance', icone: 'seance' },
  { vue: 'atelier', libelle: 'Atelier', icone: 'atelier' },
  { vue: 'notif', libelle: 'Notifications', icone: 'notif' },
]

/** Les vues que « Plus » regroupe : il s'allume quand l'une d'elles est ouverte. */
export function vueDansPlus(vue: ViewMode): boolean {
  return !ENTREES.some((e) => e.vue === vue)
}

/**
 * Un nouvel appui sur « Patients » quand la fiche est déjà ouverte : la
 * liste des patients s'ouvre (le tiroir de TherapistView l'écoute). C'est le
 * geste qu'on attend d'un onglet déjà actif.
 */
export const EVENEMENT_LISTE_PATIENTS = 'klaro:liste-patients'

export function NavigationBas({
  vue,
  masquee,
  plusOuvert,
  onVue,
  onPlus,
}: {
  vue: ViewMode
  masquee: boolean
  plusOuvert: boolean
  onVue: (vue: ViewMode) => void
  onPlus: () => void
}) {
  if (masquee) return null
  return (
    <nav className={s.barre} aria-label="Navigation principale">
      {ENTREES.map((e) => {
        /* Le menu « Plus » ouvert, c'est lui seul qui s'allume. */
        const active = e.vue === vue && !plusOuvert
        return (
          <button
            key={e.vue}
            type="button"
            className={active ? `${s.entree} ${s.entreeOn}` : s.entree}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              if (e.vue === vue && !plusOuvert && e.vue === 'therapist') {
                window.dispatchEvent(new CustomEvent(EVENEMENT_LISTE_PATIENTS))
                return
              }
              onVue(e.vue)
            }}
          >
            <Icone nom={e.icone} />
            <span className={s.libelle}>{e.libelle}</span>
          </button>
        )
      })}
      <button
        type="button"
        className={vueDansPlus(vue) || plusOuvert ? `${s.entree} ${s.entreeOn}` : s.entree}
        aria-haspopup="menu"
        aria-expanded={plusOuvert}
        onClick={onPlus}
      >
        <Icone nom="plus" />
        <span className={s.libelle}>Plus</span>
      </button>
    </nav>
  )
}

type NomIcone = 'patients' | 'seance' | 'atelier' | 'notif' | 'plus'

const TRAIT = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Dessinées au trait, comme celles de l'espace patient : à vingt-deux pixels, un aplat fait tache. */
function Icone({ nom }: { nom: NomIcone }) {
  return (
    <svg viewBox="0 0 24 24" className={s.icone} aria-hidden focusable="false" {...TRAIT}>
      {nom === 'patients' ? (
        <>
          <circle cx="9" cy="8.5" r="3.2" />
          <path d="M3.5 19c.6-3.1 2.8-5 5.5-5s4.9 1.9 5.5 5" />
          <path d="M15.5 5.6a3 3 0 0 1 0 5.8" />
          <path d="M17.2 14.3c1.9.5 3 2.2 3.3 4.7" />
        </>
      ) : nom === 'seance' ? (
        <>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
          <path d="M12 17.5V21" />
        </>
      ) : nom === 'atelier' ? (
        <>
          <path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z" />
          <path d="M13.5 7.5l3 3" />
        </>
      ) : nom === 'notif' ? (
        <>
          <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5z" />
          <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
        </>
      ) : (
        <>
          <circle cx="5.5" cy="12" r="1.3" />
          <circle cx="12" cy="12" r="1.3" />
          <circle cx="18.5" cy="12" r="1.3" />
        </>
      )}
    </svg>
  )
}
