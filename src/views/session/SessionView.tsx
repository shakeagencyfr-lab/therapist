import { Overline } from '@/components/ui'
import { dateDuJour } from '@/lib/format'
import { nouvelleSeance } from '@/state/selectors'
import { useStore } from '@/state/store'
import { PatientPick } from './PatientPick'
import { ConsentStep } from './ConsentStep'
import { RecordStep } from './RecordStep'
import { DraftStep } from './DraftStep'
import s from './SessionView.module.css'

/**
 * Captation de séance, en quatre étapes successives : la fiche concernée,
 * le consentement (bloquant), la captation, puis le brouillon de note.
 *
 * L'étape courante se déduit de l'état plutôt que d'un compteur : tant
 * qu'aucune fiche n'est choisie il n'y a pas de séance, et tant que le
 * consentement n'est pas signé, rien d'autre n'est accessible.
 */
export function SessionView() {
  const { state, set } = useStore()
  const patient = state.patients[state.sessionPatient]
  const hasDraft = state.draft !== null

  const step = !patient ? 1 : !state.consent ? 2 : !hasDraft ? 3 : 4
  const prenom = patient ? patient.name.split(' ')[0] : ''

  /* Les quatre étapes, en regard : titre, phrase d'accroche et pastille.
     Les garder ensemble évite qu'un ajout d'étape n'en décale qu'une. */
  const { title, intro, badge } = [
    {
      title: 'Pour qui est cette séance ?',
      intro:
        "Une séance se rattache à une fiche : c'est elle qui recevra la note, les modules et les audios. Choisissez la personne que vous recevez.",
      badge: 'Étape 1 · Patient',
    },
    {
      title: "Avant d'enregistrer",
      intro:
        "Un enregistrement de séance est la donnée la plus sensible d'un cabinet. Le consentement se signe une fois, en présence du patient.",
      badge: 'Étape 2 · Consentement',
    },
    {
      title: 'Dictaphone de séance',
      intro:
        "L'audio n'est jamais conservé : il est transcrit puis détruit. Seul le texte, chiffré, reste dans le dossier.",
      badge: 'Étape 3 · Captation',
    },
    {
      title: 'Brouillon de note de séance',
      intro: `Rien de tout ceci n'existe dans le dossier de ${prenom} avant que vous ne validiez. Modifiez librement : c'est votre note, pas celle de la machine.`,
      badge: 'Étape 4 · Validation',
    },
  ][step - 1]

  const crumb = patient
    ? `Séance du ${dateDuJour()} · ${patient.name}${patient.program ? ` · ${patient.program}` : ''}`
    : `Séance du ${dateDuJour()}`

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <div>
          <div className={s.crumb}>
            <Overline>{crumb}</Overline>
            {/* Se tromper de fiche est l'erreur la plus coûteuse ici : la
                sortie reste ouverte tant que la note n'est pas envoyée. */}
            {patient && !state.sent ? (
              <button type="button" className={s.change} onClick={() => set(nouvelleSeance())}>
                Changer de patient
              </button>
            ) : null}
          </div>
          <h1 className={s.h1}>{title}</h1>
        </div>
        <span className={s.badge}>{badge}</span>
      </div>
      <p className={s.intro}>{intro}</p>

      {step === 1 && <PatientPick />}
      {step === 2 && <ConsentStep />}
      {step === 3 && <RecordStep />}
      {step === 4 && <DraftStep />}
    </div>
  )
}
