import { useState } from 'react'
import { PatientSidebar } from './PatientSidebar'
import { PatientHeader } from './PatientHeader'
import { StatsRow } from './StatsRow'
import { WeekModules } from './WeekModules'
import { PsychProfile } from '@/views/therapist/PsychProfile'
import { ScaleChart } from '@/views/therapist/ScaleChart'
import { PatientAudios } from '@/views/therapist/PatientAudios'
import { Affirmations } from '@/views/therapist/Affirmations'
import { SharedJournal } from '@/views/therapist/SharedJournal'
import s from './TherapistView.module.css'

/** Espace thérapeute : barre latérale de patients + fiche client. */
export function TherapistView() {
  /* Tiroir de la barre latérale sous 900px : état d'interface purement local,
     il n'a pas à voyager dans AppState. */
  const [drawer, setDrawer] = useState(false)

  return (
    <div className={s.layout}>
      <PatientSidebar open={drawer} onClose={() => setDrawer(false)} />

      <main className={s.main}>
        <button
          type="button"
          className={s.drawerBtn}
          onClick={() => setDrawer((open) => !open)}
          aria-expanded={drawer}
          aria-controls="patient-sidebar"
        >
          Patients
        </button>

        <PatientHeader />
        <StatsRow />
        <PsychProfile />

        <div className={s.split}>
          <WeekModules />
          <div className={s.column}>
            <ScaleChart />
            <PatientAudios />
            <Affirmations />
            <SharedJournal />
          </div>
        </div>
      </main>
    </div>
  )
}
