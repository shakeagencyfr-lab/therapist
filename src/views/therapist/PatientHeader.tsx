import { Button, Pill } from '@/components/ui'
import { seanceEnCours } from '@/lib/seance'
import { nouvelleSeance, patientOf } from '@/state/selectors'
import { useStore } from '@/state/store'
import s from './PatientHeader.module.css'

/** En-tête de la fiche client : identité, programme, actions de séance. */
export function PatientHeader() {
  const { state, set } = useStore()
  const p = patientOf(state)

  // La fiche n'est montée qu'avec un patient ; le garde rend l'invariant
  // explicite plutôt que supposé.
  if (!p) return null

  /**
   * « Ajouter un module » ouvre l'atelier avec ce patient déjà cochée.
   *
   * L'ancien bouton piochait le module suivant d'une bibliothèque de
   * démonstration et l'ajoutait en mémoire — sur un vrai cabinet, un module
   * fictif apparaissait dans le parcours et disparaissait au rechargement.
   * Un module s'écrit pour quelqu'un : c'est le travail de l'atelier.
   */
  function addModule() {
    set((prev) => ({ mode: 'atelier', aAssign: { ...prev.aAssign, [prev.sel]: true } }))
  }

  /**
   * Ouvrir la séance depuis la fiche : elle démarre sur ce patient, il n'y
   * a pas à la rechoisir. Une captation déjà commencée n'est pas écrasée pour
   * autant — on rejoint l'écran là où il en est.
   *
   * Une séance ENVOYÉE, elle, n'est plus « commencée » : c'est `seanceEnCours`
   * qui le dit. Sans cette distinction, « Nouvelle séance » ramenait au
   * brouillon qu'on venait d'envoyer.
   */
  function openSession() {
    set((prev) =>
      seanceEnCours(prev) ? { mode: 'session' } : { ...nouvelleSeance(prev.sel), mode: 'session' },
    )
  }

  return (
    <div className={s.head}>
      <div className={s.identity}>
        <h1 className={s.name}>{p.name}</h1>
        <div className={s.facts}>
          {/* Pas de pastille vide : une fiche neuve n'a pas encore de programme. */}
          {p.program ? <Pill tone="accent">{p.program}</Pill> : null}
          <span className={s.fact}>{p.weekLabel}</span>
          <span className={s.sep} aria-hidden />
          <span className={s.fact}>{p.nextSession}</span>
        </div>
      </div>

      <div className={s.actions}>
        <Button variant="secondary" onClick={() => set({ mode: 'patient' })}>
          Son application
        </Button>
        <Button variant="secondary" onClick={addModule}>
          Ajouter un module
        </Button>
        <Button variant="primary" onClick={openSession}>
          Nouvelle séance
        </Button>
      </div>
    </div>
  )
}
