import { useState } from 'react'
import { Button, Card, Notice, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { consentPoints } from '@/data/session'
import { useStore } from '@/state/store'
import s from './ConsentStep.module.css'

/** Étape 2 : le consentement est bloquant, rien ne s'enregistre avant lui. */
export function ConsentStep() {
  const { state, set } = useStore()
  const cabinet = useMaybeCabinet()
  const patient = state.patients[state.sessionPatient]
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState('')

  // Le consentement se donne par quelqu'un : sans fiche, il n'y a rien à signer.
  if (!patient) return null

  const prenom = patient.name.split(' ')[0]

  /**
   * Signer ouvre la séance en base, horodatée : c'est la pièce qui autorise
   * la captation, et elle doit survivre à la page. Sur les fiches de
   * démonstration, rien n'est écrit.
   */
  async function signer() {
    if (!cabinet?.reel) {
      set({ consent: true })
      return
    }
    setEnvoi(true)
    setEchec('')
    const r = await cabinet.ouvrirSeance(state.sessionPatient)
    setEnvoi(false)
    if (!r.ok) {
      setEchec(r.message)
      return
    }
    set({ consent: true, sessionId: r.id ?? null })
  }

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
      {echec ? (
        <div className={s.notice}>
          <Notice tone="warn">{echec}</Notice>
        </div>
      ) : null}
      <div className={s.foot}>
        <Button variant="primary" className={s.sign} onClick={() => void signer()} disabled={envoi}>
          {envoi ? 'Enregistrement…' : `${prenom} a donné son accord, signer`}
        </Button>
        {/* « depuis l'espace patient » : cet écran n'existe pas, et n'a jamais
            existé. La révocation passe par la thérapeute — c'est elle qui est
            dans la pièce. */}
        <span className={s.hint}>
          Révocable à tout moment : il suffit de le dire, l'enregistrement s'arrête et ce qui a
          été pris est supprimé.
        </span>
      </div>
    </Card>
  )
}
