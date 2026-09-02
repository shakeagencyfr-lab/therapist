import { useEffect, useState } from 'react'
import s from './PatientSpace.module.css'

interface Props {
  /** Page publique de réservation : c'est elle qu'ouvre le bouton. */
  url: string
  /** Adresse du widget, quand le cabinet en a donné une distincte. */
  widgetUrl?: string | null
  /** Ce que la thérapeute a choisi dans ses intégrations. */
  mode: 'bouton' | 'widget'
  accent?: string
}

/**
 * Prendre rendez-vous, dans l'espace de la patiente.
 *
 * Deux façons, réglées par la thérapeute. Un bouton qui ouvre son agenda dans
 * un nouvel onglet — ça marche avec n'importe quel logiciel, sans réglage. Ou
 * son widget de réservation, encadré ici, pour qu'elle choisisse son créneau
 * sans quitter l'application.
 *
 * Le bouton reste affiché dans les deux cas, et ce n'est pas une redondance :
 * certains agendas refusent d'être encadrés (X-Frame-Options), et un
 * navigateur ne le dit pas proprement — le cadre reste blanc. Passé quelques
 * secondes sans signal, on cesse d'attendre et on l'explique.
 */
export function RendezVous({ url, widgetUrl, mode, accent }: Props) {
  const cadre = mode === 'widget' ? (widgetUrl ?? url) : null
  const [etat, setEtat] = useState<'chargement' | 'affiche' | 'muet'>('chargement')

  useEffect(() => {
    if (!cadre) return
    setEtat('chargement')
    const t = window.setTimeout(() => setEtat((e) => (e === 'chargement' ? 'muet' : e)), 8000)
    return () => window.clearTimeout(t)
  }, [cadre])

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <span className={s.sectionTitle}>Prendre rendez-vous</span>
      </div>

      {cadre && etat !== 'muet' ? (
        <iframe
          className={s.frame}
          src={cadre}
          title="Prise de rendez-vous"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setEtat('affiche')}
        />
      ) : null}

      {cadre && etat === 'muet' ? (
        <p className={s.frameNote}>
          L'agenda ne s'affiche pas ici. Ouvrez-le dans un nouvel onglet : c'est le même agenda,
          avec les mêmes créneaux.
        </p>
      ) : null}

      <a
        className={s.cta}
        href={url}
        target="_blank"
        rel="noreferrer"
        style={accent ? { background: accent } : undefined}
      >
        {cadre ? 'Ouvrir la réservation en plein écran ↗' : 'Choisir mon créneau ↗'}
      </a>

      {cadre && etat === 'affiche' ? (
        <p className={s.frameNote}>
          Si le cadre ci-dessus reste vide, le bouton ouvre la même page en plein écran.
        </p>
      ) : null}
      {!cadre ? (
        <p className={s.frameNote}>
          L'agenda de votre thérapeute s'ouvre dans un nouvel onglet.
        </p>
      ) : null}
    </section>
  )
}
