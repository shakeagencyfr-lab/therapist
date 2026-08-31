import { Card, Notice, Overline } from '@/components/ui'
import { buildPatientContext, refreshProfile } from '@/services/aiClient'
import { axisBand, profileOf, profilePrecision } from '@/state/selectors'
import { useStore } from '@/state/store'
import type { PsychProfile as Profile } from '@/types/domain'
import s from './PsychProfile.module.css'

/**
 * Profil psychologique du patient sélectionné : portrait, axes avec leur
 * bande d'incertitude, conseils d'accompagnement et points d'attention.
 *
 * La bande se resserre à chaque séance : la règle de précision (marge et
 * palier de maturité) vit dans `profilePrecision`.
 */
export function PsychProfile() {
  const { state, set } = useStore()
  const key = state.sel
  const profile = profileOf(state, key)
  const precision = profilePrecision(state, key)
  const busy = state.profGen === key
  const resume = state.profNote[key]

  async function refresh() {
    // Une seule actualisation à la fois, tous patients confondus.
    if (state.profGen) return
    set({ profGen: key })
    try {
      const result = await refreshProfile({
        context: buildPatientContext(state, key),
        notes: state.sessionNotes,
        synthese: state.draft ? state.draft.synthese : '',
        transcript: state.transcript,
      })
      const next: Profile = {
        updated: "Actualisé à l'instant, depuis la dernière séance",
        portrait: result.portrait || profile.portrait,
        axes: (result.axes ?? [])
          .filter((a) => !!a && !!a.label)
          .map((a) => ({
            label: a.label,
            value: Math.max(0, Math.min(100, Math.round(a.value))),
            note: a.note || '',
          })),
        levers: (result.levers ?? []).filter((l) => !!l && !!l.title),
        care: (result.care ?? []).filter((c) => typeof c === 'string'),
      }
      set((prev) => ({
        profGen: '',
        profNew: { ...prev.profNew, [key]: next },
        profNote: { ...prev.profNote, [key]: result.resume || 'Profil actualisé.' },
      }))
    } catch {
      set((prev) => ({
        profGen: '',
        profNote: { ...prev.profNote, [key]: "L'actualisation a échoué. Réessayez." },
      }))
    }
  }

  const sessionsWord = precision.sessions > 1 ? 'séances' : 'séance'

  return (
    <Card className={s.card}>
      <div className={s.head}>
        <div className={s.identity}>
          <h2 className={s.title}>Profil psychologique</h2>
          <span className={s.subtitle}>
            Établi à partir de vos notes, affiné après chaque séance
          </span>
        </div>
        <div className={s.actions}>
          <span className={s.maturity}>{precision.label}</span>
          <span className={s.updated}>{profile.updated}</span>
          <button type="button" className={s.refresh} onClick={refresh} disabled={busy}>
            {busy ? 'Analyse des notes…' : 'Actualiser le profil'}
          </button>
        </div>
      </div>

      <div className={s.body}>
        <div className={s.left}>
          <p className={s.portrait}>{profile.portrait}</p>

          <div className={s.axes}>
            {profile.axes.map((axis) => {
              const band = axisBand(axis.value, precision.margin)
              return (
                <div className={s.axis} key={axis.label}>
                  <div className={s.axisHead}>
                    <span className={s.axisLabel}>{axis.label}</span>
                    <span className={s.axisNote}>{axis.note}</span>
                  </div>
                  <div
                    className={s.track}
                    role="img"
                    aria-label={`${axis.value} sur 100, à ± ${precision.margin} points près`}
                  >
                    <span
                      className={s.band}
                      style={{ left: `${band.lo}%`, width: `${band.hi - band.lo}%` }}
                      aria-hidden
                    />
                    <span className={s.mark} style={{ left: `${axis.value}%` }} aria-hidden />
                  </div>
                </div>
              )
            })}
          </div>

          <div className={s.marginNote}>
            {`La bande claire indique la marge d'incertitude, ± ${precision.margin} points sur ${precision.sessions} ${sessionsWord}. Elle se réduit à chaque rendez-vous.`}
          </div>

          {resume ? <Notice tone="ok">{resume}</Notice> : null}
        </div>

        <div className={s.right}>
          <Overline>Comment l'accompagner</Overline>

          <div className={s.levers}>
            {profile.levers.map((lever, i) => (
              <div className={s.lever} key={lever.title}>
                <span className={s.leverNum} aria-hidden>
                  {i + 1}
                </span>
                <div className={s.leverBody}>
                  <span className={s.leverTitle}>{lever.title}</span>
                  <span className={s.leverText}>{lever.body}</span>
                </div>
              </div>
            ))}
          </div>

          <Notice tone="warn">
            <div className={s.careHead}>Points d'attention</div>
            <div className={s.careList}>
              {profile.care.map((point) => (
                <div className={s.carePoint} key={point}>
                  <span className={s.careDash} aria-hidden>
                    —
                  </span>
                  <span className={s.careText}>{point}</span>
                </div>
              ))}
            </div>
          </Notice>
        </div>
      </div>
    </Card>
  )
}
