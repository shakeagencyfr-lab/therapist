import { Avatar } from '@/components/ui'
import { PATIENT_ORDER } from '@/data/patients'
import { plural } from '@/lib/format'
import { riskColor, sidebarPatients, slippingPatients } from '@/state/selectors'
import { useStore } from '@/state/store'
import s from './PatientSidebar.module.css'

/**
 * Barre latérale des patients. Les deux seules props sont l'ouverture du
 * tiroir sous 900px, un état d'affichage détenu par la vue parente.
 */
export function PatientSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, set } = useStore()
  const rows = sidebarPatients(state)
  const slipping = slippingPatients(state).length
  const count = state.q.trim() ? `${rows.length} / ${PATIENT_ORDER.length}` : `${PATIENT_ORDER.length}`

  return (
    <>
      {open ? <div className={s.scrim} onClick={onClose} aria-hidden /> : null}

      <aside id="patient-sidebar" className={open ? `${s.sidebar} ${s.open}` : s.sidebar}>
        <div className={s.search}>
          <span className={s.searchDot} aria-hidden />
          <input
            className={s.searchInput}
            value={state.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Rechercher un patient"
            aria-label="Rechercher un patient"
          />
        </div>

        <div className={s.head}>
          <span className={s.overline}>Patients actifs</span>
          <span className={s.count}>{count}</span>
        </div>

        <div className={s.list}>
          {rows.map(({ id, patient }) => {
            const on = id === state.sel
            return (
              <button
                key={id}
                type="button"
                className={on ? `${s.row} ${s.rowOn}` : s.row}
                aria-pressed={on}
                onClick={() => {
                  /* Changer de patient remet à zéro tout ce qui pointait vers
                     le précédent : tâche ouverte et lecteur audio. */
                  set({ sel: id, openTask: null, pAudio: 0, playPos: 0, playing: false })
                  onClose()
                }}
              >
                <Avatar initials={patient.initials} on={on} />
                <span className={s.who}>
                  <span className={s.name}>{patient.name}</span>
                  <span className={s.sub}>{patient.subtitle}</span>
                </span>
                <span
                  className={s.dot}
                  style={{ background: riskColor(patient.adherence) }}
                  aria-hidden
                />
              </button>
            )
          })}
        </div>

        {slipping > 0 ? (
          <div className={s.slip}>
            <div className={s.slipTitle}>{plural(slipping, 'patient décroche', 'patients décrochent')}</div>
            <div className={s.slipBody}>
              Moins de 50 % des modules réalisés cette semaine. Une relance est proposée.
            </div>
          </div>
        ) : null}
      </aside>
    </>
  )
}
