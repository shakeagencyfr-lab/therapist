import { useState, type FormEvent } from 'react'
import { Button, FieldLabel, Marque, Notice, TextInput } from '@/components/ui'
import { codeComplet, LONGUEUR_CODE, normaliserCode } from '@/lib/codeConnexion'
import { estInstallee } from '@/patient/installation'
import { useAuth } from './session'
import { captchaConfigure, useCaptcha } from './Captcha'
import s from './SignIn.module.css'

/**
 * Les trois façons d'entrer.
 *
 *   courriel     on demande un courriel, qui porte un lien ET un code ;
 *   code         on a déjà un code — d'un courriel de connexion ou d'une
 *                invitation — et on le saisit sans rien redemander ;
 *   motDePasse   pour qui en a choisi un depuis « Mon compte ».
 */
type Voie = 'courriel' | 'code' | 'motDePasse'

/**
 * Une seule porte pour les trois rôles : on entre son adresse, on reçoit un
 * courriel. Aucun mot de passe imposé — sur une application qu'un patient
 * ouvre deux minutes par jour, c'est le premier motif d'abandon.
 *
 * LE COURRIEL PORTE UN LIEN ET UN CODE. Le lien suffit à qui lit ses
 * courriels sur l'appareil où il veut entrer. Le code sert partout ailleurs,
 * et d'abord dans l'espace installé sur l'écran d'accueil d'un iPhone : sa
 * session vit à part de celle de Safari, et le lien du courriel s'ouvre dans
 * Safari. Sans code, l'application installée — la seule qui reçoit les
 * rappels — restait à la porte.
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
  const { envoyerLien, connecterParCode, recommencer, connecterParMotDePasse, error, sent, verificationLente } =
    useAuth()
  /* L'espace installé, ouvert depuis son icône ? Lu une fois : on n'en sort
     pas sans le rouvrir. */
  const [installe] = useState(estInstallee)
  const [email, setEmail] = useState('')
  const [envoi, setEnvoi] = useState(false)
  /**
   * Le courriel reste la voie par défaut : rien à retenir, rien à voler. Le
   * mot de passe est la porte de secours — pour la praticienne qui a un
   * patient en face d'elle et ne peut pas attendre un courriel.
   */
  const [voie, setVoie] = useState<Voie>('courriel')
  const [motDePasse, setMotDePasse] = useState('')
  const [code, setCode] = useState('')
  /** Arrivée ici par « Mot de passe oublié ? » : le courriel est la réponse. */
  const [oubli, setOubli] = useState(false)
  const captcha = useCaptcha()

  /* Le CAPTCHA garde ce qui ENVOIE un courriel ou éprouve un mot de passe —
     les seules routes où le service le vérifie. Saisir un code n'envoie
     rien : une case de plus ne protégerait rien. */
  const avecCaptcha = voie !== 'code'

  function prendre(suivante: Voie) {
    setVoie(suivante)
    setMotDePasse('')
    setCode('')
    setOubli(false)
    captcha.reinitialiser()
  }

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) return
    setEnvoi(true)
    if (voie === 'motDePasse') await connecterParMotDePasse(email, motDePasse, captcha.jeton)
    else if (voie === 'code') await connecterParCode(email, code)
    else await envoyerLien(email, captcha.jeton)
    setEnvoi(false)
    // Un jeton ne vaut qu'une fois : le suivant se regagne.
    if (avecCaptcha) captcha.reinitialiser()
  }

  /** Le code du courriel qui vient de partir, saisi sur l'écran d'attente. */
  async function saisirLeCode(e: FormEvent) {
    e.preventDefault()
    if (!codeComplet(code)) return
    setEnvoi(true)
    await connecterParCode(sent, code)
    setEnvoi(false)
  }

  const champCode = (
    <div className={s.field}>
      <FieldLabel>Le code reçu par courriel</FieldLabel>
      {/* `one-time-code` : iOS propose de lui-même le code lu dans Mail ou
          Messages, au-dessus du clavier. */}
      <TextInput
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(normaliserCode(e.target.value))}
        placeholder={'0'.repeat(LONGUEUR_CODE)}
        aria-label={`Code à ${LONGUEUR_CODE} chiffres`}
        required
      />
    </div>
  )

  /** Les autres voies, proposées sous le formulaire. */
  const autresVoies: Array<[Voie, string]> = (
    [
      ['courriel', installe ? 'Recevoir plutôt un code par courriel' : 'Recevoir plutôt un lien de connexion'],
      ['code', "J'ai déjà reçu un code"],
      ['motDePasse', 'Se connecter avec un mot de passe'],
    ] as Array<[Voie, string]>
  ).filter(([v]) => v !== voie)

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

            {/* LA PORTE N'ATTEND PLUS LA REPRISE DE SESSION.
                Elle s'affiche au bout de quatre secondes, même si la
                vérification court encore. Dans ce cas-là seulement, cette
                phrase : sans elle, une praticienne déjà connectée croirait
                avoir été déconnectée et se mettrait à retaper son adresse
                pendant que son espace s'apprête à s'ouvrir. */}
            {verificationLente ? (
              <p className={s.note}>
                La vérification de votre accès est plus longue que d'habitude. Si vous étiez déjà
                connectée, votre espace s'ouvrira tout seul — inutile de ressaisir quoi que ce soit.
              </p>
            ) : null}

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
                  {/* Pas de page de réinitialisation à part : le lien EST la
                      réinitialisation. Une fois entrée par lui, « Mon compte »
                      laisse choisir un nouveau mot de passe sans l'ancien. */}
                  <button
                    type="button"
                    className={s.oubli}
                    onClick={() => {
                      setAvecMotDePasse(false)
                      setMotDePasse('')
                      setOubli(true)
                    }}
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
              ) : null}

              {oubli && !avecMotDePasse ? (
                <Notice tone="ok" style={{ marginBottom: 14 }}>
                  Recevez un lien de connexion. Une fois entrée, ouvrez « Mon compte » (l'onglet
                  « Moi » dans l'espace patient) : vous pourrez y choisir un nouveau mot de passe
                  sans l'ancien, pendant 24 heures.
                </Notice>
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
                setOubli(false)
              }}
            >
              {avecMotDePasse
                ? 'Recevoir plutôt un lien de connexion'
                : 'Ou se connecter avec un mot de passe'}
            </button>

            <p className={s.note}>
              {avecMotDePasse
                ? "Le mot de passe se choisit depuis « Mon compte », une fois connectée. Si vous n'en avez pas encore, demandez un lien."
                : 'Vous recevez un lien qui vous connecte, sans rien à retenir. Se connecter ne donne accès à rien en soi — il faut qu’une fiche ou une invitation vous attende.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
