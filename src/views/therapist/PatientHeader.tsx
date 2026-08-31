import { Button, Pill } from '@/components/ui'
import { patientOf } from '@/state/selectors'
import { useStore } from '@/state/store'
import s from './PatientHeader.module.css'

/** En-tête de la fiche client : identité, programme, actions de séance. */
export function PatientHeader() {
  const { state, set } = useStore()
  const p = patientOf(state)

  return (
    <div className={s.head}>
      <div className={s.identity}>
        <h1 className={s.name}>{p.name}</h1>
        <div className={s.facts}>
          <Pill tone="accent">{p.program}</Pill>
          <span className={s.fact}>{p.weekLabel}</span>
          <span className={s.sep} aria-hidden />
          <span className={s.fact}>{p.nextSession}</span>
        </div>
      </div>

      <div className={s.actions}>
        <Button variant="secondary" onClick={() => set({ mode: 'session' })}>
          Note de séance
        </Button>
        <Button variant="primary" onClick={() => set({ mode: 'atelier' })}>
          Ajouter un module
        </Button>
      </div>
    </div>
  )
}
