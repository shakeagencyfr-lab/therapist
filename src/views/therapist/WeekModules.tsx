import { useState } from 'react'
import { Card, Pill, RoundCheck, Title } from '@/components/ui'
import { ConsigneEditeur } from './ConsigneEditeur'
import { useMaybeCabinet } from '@/cabinet/context'
import { consigneFor } from '@/data/consignes'
import { allModules, isModuleDone, moduleProgress, toggleModulePatch } from '@/state/selectors'
import type { AppState } from '@/state/state'
import { useStore } from '@/state/store'
import type { PatientId, PatientModule } from '@/types/domain'
import s from './WeekModules.module.css'

/**
 * Score du quiz du module, ajouté à la méta dès qu'une réponse est donnée
 * côté patient.
 */
function quizBadge(state: AppState, key: PatientId, index: number, module: PatientModule): string {
  const consigne = consigneFor(module, state.customs)
  const quiz = consigne?.quiz
  if (!quiz || !quiz.length) return ''
  let answered = 0
  let right = 0
  quiz.forEach((q, qi) => {
    const given = state.quizAns[`${key}:${index}:${qi}`]
    if (given !== undefined) {
      answered += 1
      if (given === q.correct) right += 1
    }
  })
  return answered ? ` · Quiz ${right} / ${quiz.length}` : ''
}

/** Parcours de la semaine : les modules confiés au patient. */
export function WeekModules() {
  const { state, set } = useStore()
  const cabinet = useMaybeCabinet()
  const key = state.sel
  const modules = allModules(state, key)
  const { done, total } = moduleProgress(state, key)
  /** Le module dont la consigne est ouverte à la correction. */
  const [aCorriger, setACorriger] = useState('')

  return (
    <Card padded={false} flush>
      <div className={s.head}>
        <Title>Parcours de la semaine</Title>
        <span className={s.count}>{`${done} / ${total} modules réalisés`}</span>
      </div>

      <div className={s.list}>
        {modules.map((m, i) => {
          const on = isModuleDone(state, key, i, m.done)
          return (
            <div key={`${m.title}-${i}`}>
            <div className={s.row}>
              <RoundCheck
                on={on}
                label={on ? `Marquer « ${m.title} » comme non réalisé` : `Marquer « ${m.title} » comme réalisé`}
                onClick={() => {
                  // La case bascule tout de suite à l'écran ; l'écriture suit.
                  // Sur les fiches de démonstration, il n'y a rien à écrire.
                  set(toggleModulePatch(key, i, m.done))
                  if (cabinet?.reel) {
                    void cabinet.basculerModule(key, i, !isModuleDone(state, key, i, m.done))
                  }
                }}
              />
              <div className={s.body}>
                <span className={on ? `${s.title} ${s.titleDone}` : s.title}>{m.title}</span>
                <span className={s.meta}>{m.meta + quizBadge(state, key, i, m)}</span>
                {/* Le mot qu'elle a posé sur l'exercice. La colonne était lue
                    depuis 0007 et n'était jamais écrite ni montrée : ce qu'une
                    patient notait sur un exercice n'existait nulle part. */}
                {m.note ? <span className={s.note}>« {m.note} »</span> : null}

                {/* La consigne, écrite par l'IA à l'envoi de la séance. Elle
                    se relit et se corrige : c'est la praticienne qui connaît
                    la personne, et un exercice mal formulé se fait mal. */}
                <button
                  type="button"
                  className={s.consigne}
                  onClick={() => setACorriger(aCorriger === (m.id ?? '') ? '' : (m.id ?? `demo-${i}`))}
                  aria-expanded={aCorriger === (m.id ?? `demo-${i}`)}
                >
                  {m.consigne?.steps?.length
                    ? `Consigne en ${m.consigne.steps.length} étape${m.consigne.steps.length > 1 ? 's' : ''} — relire`
                    : m.consigne?.why
                      ? 'Consigne sans étapes — compléter'
                      : 'Aucune consigne — en écrire une'}
                </button>
              </div>
              <Pill tone="kind" style={m.fresh ? { background: 'var(--c-accent-soft)' } : undefined}>
                {m.kind}
              </Pill>
            </div>

            {aCorriger === (m.id ?? `demo-${i}`) ? (
              <ConsigneEditeur module={m} onFerme={() => setACorriger('')} />
            ) : null}
            </div>
          )
        })}
      </div>

      <div className={s.foot}>
        <span className={s.rule}>
          Les modules non réalisés basculent automatiquement à la semaine suivante.
        </span>
      </div>
    </Card>
  )
}
