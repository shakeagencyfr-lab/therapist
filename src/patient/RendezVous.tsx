import { useEffect, useState } from 'react'
import s from './PatientSpace.module.css'

/**
 * Prendre rendez-vous : la page de réservation du cabinet (Trafft, ou un
 * autre agenda), dans l'espace de la patiente.
 *
 * Deux réalités à tenir ensemble. Certains agendas acceptent d'être
 * encadrés, d'autres l'interdisent (X-Frame-Options), et un navigateur ne
 * dit pas proprement lequel des deux vient d'arriver : le cadre reste blanc,
 * ou charge un message d'erreur. Le bouton « ouvrir dans un nouvel onglet »
 * est donc toujours là — c'est lui qui marche à coup sûr — et le cadre n'est
 * qu'un raccourci quand il fonctionne.
 */
export function RendezVous({ url, accent }: { url: string; accent?: string }) {
  const [etat, setEtat] = useState<'chargement' | 'affiche' | 'muet'>('chargement')

  // Passé un délai sans signal de chargement, on cesse d'attendre le cadre.
  useEffect(() => {
    setEtat('chargement')
    const t = window.setTimeout(() => setEtat((e) => (e === 'chargement' ? 'muet' : e)), 8000)
    return () => window.clearTimeout(t)
  }, [url])

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <span className={s.sectionTitle}>Prendre rendez-vous</span>
      </div>

      {etat !== 'muet' ? (
        <iframe
          className={s.frame}
          src={url}
          title="Prise de rendez-vous"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setEtat('affiche')}
        />
      ) : (
        <p className={s.frameNote}>
          L'agenda ne s'affiche pas ici. Ouvrez-le dans un nouvel onglet : c'est la même page, avec
          les mêmes créneaux.
        </p>
      )}

      <a
        className={s.cta}
        href={url}
        target="_blank"
        rel="noreferrer"
        style={accent ? { background: accent } : undefined}
      >
        Ouvrir la réservation dans un nouvel onglet ↗
      </a>
      {etat === 'affiche' ? (
        <p className={s.frameNote}>
          Si le cadre ci-dessus reste vide, le bouton ouvre la même page en plein écran.
        </p>
      ) : null}
    </section>
  )
}
