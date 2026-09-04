import { useState, type FormEvent } from 'react'
import { Button, FieldLabel, Marque, Notice, TextInput } from '@/components/ui'
import { useAuth } from './session'
import { captchaConfigure, useCaptcha } from './Captcha'
import s from './SignIn.module.css'

/**
 * Une seule porte pour les trois rôles : on entre son adresse, on reçoit un
 * lien. Aucun mot de passe — sur une application qu'un patient ouvre deux
 * minutes par jour, c'est le premier motif d'abandon.
 *
 * Avant la connexion, on ne sait pas qui arrive : l'écran porte donc
 * l'identité du produit, jamais celle d'un cabinet. La marque du cabinet
 * n'apparaît qu'une fois le compte reconnu — ou d'emblée, sur l'adresse du
 * cabinet, /son-identifiant.
 */
export function SignIn({
  titre,
  intro,
  marque = 'KL',
  logoUrl = null,
  cabinet = 'Klaro',
  tagline = 'Suivi entre les séances',
}: {
  titre: string
  intro: string
  marque?: string
  logoUrl?: string | null
  cabinet?: string
  tagline?: string
}) {
  const { envoyerLien, connecterParMotDePasse, error, sent } = useAuth()
  const [email, setEmail] = useState('')
  const [envoi, setEnvoi] = useState(false)
  /**
   * Le lien reste la voie par défaut : rien à retenir, rien à voler. Le mot
   * de passe est la porte de secours, repliée — pour la praticienne qui a
   * un patient en face d'elle et ne peut pas attendre un courriel.
   */
  const [avecMotDePasse, setAvecMotDePasse] = useState(false)
  const [motDePasse, setMotDePasse] = useState('')
  const captcha = useCaptcha()

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) return
    setEnvoi(true)
    if (avecMotDePasse) await connecterParMotDePasse(email, motDePasse, captcha.jeton)
    else await envoyerLien(email, captcha.jeton)
    setEnvoi(false)
    // Un jeton ne vaut qu'une fois : le suivant se regagne.
    captcha.reinitialiser()
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.brand}>
          <Marque className={s.logo} logo={marque} url={logoUrl} />
          <div>
            <div className={s.name}>{cabinet}</div>
            <div className={s.tagline}>{tagline}</div>
          </div>
        </div>

        {sent ? (
          <>
            <p className={s.sent}>
              Le lien est parti vers <span className={s.address}>{sent}</span>.
            </p>
            <p className={s.intro}>
              Ouvrez-le depuis cet appareil : il vous connectera directement. Il est valable une
              heure, et ne fonctionne qu'une fois.
            </p>
            <p className={s.note}>
              Rien reçu ? Regardez dans les indésirables, puis redemandez un lien.
            </p>
          </>
        ) : (
          <>
            <h1 className={s.title}>{titre}</h1>
            <p className={s.intro}>{intro}</p>

            <form onSubmit={soumettre}>
              <div className={s.field}>
                <FieldLabel>Votre adresse électronique</FieldLabel>
                <TextInput
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.fr"
                  required
                />
              </div>

              {avecMotDePasse ? (
                <div className={s.field}>
                  <FieldLabel>Votre mot de passe</FieldLabel>
                  <TextInput
                    type="password"
                    autoComplete="current-password"
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                    required
                  />
                </div>
              ) : null}

              {error ? (
                <Notice tone="warn" style={{ marginBottom: 14 }}>
                  {error}
                </Notice>
              ) : null}

              {captcha.widget}

              <div className={s.actions}>
                <Button
                  type="submit"
                  variant="primary"
                  big
                  disabled={
                    envoi ||
                    !email.includes('@') ||
                    (avecMotDePasse && !motDePasse) ||
                    /* Tant que la case n'est pas franchie, le bouton attend :
                       cliquer pour rien et lire un refus est pire que de voir
                       le bouton grisé. */
                    (captchaConfigure() && !captcha.jeton)
                  }
                >
                  {envoi
                    ? avecMotDePasse
                      ? 'Connexion…'
                      : 'Envoi…'
                    : avecMotDePasse
                      ? 'Se connecter'
                      : 'Recevoir mon lien'}
                </Button>
              </div>
            </form>

            <button
              type="button"
              className={s.bascule}
              onClick={() => {
                setAvecMotDePasse(!avecMotDePasse)
                setMotDePasse('')
              }}
            >
              {avecMotDePasse
                ? 'Recevoir plutôt un lien de connexion'
                : 'Ou se connecter avec un mot de passe'}
            </button>

            <p className={s.note}>
              {avecMotDePasse
                ? "Le mot de passe se pose depuis votre espace, une fois connectée. Si vous n'en avez pas encore, demandez un lien."
                : 'Vous recevez un lien qui vous connecte, sans rien à retenir. Se connecter ne donne accès à rien en soi — il faut qu’une fiche ou une invitation vous attende.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
