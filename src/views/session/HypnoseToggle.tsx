import { useMaybeCabinet } from '@/cabinet/context'
import { hypnoseOuverte, useDroits } from '@/cabinet/droits'
import { useDevis } from '@/cabinet/useJetons'
import { COUT_HYPNOSE, COUT_HYPNOSE_MAX } from '@/lib/coutIA'
import { euro } from '@/lib/format'
import { jetonsDits, resteDit } from '@/lib/jetonsIA'
import { useStore } from '@/state/store'
import { VerrouHypnose } from '@/views/jetons/VerrouHypnose'
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
 * ouverte et qu'il ne reste qu'à cliquer. Deux hypnoses facturées ne font
 * pas une mesure fiable : on annonce le plafond, « jusqu'à », et ce que les
 * hypnoses ont coûté jusqu'ici à côté.
 *
 * Cocher ici ouvre aussi les prochaines séances de ce patient : c'est le même
 * réglage que sur sa fiche, pas un doublon. L'état local mirroite la fiche :
 * l'écran répond au clic sans attendre la base, et la démonstration
 * fonctionne sans base du tout.
 *
 * EN JETONS (0065), le prix se dit en jetons — celui du barème du revendeur,
 * pour les quatre mouvements. Et quand l'offre ne comprend pas l'hypnose, la
 * case laisse la place au verrou qui dit comment l'ouvrir.
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
  const droits = useDroits()
  const devis = useDevis('hypnose')
  const patient = state.patients[state.sessionPatient]
  if (!patient) return null
  if (!hypnoseOuverte(droits)) return <VerrouHypnose />

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
        {devis ? (
          <span className={s.hint}>
            Une séance complète, bâtie sur les formulations relevées ci-dessus et lisible à voix
            haute. C'est l'analyse la plus coûteuse du produit — {jetonsDits(devis.cout)} pour ses
            quatre mouvements, {resteDit(devis.solde)} — alors cochez-la quand elle sert. Le réglage
            vaut aussi pour ses prochaines séances.
          </span>
        ) : (
          <span className={s.hint}>
            Une séance complète, bâtie sur les formulations relevées ci-dessus et lisible à voix
            haute. C'est l'analyse la plus coûteuse du produit — jusqu'à {euro(COUT_HYPNOSE_MAX)}, et
            autour de {euro(COUT_HYPNOSE)} pour les hypnoses écrites jusqu'ici — alors cochez-la
            quand elle sert. Le réglage vaut aussi pour ses prochaines séances.
          </span>
        )}
      </span>
    </label>
  )
}
