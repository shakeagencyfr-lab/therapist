import { useState } from 'react'
import { Button, Card, Overline, SquareCheck, TextArea, TextInput, Title } from '@/components/ui'
import { ATELIER_SEEDS, ATELIER_SEED_BRIEFS, ATELIER_TYPES } from '@/data/atelier'
import { plural } from '@/lib/format'
import { AiError, generateModule } from '@/services/aiClient'
import { useMaybeCabinet } from '@/cabinet/context'
import { useStore } from '@/state/store'
import type { AppState } from '@/state/state'
import type { CustomModule, PatientId, QuizQuestion } from '@/types/domain'
import s from './AtelierView.module.css'

/* Bibliothèque du cabinet ------------------------------------------- */

interface LibraryRow {
  key: string
  title: string
  meta: string
  /** Module écrit dans l'atelier : il peut être rouvert dans le panneau de droite. */
  made: CustomModule
}

/** Les patients dont le parcours contient déjà ce module. */
/**
 * Qui porte déjà ce module.
 *
 * Sur un cabinet réel, un module assigné est rangé dans la FICHE par le
 * rechargement, pas dans `state.extra` — qui ne sert qu'à la démonstration.
 * Ne lire que `extra` laissait « déjà assigné » éteint pour toujours, et la
 * bibliothèque du cabinet sans aucun porteur : la thérapeute réassignait le
 * même module sans le savoir.
 */
function porteLeModule(state: AppState, key: string, title: string): boolean {
  const fiche = state.patients[key]?.modules ?? []
  return fiche.concat(state.extra[key] ?? []).some((module) => module.title === title)
}

function holders(state: AppState, title: string): string[] {
  return state.patientOrder
    .filter((key) => porteLeModule(state, key, title))
    .map((key) => state.patients[key].name)
}

/** Les modules écrits dans l'atelier : la carte reste absente tant qu'il n'y en a aucun. */
function libraryRows(state: AppState): LibraryRow[] {
  const rows: LibraryRow[] = []
  for (const list of Object.values(state.customs)) {
    for (const made of list) {
      const who = holders(state, made.titre)
      rows.push({
        key: `${made.type}:${made.titre}`,
        title: made.titre,
        meta: `${made.type} · ${made.duree}${who.length ? ` · ${who.join(', ')}` : ''}`,
        made,
      })
    }
  }
  return rows
}

/* Quiz proposé -------------------------------------------------------- */

function QuizItem({ question }: { question: QuizQuestion }) {
  return (
    <li className={s.quizItem}>
      <div className={s.quizQuestion}>{question.question}</div>
      <div className={s.options}>
        {question.options.map((option, i) => (
          <div key={option} className={s.option}>
            <span className={i === question.correct ? s.dotOk : s.dot} aria-hidden />
            <span className={i === question.correct ? s.optionOk : s.optionText}>{option}</span>
          </div>
        ))}
      </div>
      {question.feedback ? <div className={s.feedback}>{question.feedback}</div> : null}
    </li>
  )
}

/* Écran ---------------------------------------------------------------- */

/**
 * Atelier de modules : un brief à gauche, le module rédigé par l'IA à droite.
 * Rien ne part chez un patient tant que la consigne n'a pas été relue et les
 * destinataires cochés.
 */
