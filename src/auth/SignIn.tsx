import { useState, type FormEvent } from 'react'
import { Button, FieldLabel, Marque, Notice, TextInput } from '@/components/ui'
import { codeComplet, normaliserCode } from '@/lib/codeConnexion'
import { estInstallee } from '@/patient/installation'
import { LiensLegaux } from '@/legal/LiensLegaux'
import { KLARO, logoDePorte } from '@/theme/klaro'
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
  tagline = KLARO.slogan,
  avis = null,
}: {
  titre: string
  intro: string
  marque?: string
  logoUrl?: string | null
  cabinet?: string
  tagline?: string
  /**
   * Pourquoi on revient à la porte, quand ce n'est pas un choix : la
   * session s'est fermée après un temps sans activité (src/auth/Inactivite).
   * Sans cette phrase, la praticienne croirait à une panne.
   */
  avis?: string | null
}) {
  const { envoyerLien, connecterParCode, recommencer, connecterParMotDePasse, error, sent, verificationLente, avisPorte } =
    useAuth()
  const avisAffiche = avisPorte || avis || null
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
    // Le refus de la voie quittée ne concerne plus celle qu'on prend.
    recommencer()
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
        placeholder="Le code du courriel"
        aria-label="Code reçu par courriel"
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
          <Marque className={s.logo} logo={marque} url={logoDePorte(cabinet, logoUrl)} />
          <div>
            <div className={s.name}>{cabinet}</div>
            <div className={s.tagline}>{tagline}</div>
          </div>
        </div>

        {sent ? (
          <>
            <p className={s.sent}>
              Le courriel est parti vers <span className={s.address}>{sent}</span>.
            </p>
            {/* Dans l'espace installé, le lien est un piège : il ouvre le
                navigateur, connecte le navigateur, et laisse l'application
                à la porte. On le dit avant qu'il soit touché. */}
            <p className={s.intro}>
              {installe
                ? `Saisissez ici le code qu'il contient. N'ouvrez pas son lien : il ouvrirait votre navigateur, et vous connecterait là-bas plutôt que dans cette application.`
                : `Il contient un lien et un code. Ouvrez le lien depuis cet appareil, ou saisissez le code ci-dessous — plus simple si vous lisez vos courriels ailleurs. L'un comme l'autre vaut une heure, et une seule fois.`}
            </p>
            <form onSubmit={saisirLeCode}>
              {champCode}
              {error ? (
                <Notice tone="warn" style={{ marginBottom: 14 }}>
                  {error}
                </Notice>
              ) : null}
              <div className={s.actions}>
                <Button type="submit" variant="primary" big disabled={envoi || !codeComplet(code)}>
                  {envoi ? 'Vérification…' : 'Se connecter'}
                </Button>
              </div>
            </form>
            <p className={s.note}>
              Rien reçu ? Regardez dans les indésirables, puis demandez un nouveau courriel.
            </p>
            <button
              type="button"
              className={s.bascule}
              onClick={() => {
                setCode('')
                recommencer()
              }}
            >
              Changer d'adresse, ou redemander un courriel
            </button>
          </>
        ) : (
          <>
            <h1 className={s.title}>{titre}</h1>
            <p className={s.intro}>{intro}</p>

            {avisAffiche ? (
              <Notice tone="ok" style={{ marginBottom: 14 }}>
                {avisAffiche}
              </Notice>
            ) : null}

            {/* L'ESPACE INSTALLÉ LE DIT D'EMBLÉE. Ouvert depuis l'icône de
                l'écran d'accueil, un lien reçu par courriel ne ramène pas
                ici : on propose le code et le mot de passe, et on dit
                pourquoi — sinon on demande un lien, on le touche, et on se
                retrouve connecté… dans le navigateur. */}
            {installe ? (
              <Notice tone="ok" style={{ marginBottom: 14 }}>
                Vous êtes dans l'application installée : un lien reçu par courriel s'ouvrirait dans
                votre navigateur, pas ici. Demandez plutôt un code, à
                saisir sur cet écran — ou entrez votre mot de passe, si vous en avez choisi un.
              </Notice>
            ) : null}

            {/* LA PORTE N'ATTEND PLUS LA REPRISE DE SESSION.
                Elle s'affiche au bout de quatre secondes, même si la
                vérification court encore. Dans ce cas-là seulement, cette
                phrase : sans elle, une praticienne déjà connectée croirait
                avoir été déconnectée et se mettrait à retaper son adresse
                pendant que son espace s'apprête à s'ouvrir. */}
            {verificationLente ? (
              <p className={s.note}>
                La vérification de votre accès est plus longue que d'habitude. Si votre session était
                déjà ouverte, votre espace s'ouvrira tout seul — inutile de ressaisir quoi que ce soit.
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

              {voie === 'motDePasse' ? (
                <div className={s.field}>
                  <FieldLabel>Votre mot de passe</FieldLabel>
                  <TextInput
                    type="password"
                    autoComplete="current-password"
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                    required
                  />
                  {/* Pas de page de réinitialisation à part : le courriel EST
                      la réinitialisation. Une fois entré par lui, « Mon
                      compte » laisse choisir un nouveau mot de passe sans
                      l'ancien. */}
                  <button
                    type="button"
                    className={s.oubli}
                    onClick={() => {
                      prendre('courriel')
                      setOubli(true)
                    }}
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
              ) : null}

              {voie === 'code' ? champCode : null}

              {oubli && voie === 'courriel' ? (
                <Notice tone="ok" style={{ marginBottom: 14 }}>
                  Recevez un courriel de connexion. Une fois dans votre espace, ouvrez « Mon compte »
                  (l'onglet « Moi » dans l'espace patient) : vous pourrez y choisir un nouveau mot de
                  passe sans l'ancien, pendant 24 heures.
                </Notice>
              ) : null}

              {error ? (
                <Notice tone="warn" style={{ marginBottom: 14 }}>
                  {error}
                </Notice>
              ) : null}

              {avecCaptcha ? captcha.widget : null}

              <div className={s.actions}>
                <Button
                  type="submit"
                  variant="primary"
                  big
                  disabled={
                    envoi ||
                    !email.includes('@') ||
                    (voie === 'motDePasse' && !motDePasse) ||
                    (voie === 'code' && !codeComplet(code)) ||
                    /* Tant que la case n'est pas franchie, le bouton attend :
                       cliquer pour rien et lire un refus est pire que de voir
                       le bouton grisé. */
                    (avecCaptcha && captchaConfigure() && !captcha.jeton)
                  }
                >
                  {envoi
                    ? voie === 'courriel'
                      ? 'Envoi…'
                      : 'Connexion…'
                    : voie === 'courriel'
                      ? installe
                        ? 'Recevoir mon code'
                        : 'Recevoir mon lien'
                      : 'Se connecter'}
                </Button>
              </div>
            </form>

            {autresVoies.map(([v, libelle]) => (
              <button key={v} type="button" className={s.bascule} onClick={() => prendre(v)}>
                {libelle}
              </button>
            ))}

            <p className={s.note}>
              {voie === 'motDePasse'
                ? "Le mot de passe se choisit depuis « Mon compte », une fois dans votre espace. Si vous n'en avez pas encore, demandez un courriel de connexion."
                : voie === 'code'
                  ? `Le code figure dans votre dernier courriel de connexion ou d'invitation. Il ne sert qu'une fois ; s'il a expiré, demandez-en un nouveau.`
                  : installe
                    ? 'Vous recevez un code à saisir ici, sans rien à retenir. Se connecter ne donne accès à rien en soi — il faut qu’une fiche ou une invitation vous attende.'
                    : 'Vous recevez un lien qui vous connecte — et un code, si vous préférez le saisir —, sans rien à retenir. Se connecter ne donne accès à rien en soi — il faut qu’une fiche ou une invitation vous attende.'}
            </p>
          </>
        )}
        {/* Avant d'entrer, on peut lire ce qu'il advient de ses données :
            c'est ici qu'on confie son adresse. Dans la carte, pour rester
            sous les yeux ; dans un nouvel onglet, pour ne pas perdre le code
            qu'on attend peut-être (src/legal/LiensLegaux.tsx). */}
        <LiensLegaux className={s.legal} />
      </div>
    </div>
  )
}
