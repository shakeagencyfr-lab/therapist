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

  return (
    <Card padded={false} className={s.card}>
      <div className={s.head}>
        <Title>{p.scaleLabel}</Title>
        <span className={s.delta}>{p.scaleDelta}</span>
      </div>
      <p className={s.sub}>Auto-évaluation quotidienne, échelle de 0 à 10</p>

      <svg
        className={s.chart}
        viewBox="0 0 300 90"
        role="img"
        aria-label={`${p.scaleLabel} — ${p.scaleDelta}`}
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
