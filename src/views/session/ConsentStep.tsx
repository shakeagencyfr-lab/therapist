import { Button, Card, Title } from '@/components/ui'
import { consentPoints } from '@/data/session'
import { useStore } from '@/state/store'
import s from './ConsentStep.module.css'

/** Étape 2 : le consentement est bloquant, rien ne s'enregistre avant lui. */
export function ConsentStep() {
  const { state, set } = useStore()
  const patient = state.patients[state.sessionPatient]

  // Le consentement se donne par quelqu'un : sans fiche, il n'y a rien à signer.
  if (!patient) return null

  const prenom = patient.name.split(' ')[0]

  return (
    <Card padded={false} className={s.card}>
      <div className={s.heading}>
        <Title large as="h2">
          Consentement du patient
        </Title>
      </div>
      <div className={s.points}>
        {consentPoints(prenom).map((point) => (
          <div className={s.point} key={point}>
            <span className={s.dot} aria-hidden />
            <span className={s.text}>{point}</span>
          </div>
        ))}
      </div>
      <div className={s.foot}>
        <Button variant="primary" className={s.sign} onClick={() => set({ consent: true })}>
          {prenom} a donné son accord, signer
        </Button>
        <span className={s.hint}>Révocable à tout moment depuis l'espace patient.</span>
      </div>
    </Card>
  )
}
