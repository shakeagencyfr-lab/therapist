import { PRINCIPLES } from '@/data/patientApp'
import { allModules } from '@/state/selectors'
import { useStore } from '@/state/store'
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
  const { state, set } = useStore()
  const fiche = state.patients[state.sel]
  const modules = allModules(state, state.sel)
  const open = state.openTask
  /* Le détail de tâche n'existe que si l'index pointe encore sur un module. */
  const taskOpen = state.pView === 'home' && open !== null && !!modules[open]

  return (
    <div className={s.wrap}>
      <div className={s.editorial}>
        {/* L'aperçu s'ouvre depuis la fiche : il faut pouvoir y revenir sans
            passer par le menu. */}
        <button type="button" className={s.retour} onClick={() => set({ mode: 'therapist' })}>
          ← Retour à la fiche{fiche ? ` de ${fiche.name.split(' ')[0]}` : ''}
        </button>
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
        {/* Un cabinet qui vient d'ouvrir n'a aucun patient : l'aperçu n'a
            alors personne à montrer, et le dire vaut mieux qu'un écran noir. */}
        {!fiche ? (
          <div className={s.preview}>
            <p className={s.previewTitle}>Rien à prévisualiser</p>
            <p className={s.previewText}>
              Cet écran montre ce que voit un patient sur son téléphone. Ajoutez-en une depuis la
              vue thérapeute, et son espace apparaîtra ici.
            </p>
          </div>
        ) : state.pView === 'journal' ? (
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
