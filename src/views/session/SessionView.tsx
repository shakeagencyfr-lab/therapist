import { Overline } from '@/components/ui'
import { useAppState } from '@/state/store'
import { ConsentStep } from './ConsentStep'
import { RecordStep } from './RecordStep'
import { DraftStep } from './DraftStep'
import s from './SessionView.module.css'

/**
 * Captation de séance, en trois étapes successives : consentement (bloquant),
 * captation, puis brouillon de note. L'étape courante se déduit de l'état :
 * tant que le consentement n'est pas signé, rien d'autre n'est accessible.
 */
export function SessionView() {
  const state = useAppState()
  const hasDraft = state.draft !== null

  const title = hasDraft
    ? 'Brouillon de note de séance'
    : state.consent
      ? 'Dictaphone de séance'
      : "Avant d'enregistrer"

  const intro = hasDraft
    ? "Rien de tout ceci n'existe dans le dossier de Camille avant que vous ne validiez. Modifiez librement : c'est votre note, pas celle de la machine."
    : state.consent
      ? "L'audio n'est jamais conservé : il est transcrit puis détruit. Seul le texte, chiffré, reste dans le dossier."
      : "Un enregistrement de séance est la donnée la plus sensible d'un cabinet. Le consentement se signe une fois, en présence du patient."

  const badge = hasDraft
    ? 'Étape 3 · Validation'
    : state.consent
      ? 'Étape 2 · Captation'
      : 'Étape 1 · Consentement'

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <div>
          <div className={s.crumb}>
            <Overline>Séance du 8 septembre · Camille R. · Programme Liberté</Overline>
          </div>
          <h1 className={s.h1}>{title}</h1>
        </div>
        <span className={s.badge}>{badge}</span>
      </div>
      <p className={s.intro}>{intro}</p>

      {!state.consent && <ConsentStep />}
      {state.consent && !hasDraft && <RecordStep />}
      {hasDraft && <DraftStep />}
    </div>
  )
}
