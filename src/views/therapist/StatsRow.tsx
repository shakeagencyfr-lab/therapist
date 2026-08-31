import { StatCard } from '@/components/ui'
import { moduleProgress, patientOf } from '@/state/selectors'
import { useStore } from '@/state/store'
import s from './StatsRow.module.css'

/** Les quatre indicateurs de la fiche client. */
export function StatsRow() {
  const { state } = useStore()
  const p = patientOf(state)
  const { done, total } = moduleProgress(state, state.sel)
  const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

  return (
    <div className={s.row}>
      <StatCard label="Assiduité" value={p.adherence} unit="%" progress={p.adherence} />
      <StatCard
        label="Écoutes audio"
        value={p.listens}
        unit="cette semaine"
        progress={Math.min(100, p.listens * 8)}
      />
      <StatCard
        label="Séances"
        value={`${p.sessions} / ${p.totalSessions}`}
        progress={pct(p.sessions, p.totalSessions)}
      />
      <StatCard
        label="Modules du jour"
        value={done}
        unit={`sur ${total}`}
        progress={pct(done, total)}
      />
    </div>
  )
}
