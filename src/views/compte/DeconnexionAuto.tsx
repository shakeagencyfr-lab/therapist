import { useEffect, useState } from 'react'
import { Card, Notice, Segmented, Title } from '@/components/ui'
import { useMaybeAuth } from '@/auth/session'
import { DELAIS_INACTIVITE, libelleDelai, lireDelai, type DelaiInactivite } from '@/lib/inactivite'
import { reglerDelaiInactivite } from '@/services/securiteDuCompte'
import s from './Securite.module.css'

/** Les libellés courts du commutateur ; la phrase complète vient de libelleDelai. */
const COURT: Record<DelaiInactivite, string> = { 0: 'Jamais', 15: '15 min', 30: '30 min', 60: '1 heure' }

/**
 * Au bout de combien de temps sans geste la session se ferme sur l'appareil.
 *
 * Le réglage suit la personne d'un appareil à l'autre (métadonnées du
 * compte) ; la garde elle-même est dans src/auth/Inactivite.tsx.
 */
export function DeconnexionAuto() {
  const auth = useMaybeAuth()
  const enregistre = lireDelai(auth?.session?.user.user_metadata)
  const [choix, setChoix] = useState<DelaiInactivite>(enregistre)
  const [envoi, setEnvoi] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  // Réglé depuis un autre appareil, ou la session relue : l'écran suit.
  useEffect(() => {
    setChoix(enregistre)
  }, [enregistre])

  async function choisir(valeur: DelaiInactivite) {
    if (valeur === choix || envoi) return
    setChoix(valeur)
    setEnvoi(true)
    setNotice(null)
    const r = await reglerDelaiInactivite(valeur)
    setEnvoi(false)
    if (!r.ok) {
      setChoix(enregistre)
      setNotice({ tone: 'warn', text: r.message })
      return
    }
    setNotice({
      tone: 'ok',
      text:
        valeur === 0
          ? 'Enregistré : votre session ne se fermera plus d’elle-même.'
          : `Enregistré : après ${libelleDelai(valeur).replace('1 heure', 'une heure')} sans activité, votre session se fermera sur l'appareil.`,
    })
  }

  return (
    <Card className={s.bloc}>
      <div className={s.head}>
        <Title large as="h2">
          Déconnexion automatique
        </Title>
        <span className={s.etat}>{libelleDelai(choix)}</span>
      </div>
      <p className={s.texte}>
        Sur un poste partagé — secrétariat, salle d'attente, ordinateur prêté —, une session
        laissée ouverte montre votre espace à qui passe devant. Au bout du délai choisi sans aucun
        geste, elle se ferme sur l'appareil ; une minute avant, un avertissement vous laisse la
        garder d'un simple geste.
        {auth?.context?.cabinet ? ' Jamais pendant qu’une séance s’enregistre.' : ''} Ce réglage
        vous suit sur tous vos appareils.
      </p>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <div className={s.choix} role="group" aria-label="Délai avant la déconnexion automatique">
        <Segmented
          options={DELAIS_INACTIVITE.map((d) => ({ value: String(d), label: COURT[d] }))}
          value={String(choix)}
          onChange={(v) => void choisir(Number(v) as DelaiInactivite)}
        />
        {envoi ? <span className={s.hint}>Enregistrement…</span> : null}
      </div>
      {choix === 0 ? (
        <p className={s.hint}>
          Réservez « Jamais » à un appareil personnel, que personne d'autre n'utilise.
        </p>
      ) : null}
    </Card>
  )
}
