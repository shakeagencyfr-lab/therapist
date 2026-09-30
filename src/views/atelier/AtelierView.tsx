import { useState } from 'react'
import { Button, Card, Overline, SquareCheck, TextArea, TextInput, Title } from '@/components/ui'
import { ATELIER_SEEDS, ATELIER_SEED_BRIEFS, ATELIER_TYPES } from '@/data/atelier'
import { DEFINITION_DU_TYPE } from '@/lib/typesDeModules'
import { plural } from '@/lib/format'
import { preparerModule } from '@/lib/moduleAtelier'
import { generateModule, messageDEchec } from '@/services/aiClient'
import { useMaybeCabinet } from '@/cabinet/context'
import { useDevis } from '@/cabinet/useJetons'
import { CoutEnJetons } from '@/views/jetons/CoutEnJetons'
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
 *
 * LE BROUILLON EST MODIFIABLE, POUR DE BON. L'écran annonçait « Brouillon,
 * modifiable » et « Vous corrigez, puis vous assignez » ; seul le titre
 * l'était. Une étape maladroite partait telle quelle chez le patient, ou
 * obligeait à régénérer tout le module — et à le repayer. Durée, moment,
 * chaque étape et le « pourquoi » se corrigent maintenant sur place ; le quiz,
 * qui ne se montre qu'à l'assignation, reste tel que proposé.
 */
export function AtelierView() {
  const { state, set } = useStore()
  const cabinet = useMaybeCabinet()
  /** Assignation en cours : le bouton ne se reclique pas. */
  const [assignation, setAssignation] = useState(false)
  /* Un refus d'assigner se dit à côté du bouton d'assignation : dans la
     colonne du brief, à l'autre bout de l'écran, il passait inaperçu. */
  const [refus, setRefus] = useState('')
  const mod = state.aMod
  const rows = libraryRows(state)
  /* En jetons (0065), le module a son prix au barème : il se dit sous le
     bouton, et le bouton se ferme quand le solde ne le couvre plus. */
  const devis = useDevis('module')
  const selected = state.patientOrder.filter((key) => state.aAssign[key])

  /** Corrige le brouillon affiché, champ par champ. */
  function corriger(patch: Partial<CustomModule>) {
    set((prev) => ({ aMod: prev.aMod ? { ...prev.aMod, ...patch } : prev.aMod }))
  }

  function corrigerEtape(i: number, texte: string) {
    set((prev) =>
      prev.aMod ? { aMod: { ...prev.aMod, steps: prev.aMod.steps.map((e, j) => (j === i ? texte : e)) } } : {},
    )
  }

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
      /* Le message du serveur, tel quel : c'est déjà une phrase complète,
         qui dit la cause et le remède. L'enrober dans « La génération a
         échoué : ….. Réessayez. » doublait le point et invitait à réessayer
         une praticienne dont la clé manque. */
      set({
        aGen: false,
        aNotice: messageDEchec(error, "Le module n'a pas pu être écrit. Votre brief est intact : relancez la génération."),
      })
    }
  }

  async function assign() {
    /* Sans garde, un second clic pendant l'écriture insérait le module une
       deuxième fois au parcours : deux lignes pour le même patient, parfois
       à la même position, et cocher l'une cochait l'autre. */
    if (!mod || !selected.length || assignation || state.aGen) return
    const preparation = preparerModule(mod)
    if (!preparation.ok) {
      setRefus(preparation.message)
      return
    }
    setRefus('')
    const entry = preparation.module
    const { titre: title, duree, quand } = entry

    // Cabinet réel : bibliothèque et parcours s'écrivent en base, puis la
    // fiche est rechargée depuis là.
    if (cabinet?.reel) {
      setAssignation(true)
      set({ aNotice: '' })
      const r = await cabinet.assignerModule(entry, selected)
      setAssignation(false)
      setRefus(r.ok ? '' : r.message || "Le module n'a pas pu être assigné.")
      set({
        // L'écran montre ce qui est parti : les étapes vidées n'y sont plus.
        aMod: r.ok ? entry : state.aMod,
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
        aMod: entry,
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
    setRefus('')
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
        pas à pas, en quatre à six étapes, un « pourquoi » destiné au patient et, si vous le
        souhaitez, un court quiz de compréhension. Vous corrigez chaque étape sur place, puis vous
        assignez le module aux patients concernés.
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
            {DEFINITION_DU_TYPE[state.aType] ? (
              <p className={s.typeHint} aria-live="polite">
                <strong className={s.typeHintNom}>{state.aType}</strong> — {DEFINITION_DU_TYPE[state.aType]}
              </p>
            ) : null}

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
              disabled={state.aGen || Boolean(devis?.manque)}
              onClick={() => void generate()}
            >
              {state.aGen ? 'Rédaction du module…' : 'Générer le module'}
            </Button>
            <CoutEnJetons devis={devis} sujet="Ce module" />
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
                  <span className={s.draft}>Brouillon, modifiable avant assignation</span>
                </div>
                <TextInput
                  className={s.moduleTitle}
                  value={mod.titre}
                  aria-label="Titre du module"
                  onChange={(e) => corriger({ titre: e.target.value })}
                />
              </div>

              <div className={s.facts}>
                <label className={s.fact}>
                  <span className={s.factLabel}>Durée</span>
                  <input
                    className={s.factInput}
                    value={mod.duree}
                    onChange={(e) => corriger({ duree: e.target.value })}
                  />
                </label>
                <label className={s.fact}>
                  <span className={s.factLabel}>Quand</span>
                  <input
                    className={s.factInput}
                    value={mod.quand}
                    onChange={(e) => corriger({ quand: e.target.value })}
                  />
                </label>
              </div>

              <div className={s.steps}>
                <div className={s.stepsLabel}>
                  <Overline>La consigne</Overline>
                </div>
                <ol className={s.stepList}>
                  {/* La clé est la place de l'étape, pas son texte : une clé
                      qui change à chaque frappe remonterait le champ, et le
                      curseur en sortirait. */}
                  {mod.steps.map((step, i) => (
                    <li key={i} className={s.step}>
                      <span className={s.stepNum} aria-hidden>
                        {i + 1}
                      </span>
                      <textarea
                        className={s.stepInput}
                        value={step}
                        rows={Math.max(2, Math.ceil(step.length / 60))}
                        aria-label={`Étape ${i + 1} de la consigne`}
                        onChange={(e) => corrigerEtape(i, e.target.value)}
                      />
                      <button
                        type="button"
                        className={s.stepRemove}
                        aria-label={`Retirer l'étape ${i + 1}`}
                        onClick={() => corriger({ steps: mod.steps.filter((_, j) => j !== i) })}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  className={s.stepAdd}
                  onClick={() => corriger({ steps: mod.steps.concat(['']) })}
                >
                  + Ajouter une étape
                </button>
              </div>

              <div className={s.whyWrap}>
                <label className={s.why}>
                  <span className={s.whyLabel}>Pourquoi cet exercice</span>
                  <textarea
                    className={s.whyInput}
                    value={mod.pourquoi}
                    rows={Math.max(3, Math.ceil(mod.pourquoi.length / 70))}
                    placeholder="Ce que le patient lira pour comprendre à quoi sert l'exercice."
                    onChange={(e) => corriger({ pourquoi: e.target.value })}
                  />
                </label>
              </div>

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
              {refus ? <div className={s.notice}>{refus}</div> : null}
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
