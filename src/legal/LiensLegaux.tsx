import type { CSSProperties } from 'react'
import { LIENS_LEGAUX } from './chemins'
import s from './LiensLegaux.module.css'

/**
 * Les trois liens vers les pages légales de la plateforme, en pied d'écran.
 *
 * Posés sur toutes les portes : l'écran de connexion (cabinet et patient),
 * le pied de l'espace patient, le widget que les cabinets encadrent sur leur
 * site, et le pied de leur page publique. Ce module ne tire que les chemins
 * (./chemins) : aucune de ces surfaces ne télécharge le texte des pages.
 *
 * UN NOUVEL ONGLET PAR DÉFAUT, ET CE N'EST PAS UN CAPRICE.
 *   - Dans le widget, c'est la seule façon de sortir du cadre : une page
 *     légale lue dans 360 pixels de haut, sur le site de quelqu'un d'autre,
 *     ne se lit pas.
 *   - Dans l'espace patient installé sur un téléphone, il n'y a pas de bouton
 *     « précédent » : ouverte à la place de l'espace, la page n'aurait plus
 *     de chemin de retour que le sien.
 *   - Sur la porte, un courriel vient souvent de partir : quitter l'écran
 *     ferait perdre la saisie du code qu'on attend.
 * La mention « nouvel onglet » est dite aux lecteurs d'écran, qui ne voient
 * pas l'onglet s'ouvrir.
 */
export function LiensLegaux({
  court = false,
  nouvelOnglet = true,
  gauche = false,
  intro,
  className,
  style,
}: {
  /** Les libellés courts — « Conditions » plutôt que « Conditions d'utilisation ». */
  court?: boolean
  nouvelOnglet?: boolean
  /** Alignés à gauche, pour un pied qui l'est déjà (la page d'un cabinet). */
  gauche?: boolean
  /** Une amorce avant les liens, quand le contexte ne dit pas de quoi ils parlent. */
  intro?: string
  className?: string
  style?: CSSProperties
}) {
  const classes = [s.liens, gauche ? s.gauche : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <nav className={classes} style={style} aria-label="Informations légales">
      {intro ? <span className={s.intro}>{intro}</span> : null}
      <ul className={s.liste}>
        {LIENS_LEGAUX.map((l) => (
          <li key={l.cle} className={s.element}>
            <a
              className={s.lien}
              href={l.chemin}
              {...(nouvelOnglet ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {court ? l.court : l.libelle}
              {nouvelOnglet ? <span className={s.horsEcran}> (nouvel onglet)</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
