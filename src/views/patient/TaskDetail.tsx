import { consigneFor } from '@/data/consignes'
import { allModules, isModuleDone, toggleModulePatch } from '@/state/selectors'
import { useStore } from '@/state/store'
import s from './TaskDetail.module.css'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/** Détail d'une tâche : la consigne en trois temps, le « pourquoi », le quiz. */
export function TaskDetail() {
  const { state, set } = useStore()
  const key = state.sel
  const index = state.openTask
  const module = index !== null ? allModules(state, key)[index] : undefined
  if (index === null || !module) return null

  const consigne = consigneFor(module, state.customs)
  const done = isModuleDone(state, key, index, module.done)
  const noteKey = `${key}:${index}`
  const quiz = consigne?.quiz ?? []

  let answered = 0
  let right = 0
  quiz.forEach((q, qi) => {
    const given = state.quizAns[`${key}:${index}:${qi}`]
    if (given !== undefined) {
      answered += 1
      if (given === q.correct) right += 1
    }
  })
  const score =
    answered === 0
      ? `${quiz.length} ${quiz.length > 1 ? 'questions' : 'question'}`
      : `${right} / ${quiz.length}${answered < quiz.length ? " pour l'instant" : ' juste'}`

  return (
    <div className={s.screen}>
      <div className={s.backRow}>
        <button type="button" className={s.back} onClick={() => set({ openTask: null })}>
          ‹ Aujourd'hui
        </button>
      </div>

      <div className={s.head}>
        <span className={s.kind}>{module.kind}</span>
        <h2 className={s.title}>{module.title}</h2>
      </div>

      <div className={s.facts}>
        <div className={s.fact}>
          <div className={s.factLabel}>Durée</div>
          <div className={s.factValue}>{consigne ? consigne.duree : ''}</div>
        </div>
        <div className={`${s.fact} ${s.factWhen}`}>
          <div className={s.factLabel}>Quand</div>
          <div className={`${s.factValue} ${s.factValueWrap}`}>{consigne ? consigne.quand : ''}</div>
        </div>
      </div>

      <div className={s.block}>
        <div className={s.overline}>La consigne</div>
        <div className={s.steps}>
          {(consigne?.steps ?? []).map((step, i) => (
            <div className={s.step} key={step}>
              <span className={s.stepNum} aria-hidden>
                {i + 1}
              </span>
              <span className={s.stepText}>{step}</span>
            </div>
          ))}
        </div>
      </div>

      {!!consigne?.why && (
        <div className={s.block}>
          <div className={s.why}>
            <div className={s.whyOverline}>Pourquoi cet exercice</div>
            <div className={s.whyBody}>{consigne.why}</div>
          </div>
        </div>
      )}

      {quiz.length > 0 && (
        <div className={s.block}>
          <div className={s.quizHead}>
            <span className={s.overline}>Vérifier que c'est clair</span>
            <span className={s.quizScore}>{score}</span>
          </div>
          <div className={s.quizList}>
            {quiz.map((q, qi) => {
              const id = `${key}:${index}:${qi}`
              const given = state.quizAns[id]
              const isAnswered = given !== undefined
              const good = isAnswered && given === q.correct
              return (
                <div className={s.quizCard} key={q.question}>
                  <div className={s.quizQuestion}>{q.question}</div>
                  <div className={s.options}>
                    {(q.options ?? []).map((option, oi) => {
                      const picked = given === oi
                      const reveal = isAnswered && oi === q.correct
                      const wrong = picked && !reveal
                      return (
                        <button
                          type="button"
                          key={option}
                          className={
                            reveal
                              ? `${s.option} ${s.optionRight}`
                              : wrong
                                ? `${s.option} ${s.optionWrong}`
                                : s.option
                          }
                          aria-pressed={picked}
                          onClick={() =>
                            set((prev) => ({ quizAns: { ...prev.quizAns, [id]: oi } }))
                          }
                        >
                          <span
                            className={
                              reveal
                                ? `${s.mark} ${s.markRight}`
                                : wrong
                                  ? `${s.mark} ${s.markWrong}`
                                  : s.mark
                            }
                            aria-hidden
                          >
                            {reveal ? '✓' : wrong ? '✕' : LETTERS[oi]}
                          </span>
                          <span className={s.optionText}>{option}</span>
                        </button>
                      )
                    })}
                  </div>
                  {isAnswered && (
                    <div className={good ? `${s.feedback} ${s.feedbackOk}` : s.feedback}>
                      {q.feedback}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className={s.block}>
        <div className={`${s.overline} ${s.overlineTight}`}>Votre retour, si vous voulez</div>
        <textarea
          className={s.noteArea}
          rows={3}
          value={state.taskNote[noteKey] ?? ''}
          placeholder="Ce que vous avez remarqué…"
          onChange={(e) => {
            const value = e.target.value
            set((prev) => ({ taskNote: { ...prev.taskNote, [noteKey]: value } }))
          }}
          aria-label="Votre retour, si vous voulez"
        />
      </div>

      <div className={s.doneRow}>
        <button
          type="button"
          className={done ? `${s.doneBtn} ${s.doneBtnOn}` : s.doneBtn}
          aria-pressed={done}
          onClick={() => set(toggleModulePatch(key, index, module.done))}
        >
          {done ? '✓ Fait' : "C'est fait"}
        </button>
      </div>
    </div>
  )
}
