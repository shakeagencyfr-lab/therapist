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


  // Les statistiques ne sont montées qu'avec un patient.
  if (!p) return null

  return (
    <div className={s.row}>
      <StatCard label="Assiduité" value={p.adherence} unit="%" progress={p.adherence} />
      {/* Le compteur est un total depuis l'ouverture de la fiche : l'ancien
          libellé « cette semaine » promettait une fenêtre que rien ne calcule. */}
      <StatCard
        label="Écoutes audio"
        value={p.listens}
        unit="au total"
        progress={Math.min(100, p.listens * 8)}
      />
      {/* Sans nombre de séances prévu, « 1 / 0 » ne veut rien dire : on
          montre les séances faites, et rien d'autre. */}
      <StatCard
        label="Séances"
        value={p.totalSessions > 0 ? `${p.sessions} / ${p.totalSessions}` : p.sessions}
        unit={p.totalSessions > 0 ? undefined : 'réalisées'}
        progress={p.totalSessions > 0 ? pct(p.sessions, p.totalSessions) : 0}
      />
      {/* « Modules du jour » comptait tout le parcours depuis l'ouverture de
          la fiche : rien, dans ce produit, ne découpe les exercices par jour.
          Ce sont les exercices de son parcours actuel — les retirés n'y
          comptent plus —, faits sur le total. */}
      <StatCard
        label="Exercices faits"
        value={done}
        unit={`sur ${total} au parcours`}
        progress={pct(done, total)}
      />
    </div>
  )
}
