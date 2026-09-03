import { Avatar, Button, Card } from '@/components/ui'
import { nouvelleSeance, riskColor } from '@/state/selectors'
import { useStore } from '@/state/store'
import s from './PatientPick.module.css'

/**
 * Étape 1 : pour qui.
 *
 * Une séance n'existe pas en l'air — elle se rattache à une fiche, celle qui
 * recevra la note, les modules et les audios. Tant qu'aucune n'est choisie,
 * il n'y a ni consentement à signer ni micro à ouvrir : c'est pourquoi cet
 * écran précède tout le reste plutôt que d'être un réglage parmi d'autres.
 */
export function PatientPick() {
  const { state, set } = useStore()
  const fiches = state.patientOrder

  if (!fiches.length) {
    return (
      <Card className={s.empty}>
        <h2 className={s.emptyTitle}>Aucune fiche dans ce cabinet</h2>
        <p className={s.emptyBody}>
          Une séance se rattache à une fiche. Ouvrez-en une, avec un nom et une adresse : c'est
          tout ce qu'il faut pour enregistrer.
        </p>
        <Button
          variant="primary"
          onClick={() => set({ mode: 'therapist', pNewOpen: true, pNotice: '' })}
        >
          Ajouter un patient
        </Button>
      </Card>
    )
  }

  return (
    <Card padded={false} className={s.card}>
      <div className={s.list}>
        {fiches.map((id) => {
          const patient = state.patients[id]
          if (!patient) return null
          return (
            <button
              key={id}
              type="button"
              className={s.row}
              onClick={() =>
                /* Choisir, c'est ouvrir une séance neuve : rien de la
                   précédente ne doit rester. La fiche latérale suit, pour que
                   « Voir le parcours » ouvre bien celle-là. */
                set({ ...nouvelleSeance(id), sel: id, openTask: null, pAudio: 0, playing: false })
              }
            >
              <Avatar initials={patient.initials} />
              <span className={s.who}>
                <span className={s.name}>{patient.name}</span>
                <span className={s.sub}>{patient.subtitle}</span>
              </span>
              <span className={s.facts}>
                <span className={s.fact}>{patient.nextSession}</span>
                <span
                  className={s.dot}
                  style={{ background: riskColor(patient.adherence) }}
                  aria-hidden
                />
              </span>
            </button>
          )
        })}
      </div>
      <p className={s.foot}>
        {state.patientsReels
          ? 'Les fiches de votre cabinet. La note et les modules iront dans celle que vous choisissez.'
          : "Fiches de démonstration. Connectez-vous à votre cabinet pour enregistrer une vraie séance."}
      </p>
    </Card>
  )
}
