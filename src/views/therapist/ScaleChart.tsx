import { Card, Title } from '@/components/ui'
import { chartPoints, patientOf, polylinePoints, scaleSeries } from '@/state/selectors'
import { useAppState } from '@/state/store'
import s from './ScaleChart.module.css'

/**
 * Courbe d'auto-évaluation : la série du programme, prolongée par les
 * valeurs saisies dans l'application patient pendant la session.
 */
export function ScaleChart() {
  const state = useAppState()
  const p = patientOf(state)
  const points = chartPoints(scaleSeries(state, state.sel))


  // La courbe n'est montée qu'avec un patient.
  if (!p) return null

  /* L'écart est calculé à l'assemblage de la fiche, depuis les notes datées
     (src/lib/echelle.ts) : « 8 → 3 en 3 semaines ». Il restait vide en
     production — la colonne qui devait le porter n'était écrite par aucun
     code. Sans note, l'en-tête le dit au lieu de laisser un blanc. */
  const ecart = p.scaleDelta || (points.length ? '' : "Aucune note du soir pour l'instant")

  return (
    <Card padded={false} className={s.card}>
      <div className={s.head}>
        <Title>{p.scaleLabel}</Title>
        {ecart ? <span className={s.delta}>{ecart}</span> : null}
      </div>
      {/* Le sous-titre porte la QUESTION que le patient lit chaque soir : elle
          dit ce que la courbe mesure, là où « échelle de 0 à 10 » ne disait
          rien. Non réglée, l'écran le dit et nomme l'endroit où le faire —
          le réglage existait, il était seulement invisible. */}
      <p className={s.sub}>
        {p.scaleQuestion
          ? `« ${p.scaleQuestion} » — chaque soir, de 0 à 10.`
          : 'Auto-évaluation quotidienne, de 0 à 10. Réglez son sujet et sa question du soir dans les réglages de la fiche.'}
      </p>

      <svg
        className={s.chart}
        viewBox="0 0 300 90"
        role="img"
        aria-label={ecart ? `${p.scaleLabel} — ${ecart}` : p.scaleLabel}
      >
        <line className={s.base} x1="0" y1="89" x2="300" y2="89" />
        <line className={s.mid} x1="0" y1="45" x2="300" y2="45" />
        <polyline className={s.line} points={polylinePoints(points)} />
        {points.map((pt, i) => (
          <circle className={s.dot} key={i} cx={pt.x} cy={pt.y} r="2.6" />
        ))}
      </svg>

      <div className={s.legend}>
        <span>Début du programme</span>
        <span>Aujourd'hui</span>
      </div>
    </Card>
  )
}