export function AtelierView() {
  const { state, set } = useStore()
  const cabinet = useMaybeCabinet()
  /** Assignation en cours : le bouton ne se reclique pas. */
  const [assignation, setAssignation] = useState(false)
  const mod = state.aMod
  const rows = libraryRows(state)
  const selected = state.patientOrder.filter((key) => state.aAssign[key])

  async function generate() {
    const intent = state.aIntent.trim()
    // Un brief trop court ne produit qu'un module générique : on refuse avant l'appel.
    if (intent.length < 15) {
      set({ aNotice: 'Décrivez en une phrase ou deux ce que le module doit faire travailler.' })
      return
    }
    const type = state.aType
    set({ aGen: true, aNotice: '' })
    try {
      const generated = await generateModule({ intent, type, quiz: state.aQuiz })
      set({ aMod: { ...generated, type }, aGen: false, aAssign: {}, aLastAssigned: '' })
    } catch (error) {
      const reason = error instanceof AiError ? error.message : "le serveur n'a pas répondu"
      set({ aGen: false, aNotice: `La génération a échoué : ${reason}. Réessayez.` })
    }
  }

  async function assign() {
    /* Sans garde, un second clic pendant l'écriture insérait le module une
       deuxième fois au parcours : deux lignes pour la même patiente, parfois
       à la même position, et cocher l'une cochait l'autre. */
    if (!mod || !selected.length || assignation || state.aGen) return
    const title = mod.titre || 'Module sur mesure'
    const duree = mod.duree || 'Quelques minutes'
    const quand = mod.quand || 'Comme indiqué sur le module'
    const entry: CustomModule = { ...mod, titre: title, duree, quand }

    // Cabinet réel : bibliothèque et parcours s'écrivent en base, puis la
    // fiche est rechargée depuis là.
    if (cabinet?.reel) {
      setAssignation(true)
      set({ aNotice: '' })
      const r = await cabinet.assignerModule(entry, selected)
      setAssignation(false)
      set({
        aNotice: r.ok ? '' : r.message,
        aAssign: r.ok ? {} : state.aAssign,
        aLastAssigned: r.ok ? selected.map((key) => state.patients[key]?.name ?? '').filter(Boolean).join(', ') : '',
      })
      return
    }
    set((prev) => {
      const extra = { ...prev.extra }
      selected.forEach((key) => {
        extra[key] = (prev.extra[key] ?? []).concat([
          { title, meta: `${duree} · ${quand}`, kind: entry.type, done: false, fresh: true },
        ])
      })
      // Le module rejoint la bibliothèque du cabinet, rangé par type.
      const list = prev.customs[entry.type] ?? []
      const known = list.some((made) => made.titre === title)
      return {
        extra,
        customs: {
          ...prev.customs,
          [entry.type]: known
            ? list.map((made) => (made.titre === title ? entry : made))
            : list.concat([entry]),
        },
        aNotice: '',
        aLastAssigned: selected.map((key) => state.patients[key].name).join(', '),
      }
    })
  }

  function reopen(made: CustomModule) {
    set({ aMod: made, aAssign: {}, aLastAssigned: '', aNotice: '' })
  }

  function togglePatient(key: PatientId) {
    set((prev) => ({ aAssign: { ...prev.aAssign, [key]: !prev.aAssign[key] } }))
  }

  return (
    <div className={s.wrap}>
      <div className={s.crumb}>
        <Overline>Atelier de modules</Overline>
      </div>
      <h1 className={s.h1}>Créer un module sur mesure</h1>
      <p className={s.intro}>
        Décrivez ce que vous voulez faire travailler entre deux séances. L'IA propose une consigne
        en trois temps, un « pourquoi » destiné au patient et, si vous le souhaitez, un court quiz
        de compréhension. Vous corrigez, puis vous assignez le module aux patients concernés.
      </p>

      <div className={s.grid}>
        <div className={s.col}>
          <Card padded={false} className={s.brief}>
            <div className={s.label}>
              <Overline>Votre intention</Overline>
            </div>
            <TextArea
              className={s.intent}
              rows={5}
              value={state.aIntent}
              onChange={(e) => set({ aIntent: e.target.value })}
              placeholder="Ex. : aider Camille à faire quelque chose de précis dans les vingt minutes qui suivent une contrariété, sans chercher à empêcher l'envie de fumer."
            />
            <div className={s.seeds}>
              {ATELIER_SEEDS.map((seed) => (
                <button
                  key={seed}
                  type="button"
                  className={s.seed}
                  onClick={() => set({ aIntent: ATELIER_SEED_BRIEFS[seed] ?? seed })}
                >
                  {seed}
                </button>
              ))}
            </div>

            <div className={`${s.label} ${s.labelGap}`}>
              <Overline>Type de module</Overline>
            </div>
            <div className={s.types}>
              {ATELIER_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={type === state.aType ? `${s.type} ${s.typeOn}` : s.type}
                  aria-pressed={type === state.aType}
                  onClick={() => set({ aType: type })}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className={s.quizToggle}>
              <SquareCheck
                on={state.aQuiz}
                label="Ajouter un quiz de compréhension"
                onClick={() => set((prev) => ({ aQuiz: !prev.aQuiz }))}
              />
              <div className={s.quizText}>
                <span className={s.quizTitle}>Ajouter un quiz de compréhension</span>
                <span className={s.quizHint}>
                  Deux questions, pour vérifier que la consigne a été comprise avant de la faire.
                </span>
              </div>
            </div>

            <Button
              variant="primary"
              block
              className={s.gen}
              disabled={state.aGen}
              onClick={() => void generate()}
            >
              {state.aGen ? 'Rédaction du module…' : 'Générer le module'}
            </Button>
            {state.aNotice ? <div className={s.notice}>{state.aNotice}</div> : null}
          </Card>

          {rows.length > 0 && (
            <Card padded={false} className={s.library}>
              <div className={s.libraryHead}>
                <Title>Modules du cabinet</Title>
              </div>
              <div className={s.librarySub}>Créés par vous, réutilisables pour d'autres patients.</div>
              <ul className={s.libraryList}>
                {rows.map((row) => (
                  <li key={row.key} className={s.libraryRow}>
                    <div className={s.libraryText}>
                      <span className={s.libraryTitle}>{row.title}</span>
                      <span className={s.libraryMeta}>{row.meta}</span>
                    </div>
                    <button type="button" className={s.small} onClick={() => reopen(row.made)}>
                      Ouvrir
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {mod ? (
          <div className={s.col}>
            <Card padded={false} flush className={s.module}>
              <div className={s.moduleTop}>
                <div className={s.moduleTags}>
                  <span className={s.kind}>{mod.type}</span>
                  <span className={s.draft}>Brouillon, modifiable</span>
                </div>
                <TextInput
                  className={s.moduleTitle}
                  value={mod.titre}
                  aria-label="Titre du module"
                  onChange={(e) => {
                    const titre = e.target.value
                    set((prev) => ({ aMod: prev.aMod ? { ...prev.aMod, titre } : prev.aMod }))
                  }}
                />
              </div>

              <div className={s.facts}>
                <div className={s.fact}>
                  <div className={s.factLabel}>Durée</div>
                  <div className={s.factValue}>{mod.duree}</div>
                </div>
                <div className={s.fact}>
                  <div className={s.factLabel}>Quand</div>
                  <div className={s.factValue}>{mod.quand}</div>
                </div>
              </div>

              <div className={s.steps}>
                <div className={s.stepsLabel}>
                  <Overline>La consigne</Overline>
                </div>
                <ol className={s.stepList}>
                  {mod.steps.map((step, i) => (
                    <li key={step} className={s.step}>
                      <span className={s.stepNum} aria-hidden>
                        {i + 1}
                      </span>
                      <span className={s.stepText}>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {mod.pourquoi ? (
                <div className={s.whyWrap}>
                  <div className={s.why}>
                    <div className={s.whyLabel}>Pourquoi cet exercice</div>
                    <div className={s.whyText}>{mod.pourquoi}</div>
                  </div>
                </div>
              ) : null}

              {mod.quiz.length > 0 && (
                <div className={s.quiz}>
                  <div className={s.quizLabel}>
                    <Overline>Quiz proposé</Overline>
                  </div>
                  <ul className={s.quizList}>
                    {mod.quiz.map((question) => (
                      <QuizItem key={question.question} question={question} />
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <Card padded={false} className={s.assign}>
              <div className={s.assignHead}>
                <h2 className={s.assignTitle}>Assigner à</h2>
                <span className={s.assignCount}>
                  {selected.length
                    ? plural(selected.length, 'patient sélectionné', 'patients sélectionnés')
                    : 'Aucun patient sélectionné'}
                </span>
              </div>
              <div className={s.assignSub}>
                Le module apparaît dans leur parcours de la semaine et dans leur application.
              </div>
              <div className={s.people}>
                {state.patientOrder.map((key) => {
                  const patient = state.patients[key]
                  const on = !!state.aAssign[key]
                  const has = porteLeModule(state, key, mod.titre)
                  return (
                    <button
                      key={key}
                      type="button"
                      className={on ? `${s.person} ${s.personOn}` : s.person}
                      aria-pressed={on}
                      onClick={() => togglePatient(key)}
                    >
                      <span className={on ? `${s.box} ${s.boxOn}` : s.box} aria-hidden>
                        {on ? '✓' : ''}
                      </span>
                      <span className={s.personText}>
                        <span className={s.personName}>{patient.name}</span>
                        <span className={s.personSub}>{patient.subtitle}</span>
                      </span>
                      {has ? <span className={s.personNote}>déjà assigné</span> : null}
                    </button>
                  )
                })}
              </div>
              <div className={s.assignFoot}>
                <Button
                  variant="primary"
                  className={s.assignBtn}
                  disabled={selected.length === 0 || assignation}
                  onClick={() => void assign()}
                >
                  {assignation
                    ? 'Assignation…'
                    : selected.length
                      ? `Assigner à ${plural(selected.length, 'patient', 'patients')}`
                      : 'Assigner'}
                </Button>
                <span className={s.assignHint}>
                  {state.aLastAssigned
                    ? `Ajouté au parcours de ${state.aLastAssigned}.`
                    : 'Le module rejoint aussi la bibliothèque du cabinet.'}
                </span>
              </div>
            </Card>
          </div>
        ) : (
          <div className={s.empty}>
            <span className={s.emptyTitle}>Le module apparaîtra ici</span>
            <span className={s.emptyText}>
              Rien n'est envoyé à personne tant que vous n'avez pas relu la consigne et choisi les
              patients.
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
