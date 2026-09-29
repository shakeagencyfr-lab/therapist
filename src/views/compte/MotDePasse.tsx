import { useState } from 'react'
import { Button, Card, Notice, TextInput, Title } from '@/components/ui'
import { useAuth } from '@/auth/session'
import { CONSIGNE_MOT_DE_PASSE, entreeParLienRecente, lireEntrees, refusDuNouveau } from '@/lib/motDePasse'
import s from './MotDePasse.module.css'

/**
 * Choisir ou changer son mot de passe.
 *
 * Le lien magique reste la voie normale : rien à retenir, rien à voler. Le
 * mot de passe est une seconde porte, que chacune ouvre si elle le veut.
 *
 * L'ANCIEN MOT DE PASSE EST DEMANDÉ, sauf juste après une entrée par lien.
 * Sans lui, quiconque passe devant un ordinateur resté ouvert pourrait
 * changer le mot de passe et fermer la porte à sa titulaire. Juste après un
 * lien, la boîte aux lettres vient d'être prouvée : c'est la voie de qui l'a
 * oublié, ou n'en a jamais eu. L'écran le lit dans la session, le serveur le
 * vérifie de son côté — l'écran ne fait que ne pas poser une question
 * inutile.
 */
export function MotDePasse() {
  const { changerMotDePasse, session } = useAuth()
  const [ancien, setAncien] = useState('')
  const [valeur, setValeur] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  if (!session) return null

  const parLien = entreeParLienRecente(lireEntrees(session.access_token), Date.now())
  const refus = valeur ? refusDuNouveau(valeur, session.user.email) : null
  const identiques = valeur === confirmation
  const pret = Boolean(valeur) && !refus && identiques && (parLien || ancien.length > 0) && !envoi

  async function enregistrer() {
    setEnvoi(true)
    setNotice(null)
    const r = await changerMotDePasse(parLien ? '' : ancien, valeur)
    setEnvoi(false)
    if (r.ok) {
      setAncien('')
      setValeur('')
      setConfirmation('')
      setNotice({ tone: 'ok', text: r.message })
    } else {
      // Sur un refus, rien n'est vidé : on corrige ce qu'on vient de taper.
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
        Vous pouvez toujours entrer par un lien reçu par courriel : rien à retenir, rien à voler.
        Un mot de passe vous donne une seconde porte, utile le jour où le courriel tarde. Les deux
        voies restent valables. Une fois le mot de passe changé, vos autres appareils sont
        déconnectés.
      </p>

      {parLien ? (
        <p className={s.texte}>
          Vous venez d'entrer par un lien reçu par courriel : l'ancien mot de passe ne vous est
          pas demandé. C'est aussi la voie si vous l'aviez oublié.
        </p>
      ) : null}

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault()
          if (pret) void enregistrer()
        }}
      >
        {/* Le champ d'identifiant, caché : les gestionnaires de mots de passe
            savent ainsi pour quel compte ils enregistrent le nouveau. */}
        <input
          type="email"
          autoComplete="username"
          value={session.user.email ?? ''}
          readOnly
          hidden
        />

        {!parLien ? (
          <label className={s.champ}>
            <span className={s.label}>Mot de passe actuel</span>
            <TextInput
              type="password"
              autoComplete="current-password"
              value={ancien}
              onChange={(e) => setAncien(e.target.value)}
            />
            <span className={s.hint}>
              Oublié, ou jamais choisi ? Déconnectez-vous et entrez par un lien reçu par courriel :
              pendant 24 heures, il ne vous sera pas demandé.
            </span>
          </label>
        ) : null}

        <label className={s.champ}>
          <span className={s.label}>Nouveau mot de passe</span>
          <TextInput
            type="password"
            autoComplete="new-password"
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            aria-invalid={refus ? true : undefined}
          />
          <span className={s.hint}>
            {refus ?? CONSIGNE_MOT_DE_PASSE}
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
          <span className={s.hint}>{confirmation && !identiques ? 'Les deux saisies diffèrent.' : ' '}</span>
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
