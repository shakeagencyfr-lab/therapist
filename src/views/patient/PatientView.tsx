import { PRINCIPLES } from '@/data/patientApp'
import { allModules } from '@/state/selectors'
import { useAppState } from '@/state/store'
import { PatientHome } from './PatientHome'
import { PatientJournal } from './PatientJournal'
import { PhoneFrame } from './PhoneFrame'
import { TaskDetail } from './TaskDetail'
import s from './PatientView.module.css'

/**
 * Espace patient : le texte éditorial à gauche, la maquette téléphone à droite.
 * Une seule vue est montée dans le téléphone à la fois.
 */
export function PatientView() {
  const state = useAppState()
  const modules = allModules(state, state.sel)
  const open = state.openTask
  /* Le détail de tâche n'existe que si l'index pointe encore sur un module. */
  const taskOpen = state.pView === 'home' && open !== null && !!modules[open]

  return (
    <div className={s.wrap}>
      <div className={s.editorial}>
        <h1 className={s.h1}>Ce que le patient voit entre deux séances</h1>
        <p className={s.lead}>
          Une seule chose à faire par jour, envoyée par notification. Pas de fil d'actualité, pas de
          score, pas de comparaison avec d'autres patients. L'écran se vide quand la journée est
          faite.
        </p>
        <div className={s.principles}>
          {PRINCIPLES.map((pr) => (
            <div className={s.principle} key={pr.title}>
              <span className={s.bullet} aria-hidden />
              <span className={s.principleText}>
                <span className={s.principleTitle}>{pr.title}</span>
                <span className={s.principleBody}>{pr.body}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <PhoneFrame>
        {state.pView === 'journal' ? (
          <PatientJournal />
        ) : taskOpen ? (
          <TaskDetail />
        ) : (
          <PatientHome />
        )}
      </PhoneFrame>
    </div>
  )
}
