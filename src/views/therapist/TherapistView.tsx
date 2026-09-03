import { useState } from 'react'
import { useMaybeCabinet } from '@/cabinet/context'
import { useAppState } from '@/state/store'
import { PatientSidebar } from './PatientSidebar'
import { PatientHeader } from './PatientHeader'
import { FicheSettings } from './FicheSettings'
import { StatsRow } from './StatsRow'
import { WeekModules } from './WeekModules'
import { HypnosesFiche } from '@/views/therapist/HypnosesFiche'
import { PsychProfile } from '@/views/therapist/PsychProfile'
import { ScaleChart } from '@/views/therapist/ScaleChart'
import { PatientAudios } from '@/views/therapist/PatientAudios'
import { Affirmations } from '@/views/therapist/Affirmations'
import { SharedJournal } from '@/views/therapist/SharedJournal'
import s from './TherapistView.module.css'

/** Les trois volets de la fiche. */
type Volet = 'suivi' | 'profil' | 'reglages'

const VOLETS: Array<{ value: Volet; label: string }> = [
  { value: 'suivi', label: 'Suivi' },
  { value: 'profil', label: 'Profil et hypnoses' },
  { value: 'reglages', label: 'Réglages de la fiche' },
]

/**
 * Espace thérapeute : barre latérale de patients + fiche.
 *
 * La fiche se lit en trois volets. À plat, elle empilait neuf cartes sur
 * deux écrans de hauteur : les modules de la semaine — ce qu'on regarde
 * chaque jour — arrivaient sous le profil psychologique et les hypnoses,
 * qu'on consulte une fois par mois. Le volet « Suivi » ouvre sur ce qui
 * bouge ; le reste est à un clic, pas à trois écrans.
 */
export function TherapistView() {
  /* Tiroir de la barre latérale sous 900px : état d'interface purement local,
     il n'a pas à voyager dans AppState. */
  const [drawer, setDrawer] = useState(false)
  const [volet, setVolet] = useState<Volet>('suivi')
  const state = useAppState()
  const cabinet = useMaybeCabinet()

  /* Un cabinet neuf n'a aucun patient : la fiche n'a alors rien à montrer,
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

            <div className={s.volets} role="tablist" aria-label="Volets de la fiche">
              {VOLETS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  role="tab"
                  aria-selected={volet === v.value}
                  className={volet === v.value ? `${s.volet} ${s.voletOn}` : s.volet}
                  onClick={() => setVolet(v.value)}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {volet === 'suivi' ? (
              <>
                <StatsRow />
                <div className={s.split}>
                  <WeekModules />
                  <div className={s.column}>
                    <ScaleChart />
                    <SharedJournal />
                    <PatientAudios />
                    <Affirmations />
                  </div>
                </div>
              </>
            ) : null}

            {/* Les deux cartes portent la clé de la fiche : sans elle, une
                écriture d'hypnose lancée sur Nadia restait affichée « en
                cours » en passant à Camille, avec les titres de la première. */}
            {volet === 'profil' ? (
              <>
                <PsychProfile key={`profil-${state.sel}`} />
                <HypnosesFiche key={`hypnoses-${state.sel}`} />
              </>
            ) : null}

            {volet === 'reglages' ? <FicheSettings key={state.sel} ouvertParDefaut /> : null}
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
                Aucun patient pour l'instant. Ajoutez la première depuis la colonne de gauche :
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
