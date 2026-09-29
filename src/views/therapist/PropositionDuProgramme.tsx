import { Notice } from '@/components/ui'
import { useParcoursTypes } from '@/cabinet/useParcoursTypes'
import { useAppState } from '@/state/store'
import type { PatientId } from '@/types/domain'
import { VueProposerParcours } from '../programmes/ProposerParcours'

/**
 * Le programme vient d'être posé sur la fiche : on propose son parcours par
 * défaut à cette personne (0059), comme l'écran des programmes le fait à
 * l'attribution. Rien ne se lit tant qu'aucun programme n'a changé.
 *
 * Un programme sans parcours ne propose rien, et ne dit rien : il n'y a rien
 * à décider. Une lecture ratée, elle, se dit — sinon la praticienne ne
 * saurait pas qu'une proposition lui a échappé.
 */
export function PropositionDuProgramme({
  programme,
  patientId,
  onFermer,
}: {
  programme: string
  patientId: PatientId
  onFermer: () => void
}) {
  const state = useAppState()
  const parcours = useParcoursTypes(true, state.programmes.join('|'))
  const fiche = state.patients[patientId]
  const prog = parcours.programmes[programme]

  if (!fiche) return null
  if (parcours.etat === 'echec') {
    return (
      <Notice tone="warn" style={{ marginBottom: 18 }}>
        Le parcours par défaut de « {programme} » n'a pas pu être lu : vous pourrez le proposer à{' '}
        {fiche.name} depuis l'écran des programmes.
      </Notice>
    )
  }
  if (parcours.etat !== 'pret' || !prog || !prog.exercices.length) return null

  return (
    <VueProposerParcours
      programme={programme}
      exercices={prog.exercices}
      personnes={[
        {
          id: patientId,
          nom: fiche.name,
          parcours: fiche.modules.map((m) => ({ title: m.title, kind: m.kind })),
        },
      ]}
      onAjouter={(patient, ids) => parcours.appliquer(prog.id, patient, ids)}
      onFermer={onFermer}
    />
  )
}
