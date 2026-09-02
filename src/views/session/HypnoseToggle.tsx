import { useMaybeCabinet } from '@/cabinet/context'
import { useStore } from '@/state/store'
import s from './HypnoseToggle.module.css'

/**
 * La case qui décide de l'hypnose.
 *
 * Une seule implémentation, posée à DEUX moments de la séance, parce que la
 * décision se prend à l'un ou à l'autre selon les praticiennes : avant de
 * lancer l'analyse, quand on sait déjà où va la séance et qu'on voit ce
 * qu'elle coûtera ; ou après avoir lu la note, quand on découvre qu'il y a
 * matière. C'est le même réglage aux deux endroits — le cocher ici le coche
 * là-bas, et l'ouvre pour les prochaines séances de cette patiente.
 *
 * L'état local mirroite la fiche : l'écran répond au clic sans attendre la
 * base, et la démonstration fonctionne sans base du tout.
 */
export function HypnoseToggle({
  actif,
  onChange,
  compact = false,
  disabled = false,
}: {
  actif: boolean
  onChange: (actif: boolean) => void
  /** Version courte, pour l'écran d'enregistrement où la place manque. */
  compact?: boolean
  disabled?: boolean
}) {
  const { state } = useStore()
  const cabinet = useMaybeCabinet()
  const patient = state.patients[state.sessionPatient]
  if (!patient) return null

  const prenom = patient.name.split(' ')[0] ?? patient.name

  return (
    <label className={compact ? `${s.bascule} ${s.compact}` : s.bascule}>
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
          {compact
            ? "Une séance complète d'environ trente minutes, bâtie sur ses mots, à lire à voix haute. Elle s'écrit après la note."
            : "Une séance complète, bâtie sur les formulations relevées ci-dessus et lisible à voix haute. C'est l'analyse la plus coûteuse du produit : cochez-la quand elle sert. Le réglage vaut aussi pour ses prochaines séances."}
        </span>
      </span>
    </label>
  )
}
