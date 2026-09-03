import { useState } from 'react'
import { Button, Card, Notice, TextInput, Title } from '@/components/ui'
import { useAuth } from '@/auth/session'
import s from './MotDePasse.module.css'

/**
 * Poser ou changer son mot de passe.
 *
 * Le lien magique reste la voie normale, et la meilleure : rien à retenir,
 * rien à voler, rien à réinitialiser. Mais il dépend du courriel — qui met
 * parfois du temps, finit dans les indésirables, ou bute sur le quota
 * d'envoi du service. Une praticienne avec un patient en face d'elle ne
 * peut pas attendre.
 *
 * Le mot de passe n'est donc jamais imposé : c'est une porte de secours que
 * chacune ouvre si elle le veut. Les deux voies restent valables ensuite.
 */
export function MotDePasse() {
  const { definirMotDePasse, session } = useAuth()
  const [valeur, setValeur] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  if (!session) return null

  const assezLong = valeur.length >= 10
  const identiques = valeur === confirmation
  const pret = assezLong && identiques && !envoi

  async function enregistrer() {
    setEnvoi(true)
    setNotice(null)
    const r = await definirMotDePasse(valeur)
    setEnvoi(false)
    if (r.ok) {
      setValeur('')
      setConfirmation('')
      setNotice({
        tone: 'ok',
        text: 'Mot de passe enregistré. Vous pouvez désormais vous connecter avec, ou continuer par lien.',
      })
    } else {
      setNotice({ tone: 'warn', text: r.message })
    }
  }

  return (
    <Card className={s.bloc}>
      <div className={s.head}>
        <Title large as="h2">
          Mot de passe
        </Title>
        <span className={s.etat}>Facultatif</span>
      </div>
      <p className={s.texte}>
        Vous entrez normalement par un lien reçu par courriel : rien à retenir, rien à voler. Un
        mot de passe vous donne une seconde porte, utile le jour où le courriel tarde et qu'une
        patient vous attend. Les deux voies restent valables.
      </p>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault()
          if (pret) void enregistrer()
        }}
      >
        <label className={s.champ}>
          <span className={s.label}>Nouveau mot de passe</span>
          <TextInput
            type="password"
            autoComplete="new-password"
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
          />
          <span className={s.hint}>
            Au moins dix caractères. Trois mots sans rapport entre eux valent mieux qu'un mot
            court hérissé de symboles : c'est plus long à casser et plus facile à retenir.
          </span>
        </label>

        <label className={s.champ}>
          <span className={s.label}>Confirmation</span>
          <TextInput
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <span className={s.hint}>
            {confirmation && !identiques ? 'Les deux saisies diffèrent.' : ' '}
          </span>
        </label>

        <div>
          <Button variant="primary" type="submit" disabled={!pret}>
            {envoi ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
