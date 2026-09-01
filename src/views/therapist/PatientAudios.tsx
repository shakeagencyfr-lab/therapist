import { Card, EmptyState, Title } from '@/components/ui'
import { patientOf } from '@/state/selectors'
import { useStore } from '@/state/store'
import s from './PatientAudios.module.css'

/**
 * Audios personnalisés du patient : ceux du dossier, suivis de ceux
 * envoyés depuis la bibliothèque du cabinet. Une ligne ouverte à la fois,
 * repérée par la clé `${patientId}:${index}`.
 */
export function PatientAudios() {
  const { state, set } = useStore()
  const key = state.sel
  const fiche = patientOf(state)
  // La carte n'est montée qu'avec une patiente ; le garde rend l'invariant
  // explicite plutôt que supposé.
  if (!fiche) return null
  const audios = fiche.audios.concat(state.extraAudios[key] ?? [])

  return (
    <Card padded={false} flush>
      <div className={s.head}>
        <Title>Audios personnalisés</Title>
        <p className={s.sub}>Enregistrés après séance, écoutables hors connexion</p>
      </div>

      {audios.length === 0 ? (
        <div className={s.emptyWrap}>
          <EmptyState>
            Aucun audio pour l'instant. Les enregistrements réalisés après séance
            arrivent ici, écoutables hors connexion.
          </EmptyState>
        </div>
      ) : (
        audios.map((a, i) => {
          const id = `${key}:${i}`
          const on = state.audioOn === id
          return (
            <button
              type="button"
              key={id}
              className={s.row}
              aria-pressed={on}
              onClick={() => set((prev) => ({ audioOn: prev.audioOn === id ? null : id }))}
            >
              <span className={on ? `${s.play} ${s.playOn}` : s.play} aria-hidden>
                {on ? '❙❙' : '▶'}
              </span>
              <span className={s.body}>
                <span className={s.title}>{a.title}</span>
                <span className={s.meta}>{a.meta}</span>
              </span>
              <span className={s.duration}>{a.duration}</span>
            </button>
          )
        })
      )}
    </Card>
  )
}
