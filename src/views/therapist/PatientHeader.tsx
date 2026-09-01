import { Button, Pill } from '@/components/ui'
import { ATELIER_LIBRARY } from '@/data/atelier'
import { nouvelleSeance, patientOf } from '@/state/selectors'
import { useStore } from '@/state/store'
import s from './PatientHeader.module.css'

/** En-tête de la fiche client : identité, programme, actions de séance. */
export function PatientHeader() {
  const { state, set } = useStore()
  const p = patientOf(state)

  // La fiche n'est montée qu'avec une patiente ; le garde rend l'invariant
  // explicite plutôt que supposé.
  if (!p) return null

  /**
   * Ajoute au parcours de la semaine le module suivant de la bibliothèque du
   * cabinet : on avance dans la liste au rythme des modules déjà ajoutés, sans
   * quitter la fiche.
   */
  function addModule() {
    set((prev) => {
      const key = prev.sel
      const used = (prev.extra[key] ?? []).length
      const module = ATELIER_LIBRARY[used % ATELIER_LIBRARY.length]
      return {
        extra: {
          ...prev.extra,
          [key]: (prev.extra[key] ?? []).concat([{ ...module, done: false, fresh: true }]),
        },
      }
    })
  }

  /**
   * Ouvrir la séance depuis la fiche : elle démarre sur cette patiente, il n'y
   * a pas à la rechoisir. Une captation déjà commencée n'est pas écrasée pour
   * autant — on rejoint l'écran là où il en est.
   */
  function openSession() {
    set((prev) => {
      const enCours = prev.consent || prev.transcript || prev.sessionNotes || prev.draft
      return enCours ? { mode: 'session' } : { ...nouvelleSeance(prev.sel), mode: 'session' }
    })
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
        <Button variant="secondary" onClick={openSession}>
          Note de séance
        </Button>
        <Button variant="primary" onClick={addModule}>
          Ajouter un module
        </Button>
      </div>
    </div>
  )
}
