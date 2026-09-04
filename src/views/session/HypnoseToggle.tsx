import { useMaybeCabinet } from '@/cabinet/context'
import { COUT_HYPNOSE } from '@/lib/coutIA'
import { euro } from '@/lib/format'
import { useStore } from '@/state/store'
import s from './HypnoseToggle.module.css'

/**
 * La case qui décide de l'hypnose.
 *
 * UN SEUL MOMENT, et c'est en lisant la note. Elle se posait aussi à l'écran
 * d'enregistrement, avant de lancer l'analyse ; mais elle n'y conditionnait
 * pas le lancement — elle réglait la fiche, et l'étape suivante reposait la
 * même question avec, elle, le bouton qui écrit. Demander deux fois un choix
 * dont une seule réponse agit, c'est le demander trop tôt : on ne sait pas
 * encore s'il y a matière.
 *
 * ELLE PORTE SON PRIX. C'est l'appel le plus cher du produit, et le chiffre
 * doit se lire au moment de cocher — pas après, quand l'option est déjà
 * ouverte et qu'il ne reste qu'à cliquer.
 *
 * Cocher ici ouvre aussi les prochaines séances de ce patient : c'est le même
 * réglage que sur sa fiche, pas un doublon. L'état local mirroite la fiche :
 * l'écran répond au clic sans attendre la base, et la démonstration
 * fonctionne sans base du tout.
 */
export function HypnoseToggle({
  actif,
  onChange,
  disabled = false,
}: {
  actif: boolean
  onChange: (actif: boolean) => void
  disabled?: boolean
}) {
  const { state } = useStore()
  const cabinet = useMaybeCabinet()
  const patient = state.patients[state.sessionPatient]
  if (!patient) return null

  const prenom = patient.name.split(' ')[0] ?? patient.name

  return (
    <label className={s.bascule}>
      <input
        type="checkbox"
        checked={actif}
        disabled={disabled}
        onChange={(e) => {
          const suivant = e.target.checked
          onChange(suivant)
          void cabinet?.reglerHypnose(state.sessionPatient, suivant)
        }}
      />
      <span>
        <span className={s.titre}>Écrire une hypnose pour {prenom}</span>
        <span className={s.hint}>
          Une séance complète, bâtie sur les formulations relevées ci-dessus et lisible à voix
          haute. C'est l'analyse la plus coûteuse du produit — environ {euro(COUT_HYPNOSE)} —
          alors cochez-la quand elle sert. Le réglage vaut aussi pour ses prochaines séances.
        </span>
      </span>
    </label>
  )
}
