import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, FieldLabel, Marque, Notice, TextInput } from '@/components/ui'
import { LONGUEUR_CODE_TOTP, codeTotpComplet, normaliserCodeTotp } from '@/lib/doubleAuthentification'
import { KLARO, logoDePorte } from '@/theme/klaro'
import s from './SignIn.module.css'

/**
 * Le code de l'application, demandé avant d'ouvrir l'espace.
 *
 * La personne vient d'entrer — lien, code du courriel ou mot de passe — et
 * son compte est protégé par une double authentification : la session est
 * « aal1 », et la base ne lui ouvre aucun dossier tant qu'elle ne l'a pas
 * portée à « aal2 » (0056). L'écran le dit sans alarmer : c'est le chemin
 * normal, pas une erreur.
 *
 * Même carte, même marque que la porte : c'est la suite de la connexion.
 * Les gestes arrivent par les props, pour que le banc de rendu puisse
 * l'afficher sans session.
 */
const ID_CHAMP = 'code-deuxieme-facteur'

export function DeuxiemeFacteur({
  email,
  verifier,
  seDeconnecter,
  marque = 'KL',
  logoUrl = null,
  cabinet = 'Klaro',
  tagline = KLARO.slogan,
}: {
  email: string | null
  /** Rend null si le code est accepté, sinon la phrase à afficher. */
  verifier: (code: string) => Promise<string | null>
  seDeconnecter: () => void
  marque?: string
  logoUrl?: string | null
  cabinet?: string
  tagline?: string
}) {
  const [code, setCode] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  /* Le dernier code envoyé : la saisie complète part d'elle-même, mais le
     même code refusé ne repart pas tant qu'on n'y a pas touché. */
  const dernierEnvoye = useRef('')

  /* Après un refus, le champ — désactivé pendant la vérification — reprend
     la main dès qu'il est rendu de nouveau actif. */
  useEffect(() => {
    if (erreur) document.getElementById(ID_CHAMP)?.focus()
  }, [erreur])

  /* Le filet du code accepté. D'ordinaire, la session passe en « aal2 » et
     la porte s'efface dans la seconde. Si elle est encore là cinq secondes
     plus tard — un événement de session perdu —, on recharge : la session
     gardée est déjà la bonne, et la page repart d'elle. */
  const monte = useRef(true)
  useEffect(() => {
    monte.current = true
    return () => {
      monte.current = false
    }
  }, [])

  async function envoyer(valeur: string) {
    if (envoi || !codeTotpComplet(valeur)) return
    dernierEnvoye.current = valeur
    setEnvoi(true)
    setErreur('')
    const refus = await verifier(valeur)
    /* Accepté : la session passe en « aal2 » et la porte s'efface d'elle-même
       (Root.tsx). Refusé : le champ se vide — le code suivant sera un autre
       de toute façon — et reprend la main. */
    if (refus) {
      setErreur(refus)
      setCode('')
      setEnvoi(false)
      return
    }
    window.setTimeout(() => {
      if (monte.current) window.location.reload()
    }, 5_000)
  }

  function soumettre(e: FormEvent) {
    e.preventDefault()
    void envoyer(code)
  }

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

        <h1 className={s.title}>Le code de votre application</h1>
        <p className={s.intro}>
          Votre compte est protégé par une double authentification. Ouvrez votre application
          d'authentification et saisissez le code à {LONGUEUR_CODE_TOTP} chiffres affiché pour Klaro
          {email ? (
            <>
              {' '}
              (<span className={s.address}>{email}</span>)
            </>
          ) : null}
          .
        </p>

        <form onSubmit={soumettre}>
          <div className={s.field}>
            <FieldLabel>Code à {LONGUEUR_CODE_TOTP} chiffres</FieldLabel>
            {/* `one-time-code` : les gestionnaires de mots de passe qui tiennent
                aussi les codes le proposent d'eux-mêmes. */}
            <TextInput
              id={ID_CHAMP}
              autoFocus
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => {
                const suivant = normaliserCodeTotp(e.target.value)
                setCode(suivant)
                if (codeTotpComplet(suivant) && suivant !== dernierEnvoye.current) void envoyer(suivant)
              }}
              placeholder={'0'.repeat(LONGUEUR_CODE_TOTP)}
              aria-label={`Code à ${LONGUEUR_CODE_TOTP} chiffres de votre application d'authentification`}
              aria-invalid={erreur ? true : undefined}
              aria-describedby={erreur ? 'code-refuse' : undefined}
              disabled={envoi}
              required
            />
          </div>

          {erreur ? (
            <div id="code-refuse" role="alert">
              <Notice tone="warn" style={{ marginBottom: 14 }}>
                {erreur}
              </Notice>
            </div>
          ) : null}

          <div className={s.actions}>
            <Button type="submit" variant="primary" big disabled={envoi || !codeTotpComplet(code)}>
              {envoi ? 'Vérification…' : 'Entrer'}
            </Button>
          </div>
        </form>

        <button type="button" className={s.bascule} onClick={seDeconnecter}>
          Me déconnecter, ou entrer avec un autre compte
        </button>

        <p className={s.note}>
          Téléphone perdu ou changé ? Si vous avez gardé la clé notée à l'activation, ajoutez-la
          dans une nouvelle application d'authentification : elle donnera les mêmes codes. Sinon,
          écrivez au support de la plateforme — la double authentification ne sera retirée qu'après
          vérification de votre identité.
        </p>
      </div>
    </div>
  )
}
