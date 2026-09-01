import { useState } from 'react'
import { useMaybeCabinet } from '@/cabinet/context'
import { useAppState } from '@/state/store'
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
  const state = useAppState()
  const cabinet = useMaybeCabinet()

  /* Un cabinet neuf n'a aucune patiente : la fiche n'a alors rien à montrer,
     et l'afficher planterait. C'est le premier écran que voit une praticienne
     qui vient d'accepter son invitation — il doit lui dire quoi faire. */
  const fiche = state.patients[state.sel]

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

        {fiche ? (
          <>
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
          </>
        ) : (
          <div className={s.empty}>
            <h1 className={s.emptyTitle}>
              {cabinet?.chargement ? 'Ouverture de votre cabinet…' : 'Votre cabinet est prêt'}
            </h1>
            {cabinet?.erreur ? (
              <p className={s.emptyText}>{cabinet.erreur}</p>
            ) : cabinet?.chargement ? null : (
              <p className={s.emptyText}>
                Aucune patiente pour l'instant. Ajoutez la première depuis la colonne de gauche :
                son nom, son adresse, et ce que vous suivez avec elle. Elle recevra son espace en
                se connectant avec cette adresse, sans mot de passe.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
