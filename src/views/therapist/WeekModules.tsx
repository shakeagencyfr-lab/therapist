import { useState } from 'react'
import { Card, Notice, Pill, RoundCheck, Title } from '@/components/ui'
import { ConsigneEditeur } from './ConsigneEditeur'
import { useMaybeCabinet } from '@/cabinet/context'
import { consigneFor } from '@/data/consignes'
import { allModules, isModuleDone, moduleProgress, releaseModulePatch, toggleModulePatch } from '@/state/selectors'
import type { AppState } from '@/state/state'
import { useStore } from '@/state/store'
import type { PatientId, PatientModule } from '@/types/domain'
import s from './WeekModules.module.css'

/**
 * Score du quiz du module, ajouté à la méta dès qu'une réponse est donnée
 * côté patient.
 *
 * PAR LE PATIENT, ET NON PAR L'APERÇU. Le badge lisait `state.quizAns`,
 * c'est-à-dire les clics faits dans la maquette téléphone de l'espace
 * cabinet — le seul endroit du produit où un quiz était affiché. « Quiz
 * 3 / 4 » sur la fiche disait donc ce que la thérapeute avait cliqué
 * elle-même, jamais ce que le patient avait compris. Les vraies réponses
 * vivent en base (`module_quiz_answers`) ; `quizAns` ne sert plus qu'au
 * portefeuille de démonstration, où il n'y a personne à qui les attribuer.
 */
function quizBadge(state: AppState, key: PatientId, index: number, module: PatientModule): string {
  const consigne = consigneFor(module, state.customs)
  const quiz = consigne?.quiz
  if (!quiz || !quiz.length) return ''
  let answered = 0
  let right = 0
  quiz.forEach((q, qi) => {
    const given = module.id
      ? state.quizReponses[`${module.id}:${qi}`]
      : state.quizAns[`${key}:${index}:${qi}`]
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
  /** Ce que la base a refusé, dit là où le geste a été fait. */
  const [echec, setEchec] = useState('')

  /**
   * Cocher un exercice, et ne pas mentir sur le résultat.
   *
   * La case basculait à l'écran, l'écriture partait avec `void`, et son échec
   * n'allait nulle part : la case restait cochée sur une base inchangée, et
   * `recharger()` n'était même pas rappelé sur ce chemin — l'illusion tenait
   * jusqu'au prochain rechargement complet.
   *
   * Le correctif local se retire dans les deux cas : réussite, la base fait
   * foi ; échec, l'écran revient à ce qu'elle dit. Sans ce retrait, l'avis de
   * la thérapeute masquait pour toute la session ce que le patient faisait
   * ensuite de l'exercice.
   */
  async function basculer(index: number, base: boolean) {
    const vise = !isModuleDone(state, key, index, base)
    set(toggleModulePatch(key, index, base))
    setEchec('')
    if (!cabinet?.reel) return
    const r = await cabinet.basculerModule(key, index, vise)
    set(releaseModulePatch(key, index))
    if (!r.ok) setEchec(r.message || "L'exercice n'a pas pu être mis à jour. Réessayez.")
  }

  return (
    <Card padded={false} flush>
      <div className={s.head}>
        <Title>Parcours de la semaine</Title>
        <span className={s.count}>{`${done} / ${total} modules réalisés`}</span>
      </div>

      {echec ? (
        <Notice tone="warn" style={{ margin: '0 20px 12px' }}>
          {echec}
        </Notice>
      ) : null}

      <div className={s.list}>
        {modules.map((m, i) => {
          const on = isModuleDone(state, key, i, m.done)
          return (
            <div key={`${m.title}-${i}`}>
            <div className={s.row}>
              <RoundCheck
                on={on}
                label={on ? `Marquer « ${m.title} » comme non réalisé` : `Marquer « ${m.title} » comme réalisé`}
                onClick={() => void basculer(i, m.done)}
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
