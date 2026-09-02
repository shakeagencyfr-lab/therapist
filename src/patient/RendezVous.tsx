import { useEffect, useState } from 'react'
import s from './PatientSpace.module.css'

interface Props {
  /** Page publique de réservation : c'est elle qu'ouvre le bouton. */
  url: string
  /** Adresse du widget, tirée du code d'intégration de l'agenda. */
  widgetUrl?: string | null
  /** Ce que la thérapeute a choisi dans ses intégrations. */
  mode: 'bouton' | 'widget'
  accent?: string
}

/**
 * Prendre rendez-vous, au bas de la journée — sous le journal, là où on
 * regarde une fois le reste fait.
 *
 * Deux formes, réglées par la thérapeute. Un bouton qui ouvre son agenda dans
 * un nouvel onglet : ça marche avec n'importe quel logiciel, sans réglage. Ou
 * son widget, qui se déplie ici même, sans quitter l'espace.
 *
 * Le cadre n'est monté qu'au dépliement : on ne charge pas l'agenda d'un
 * tiers, ni ses cookies, sur une page que la patiente ouvre chaque soir pour
 * répondre à une question. Et le lien de secours reste sous le cadre, car un
 * agenda qui refuse d'être encadré ne le dit pas — il reste blanc.
 */
/** Calendrier, du même trait que le livre du journal. */
function IconeAgenda({ accent }: { accent?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={s.rdvIcon}
      fill="none"
      stroke={accent ?? 'var(--c-accent)'}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2.6" />
      <path d="M3.4 10 H 20.6" />
      <path d="M8.2 3.4 V 6.6" />
      <path d="M15.8 3.4 V 6.6" />
      <circle cx="12" cy="15.2" r="1.5" fill={accent ?? 'var(--c-accent)'} stroke="none" />
    </svg>
  )
}

export function RendezVous({ url, widgetUrl, mode, accent }: Props) {
  const cadre = mode === 'widget' ? (widgetUrl ?? url) : null
  const [ouvert, setOuvert] = useState(false)
  const [etat, setEtat] = useState<'chargement' | 'affiche' | 'muet'>('chargement')

  useEffect(() => {
    if (!ouvert) return
    setEtat('chargement')
    const t = window.setTimeout(() => setEtat((e) => (e === 'chargement' ? 'muet' : e)), 8000)
    return () => window.clearTimeout(t)
  }, [ouvert, cadre])

  // Le bouton seul : rien à déplier, l'agenda s'ouvre ailleurs.
  if (!cadre) {
    return (
      <section className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.deplieTitre}>
            <IconeAgenda accent={accent} />
            <span className={s.sectionTitle}>Prendre rendez-vous</span>
          </span>
        </div>
        <a
          className={s.cta}
          href={url}
          target="_blank"
          rel="noreferrer"
          style={accent ? { background: accent } : undefined}
        >
          Choisir mon créneau ↗
        </a>
        <p className={s.frameNote}>L'agenda de votre thérapeute s'ouvre dans un nouvel onglet.</p>
      </section>
    )
  }

  return (
    <section className={s.section}>
      <button
        type="button"
        className={s.deplie}
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
      >
        <span className={s.deplieTitre}>
          <IconeAgenda accent={accent} />
          <span className={s.sectionTitle}>Prendre rendez-vous</span>
        </span>
        <span className={ouvert ? `${s.chevron} ${s.chevronOn}` : s.chevron} aria-hidden>
          ›
        </span>
      </button>

      {ouvert ? (
        <>
          {etat !== 'muet' ? (
            <iframe
              className={s.frame}
              src={cadre}
              title="Prise de rendez-vous"
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => setEtat('affiche')}
            />
          ) : (
            <p className={s.frameNote}>
              L'agenda ne s'affiche pas ici. Ouvrez-le dans un nouvel onglet : ce sont les mêmes
              créneaux.
            </p>
          )}
          <a
            className={s.cta}
            href={url}
            target="_blank"
            rel="noreferrer"
            style={accent ? { background: accent } : undefined}
          >
            Ouvrir en plein écran ↗
          </a>
        </>
      ) : (
        <p className={s.frameNote}>Choisissez votre créneau sans quitter cette page.</p>
      )}
    </section>
  )
}
