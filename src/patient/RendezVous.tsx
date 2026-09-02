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
  // Le widget est ce que la thérapeute a choisi de montrer : il est là en
  // arrivant. Le repli reste offert, il n'est plus l'état de départ — une
  // patiente qui ouvre son espace ne devine pas qu'un agenda dort derrière un
  // chevron.
  const [ouvert, setOuvert] = useState(true)
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
          {/* Le cadre reste monté quoi qu'il arrive. Le démonter au bout de
              huit secondes privait d'agenda quiconque a une connexion lente,
              et sans retour possible. La phrase de secours se pose sous lui. */}
          <iframe
            className={s.frame}
            src={cadre}
            title="Prise de rendez-vous"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setEtat('affiche')}
          />
          {etat === 'muet' ? (
            <p className={s.frameNote}>
              L'agenda tarde à s'afficher. S'il reste vide, ouvrez-le en plein écran : ce sont les
              mêmes créneaux.
            </p>
          ) : null}
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
