import { useState } from 'react'
import { Card, Notice, Pill, RoundCheck, Title } from '@/components/ui'
import { ConsigneEditeur } from './ConsigneEditeur'
import { useMaybeCabinet } from '@/cabinet/context'
import { consigneFor } from '@/data/consignes'
import { plural } from '@/lib/format'
import { libelleSeptJours } from '@/lib/assiduite'
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

/**
 * Son parcours : les modules confiés au patient.
 *
 * Il n'y a pas de semaine dans ce produit : un exercice reste au parcours
 * jusqu'à ce qu'on l'en retire. Et jusqu'ici, rien ne l'en retirait — tout
 * s'accumulait chez le patient, sous « aujourd'hui », séance après séance.
 */
export function WeekModules() {
  const { state, set } = useStore()
  const cabinet = useMaybeCabinet()
  const key = state.sel
  const modules = allModules(state, key)
  const retires = state.patients[key]?.modulesRetires ?? []
  const { done, total } = moduleProgress(state, key)
  /** Le module dont la consigne est ouverte à la correction. */
  const [aCorriger, setACorriger] = useState('')
  /** Ce que la base a refusé, dit là où le geste a été fait. */
  const [echec, setEchec] = useState('')
  /** Le module dont le retrait est en cours : un geste à la fois. */
  const [enCours, setEnCours] = useState('')
  /** La liste des retirés, repliée : on la consulte, on ne la lit pas. */
  const [voirRetires, setVoirRetires] = useState(false)

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
  async function basculer(index: number, m: PatientModule) {
    const vise = !isModuleDone(state, key, index, m.done)
    set(toggleModulePatch(key, index, m.done))
    setEchec('')
    // Un module sans identifiant est une démonstration : rien à écrire.
    if (!cabinet?.reel || !m.id) return
    const r = await cabinet.basculerModule(m.id, vise)
    set(releaseModulePatch(key, index))
    if (!r.ok) setEchec(r.message || "L'exercice n'a pas pu être mis à jour. Réessayez.")
  }

  /**
   * Retirer du parcours, ou y remettre.
   *
   * Les cases cochées localement sont repérées par leur rang : un module qui
   * sort décale tous ceux qui le suivent. On ne garde donc aucun correctif
   * provisoire de ce patient à travers un retrait — la base fait foi.
   */
  async function ranger(m: PatientModule, retirer: boolean) {
    if (!cabinet?.reel || !m.id || enCours) return
    setEnCours(m.id)
    setEchec('')
    setACorriger('')
    const r = retirer ? await cabinet.retirerModule(m.id) : await cabinet.remettreModule(m.id)
    setEnCours('')
    set((prev) => ({
      done: Object.fromEntries(Object.entries(prev.done).filter(([k]) => !k.startsWith(`${key}:`))),
    }))
    if (!r.ok) setEchec(r.message)
  }

  return (
    <Card padded={false} flush>
      <div className={s.head}>
        <Title>Son parcours</Title>
        {/* La case dit « fait aujourd'hui » : un exercice se refait chaque
            jour (0051). La semaine se lit sous chaque titre. */}
        <span className={s.count}>{`${done} / ${plural(total, 'exercice fait', 'exercices faits')} aujourd'hui`}</span>
      </div>

      {echec ? (
        <Notice tone="warn" style={{ margin: '0 20px 12px' }}>
          {echec}
        </Notice>
      ) : null}

      <div className={s.list}>
        {modules.map((m, i) => {
          const on = isModuleDone(state, key, i, m.done)
          const repere = m.id ?? `demo-${i}`
          return (
            <div key={m.id ?? `${m.title}-${i}`}>
            <div className={s.row}>
              <RoundCheck
                on={on}
                label={
                  on
                    ? `Marquer « ${m.title} » comme non fait aujourd'hui`
                    : `Marquer « ${m.title} » comme fait aujourd'hui`
                }
                onClick={() => void basculer(i, m)}
              />
              <div className={s.body}>
                <span className={on ? `${s.title} ${s.titleDone}` : s.title}>{m.title}</span>
                <span className={s.meta}>
                  {[m.meta, m.septJours ? libelleSeptJours(m.septJours) : ''].filter(Boolean).join(' · ') +
                    quizBadge(state, key, i, m)}
                </span>
                {/* Le mot qu'elle a posé sur l'exercice. La colonne était lue
                    depuis 0007 et n'était jamais écrite ni montrée : ce qu'une
                    patient notait sur un exercice n'existait nulle part. */}
                {m.note ? <span className={s.note}>« {m.note} »</span> : null}

                {/* La consigne, écrite par l'IA à l'envoi de la séance. Elle
                    se relit et se corrige : c'est la praticienne qui connaît
                    la personne, et un exercice mal formulé se fait mal. */}
                <span className={s.gestes}>
                  {/* Le bouton comparait l'ouvert à `m.id ?? ''` pour le
                      refermer, et à `m.id ?? demo-i` pour l'ouvrir : sur la
                      démonstration, un second clic ne refermait rien. */}
                  <button
                    type="button"
                    className={s.consigne}
                    onClick={() => setACorriger(aCorriger === repere ? '' : repere)}
                    aria-expanded={aCorriger === repere}
                  >
                    {m.consigne?.steps?.length
                      ? `Consigne en ${plural(m.consigne.steps.length, 'étape', 'étapes')} — relire`
                      : m.consigne?.why
                        ? 'Consigne sans étapes — compléter'
                        : 'Aucune consigne — en écrire une'}
                  </button>
                  {cabinet?.reel && m.id ? (
                    <button
                      type="button"
                      className={s.retirer}
                      disabled={Boolean(enCours)}
                      onClick={() => void ranger(m, true)}
                    >
                      {enCours === m.id ? 'Retrait…' : 'Retirer du parcours'}
                    </button>
                  ) : null}
                </span>
              </div>
              <Pill tone="kind" style={m.fresh ? { background: 'var(--c-accent-soft)' } : undefined}>
                {m.kind}
              </Pill>
            </div>

            {aCorriger === repere ? (
              <ConsigneEditeur module={m} onFerme={() => setACorriger('')} />
            ) : null}
            </div>
          )
        })}
      </div>

      {/* Les retirés : hors de son espace, pas hors du dossier. Ce qu'il en a
          fait — coché, commenté — reste lisible ici, et un retrait par erreur
          se rattrape d'un clic. */}
      {retires.length ? (
        <div className={s.retires}>
          <button
            type="button"
            className={s.retiresTete}
            aria-expanded={voirRetires}
            onClick={() => setVoirRetires((v) => !v)}
          >
            {voirRetires ? 'Masquer' : 'Voir'} {plural(retires.length, 'exercice retiré', 'exercices retirés')} du
            parcours
          </button>
          {voirRetires
            ? retires.map((m) => (
                <div key={m.id} className={s.retire}>
                  <span className={s.body}>
                    <span className={s.title}>{m.title}</span>
                    <span className={s.meta}>
                      {[m.done ? 'Fait' : 'Pas fait', m.retireLe ? `retiré le ${m.retireLe}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {m.note ? <span className={s.note}>« {m.note} »</span> : null}
                  </span>
                  <button
                    type="button"
                    className={s.consigne}
                    disabled={Boolean(enCours)}
                    onClick={() => void ranger(m, false)}
                  >
                    {enCours === m.id ? 'Remise…' : 'Remettre au parcours'}
                  </button>
                </div>
              ))
            : null}
        </div>
      ) : null}

      <div className={s.foot}>
        {/* « … basculent automatiquement à la semaine suivante » : il n'y a
            aucune semaine dans ce produit. Un exercice reste au parcours tant
            que personne ne l'en retire — et désormais, on peut l'en retirer. */}
        <span className={s.rule}>
          Un exercice reste au parcours tant que vous ne l'en retirez pas : rien ne s'efface tout
          seul. Un exercice retiré disparaît de son espace, et reste au dossier.
        </span>
      </div>
    </Card>
  )
}
