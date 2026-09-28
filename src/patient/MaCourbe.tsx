import type { NoteDuSoir } from '@/lib/echelle'
import { courbeDuSoir, dateCourte, resumeCourbe } from './courbe'
import s from './MaCourbe.module.css'

const LARGEUR = 300
const HAUTEUR = 64

/**
 * Ses dernières notes du soir, en une ligne.
 *
 * Sous la question du soir, là où il vient de répondre : il voit où la note
 * d'aujourd'hui se place parmi les précédentes. Sobre — voir ./courbe.ts :
 * aucune couleur ne dit si la courbe va « bien » ou « mal ».
 */
export function MaCourbe({ notes, accent }: { notes: NoteDuSoir[]; accent?: string }) {
  const points = courbeDuSoir(notes, LARGEUR, HAUTEUR)
  if (points.length < 2) return null
  const premier = points[0]!
  const dernier = points[points.length - 1]!
  const couleur = accent || 'var(--c-accent)'

  return (
    <figure className={s.courbe}>
      <figcaption className={s.titre}>Vos dernières soirées</figcaption>
      <svg
        className={s.dessin}
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        role="img"
        aria-label={resumeCourbe(points)}
      >
        <line className={s.repere} x1="0" x2={LARGEUR} y1={HAUTEUR / 2} y2={HAUTEUR / 2} />
        <polyline
          fill="none"
          stroke={couleur}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        />
        {points.map((p, i) => (
          <circle
            key={p.date + i}
            cx={p.x}
            cy={p.y}
            r={i === points.length - 1 ? 3.5 : 2.2}
            fill={couleur}
          />
        ))}
      </svg>
      <div className={s.bornes} aria-hidden>
        <span>{dateCourte(premier.date)}</span>
        <span>{dateCourte(dernier.date)}</span>
      </div>
    </figure>
  )
}
