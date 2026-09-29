import { useState } from 'react'
import { installationAProposer } from '@/lib/installable'
import { plusTardEncoreValable } from '@/lib/rappels'
import { installer, useInstallation } from './installation'
import s from './Proposition.module.css'

const CLE_PLUS_TARD = 'klaro.installation.plusTard'

function lirePlusTard(): boolean {
  try {
    return plusTardEncoreValable(window.localStorage.getItem(CLE_PLUS_TARD), Date.now())
  } catch {
    return false
  }
}

/** Le bouton Partager de Safari : un carré ouvert, une flèche qui en sort. */
function GlyphePartager() {
  return (
    <svg className={s.glyphe} viewBox="0 0 15 17" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M5 6.5H2.5v9.5h10V6.5H10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 1v10M4.5 4l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface Props {
  accent?: string
  /**
   * « carte » : sur la journée, tant que l'espace n'est pas installé et
   * qu'un geste peut aboutir. « reglage » : dans « Mon compte ».
   */
  variante: 'carte' | 'reglage'
}

/**
 * L'espace sur l'écran d'accueil.
 *
 * Une icône qui ouvre l'espace d'un geste, en plein écran : c'est ce qui le
 * fait passer d'un lien qu'on retrouve dans ses courriels à une application
 * qu'on ouvre le soir. Sur iPhone, c'est en plus la condition pour recevoir
 * les rappels.
 *
 * Trois formes, selon ce que l'appareil permet — et aucune quand rien ne
 * peut aboutir : un bouton qui ne fait rien est pire qu'aucun bouton.
 */
export function Installer({ accent, variante }: Props) {
  const etat = useInstallation()
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState('')
  const [reussi, setReussi] = useState(false)
  const [plusTard, setPlusTard] = useState(lirePlusTard)

  async function lancer() {
    if (enCours) return
    setEnCours(true)
    const issue = await installer()
    setEnCours(false)
    if (issue === 'acceptee') {
      setReussi(true)
      setMessage("C'est fait : l'icône « Mon espace » est sur votre écran d'accueil.")
    } else if (issue === 'refusee') {
      setMessage(
        "Vous pourrez l'installer plus tard depuis le menu de votre navigateur (⋮ → Installer l'application).",
      )
    } else {
      setMessage(
        "Votre navigateur ne propose plus l'installation ici. Cherchez « Installer l'application » dans son menu (⋮).",
      )
    }
  }

  // Juste installé : la carte reste le temps de le dire.
  if (reussi) {
    return (
      <section className={s.carte} aria-live="polite">
        <p className={s.ok}>{message}</p>
      </section>
    )
  }

  if (variante === 'carte' && (plusTard || !installationAProposer(etat))) return null
  if (variante === 'reglage' && etat === 'impossible') return null

  const bouton = { background: accent ?? undefined }

  return (
    <section className={s.carte} aria-live="polite">
      <h2 className={s.titre}>Votre espace, sur l'écran d'accueil</h2>

      {etat === 'installee' ? (
        <p className={s.texte}>Votre espace est installé sur cet appareil : il s'ouvre depuis son icône.</p>
      ) : null}

      {etat === 'bouton' ? (
        <>
          <p className={s.texte}>
            Une icône sur votre écran d'accueil ouvre votre espace d'un geste, en plein écran — sans
            chercher le lien ni l'adresse.
          </p>
          <button type="button" className={s.bouton} style={bouton} disabled={enCours} onClick={() => void lancer()}>
            {enCours ? 'Un instant…' : "Installer l'application"}
          </button>
        </>
      ) : null}

      {etat === 'ios' ? (
        <>
          <p className={s.texte}>
            Une icône sur votre écran d'accueil ouvre votre espace d'un geste, en plein écran. Sur
            iPhone, c'est aussi ce qui permet de recevoir les rappels de votre thérapeute.
          </p>
          <ol className={s.etapes}>
            <li>
              touchez <GlyphePartager />
              <strong>Partager</strong>, dans la barre de Safari (parfois derrière « ⋯ ») ;
            </li>
            <li>
              choisissez <strong>Sur l'écran d'accueil</strong>, puis <strong>Ajouter</strong> ;
            </li>
            <li>ouvrez désormais votre espace depuis sa nouvelle icône.</li>
          </ol>
          {/* L'ICÔNE NE CONNAÎT PAS LA SESSION DE SAFARI. Sur iPhone, l'espace
              installé garde son stockage à part : il s'ouvre à la porte, et
              le lien d'un courriel, lui, repart dans Safari. On dit avant
              l'installation comment y entrer — sans quoi on tourne en
              rond entre l'icône et ses courriels. */}
          <p className={s.note}>
            À la première ouverture, entrez votre adresse : vous recevrez un code, à
            saisir dans l'application — le lien du courriel, lui, s'ouvrirait dans Safari. Un mot de
            passe choisi dans « Moi » fonctionne aussi.
          </p>
        </>
      ) : null}

      {etat === 'ios-ailleurs' ? (
        <>
          <p className={s.texte}>
            Cette page s'est ouverte dans une application ou un navigateur qui ne sait pas installer
            votre espace. Ouvrez-la dans <strong>Safari</strong> — souvent par le menu « ⋯ » puis
            « Ouvrir dans Safari » — et vous pourrez l'y installer.
          </p>
          <p className={s.note}>Il vous faudra peut-être vous reconnecter dans Safari.</p>
        </>
      ) : null}

      {message ? <p className={s.note}>{message}</p> : null}

      {variante === 'carte' ? (
        <button
          type="button"
          className={s.plusTard}
          onClick={() => {
            try {
              window.localStorage.setItem(CLE_PLUS_TARD, String(Date.now()))
            } catch {
              // Stockage refusé : la carte reviendra, c'est tout.
            }
            setPlusTard(true)
          }}
        >
          Plus tard
        </button>
      ) : null}
    </section>
  )
}
