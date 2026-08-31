import { Button, Card, Title } from '@/components/ui'
import { CONSENT_POINTS } from '@/data/session'
import { useSetState } from '@/state/store'
import s from './ConsentStep.module.css'

/** Étape 1 : le consentement est bloquant, rien ne s'enregistre avant lui. */
export function ConsentStep() {
  const set = useSetState()
  return (
    <Card padded={false} className={s.card}>
      <div className={s.heading}>
        <Title large as="h2">
          Consentement du patient
        </Title>
      </div>
      <div className={s.points}>
        {CONSENT_POINTS.map((point) => (
          <div className={s.point} key={point}>
            <span className={s.dot} aria-hidden />
            <span className={s.text}>{point}</span>
          </div>
        ))}
      </div>
      <div className={s.foot}>
        <Button variant="primary" className={s.sign} onClick={() => set({ consent: true })}>
          Camille a donné son accord, signer
        </Button>
        <span className={s.hint}>Révocable à tout moment depuis l'espace patient.</span>
      </div>
    </Card>
  )
}
