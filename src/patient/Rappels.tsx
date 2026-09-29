import { useEffect, useState } from 'react'
import { plusTardEncoreValable, type EtatRappels } from '@/lib/rappels'
import { activer, desactiver, lireEtat } from './rappelsNavigateur'
import { ProposerLeSoir, ReglagesRappels } from './ReglagesRappels'
import s from './Proposition.module.css'

const CLE_PLUS_TARD = 'klaro.rappels.plusTard'

function lirePlusTard(): boolean {
  try {
    return plusTardEncoreValable(window.localStorage.getItem(CLE_PLUS_TARD), Date.now())
  } catch {
    return false
  }
}

function poserPlusTard(): void {
  try {
    window.localStorage.setItem(CLE_PLUS_TARD, String(Date.now()))
  } catch {
    // Stockage refusé (navigation privée) : la carte reviendra, c'est tout.
  }
}

interface Props {
  patientId: string
  /** Le nom de la thérapeute ou du cabinet, pour que la demande ait un visage. */
  cabinet?: string
  accent?: string
  /**
   * « carte » : en haut de la journée, tant que rien n'est activé — et
   * seulement quand un geste peut aboutir. « reglage » : dans « Mon compte »,
   * toujours là, pour activer comme pour retirer.
   */
  variante: 'carte' | 'reglage'
  /**
   * La carte s'affiche-t-elle ? `null` tant qu'on vérifie.
   *
   * La journée ne montre qu'une proposition à la fois : tant que celle-ci
   * est là, l'installation attend son tour.
   */
  onPresence?: (presente: boolean | null) => void
}

/**
 * Recevoir les rappels sur ce téléphone.
 *
 * C'est le seul endroit où la patiente décide que sa thérapeute peut lui
 * écrire à une heure donnée. Sans ce geste, un rappel « ce soir, 20 h »
 * attend qu'elle ouvre son espace — c'est-à-dire qu'il ne rappelle rien.
 */
export function Rappels({ patientId, cabinet, accent, variante, onPresence }: Props) {
  const [etat, setEtat] = useState<EtatRappels | 'lecture'>('lecture')
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState('')
  const [reussi, setReussi] = useState(false)
  const [plusTard, setPlusTard] = useState(lirePlusTard)

  useEffect(() => {
    let vivant = true
    lireEtat()
      .then((e) => vivant && setEtat(e))
      .catch(() => vivant && setEtat('inactive'))
    return () => {
      vivant = false
    }
  }, [])

  async function allumer() {
    if (enCours) return
    setEnCours(true)
    setMessage('')
    const issue = await activer(patientId)
    setEtat(issue.etat)
    setMessage(issue.message)
    setReussi(issue.etat === 'active')
    setEnCours(false)
  }

  async function eteindre() {
    if (enCours) return
    setEnCours(true)
    const issue = await desactiver()
    setEtat(issue.etat)
    setMessage(issue.message)
    setReussi(false)
    setEnCours(false)
  }

  const qui = cabinet ? `${cabinet} peut` : 'Votre thérapeute peut'

  /* LA CARTE DE LA JOURNÉE ne s'affiche que là où un geste aboutit ICI :
     « refusée » se règle dans les réglages du téléphone, « indisponible »
     nulle part — les rappeler chaque jour ne serait que du bruit. Sur un
     iPhone où l'espace n'est pas installé, c'est l'installation qui vient
     d'abord : sa carte à elle prend la place. Après une activation réussie,
     celle-ci reste le temps de le dire. */
  const presente: boolean | null =
    variante !== 'carte' ? null : reussi ? true : etat === 'lecture' ? null : !plusTard && etat === 'inactive'

  useEffect(() => {
    if (variante === 'carte') onPresence?.(presente)
  }, [variante, presente, onPresence])

  if (variante === 'carte') {
    if (reussi) {
      /* Le téléphone vient d'accepter les rappels : c'est le moment où
         proposer celui du soir a un sens (0055). Proposé, jamais posé. */
      return (
        <section className={s.carte} aria-live="polite">
          <p className={s.ok}>{message}</p>
          <ProposerLeSoir patientId={patientId} accent={accent} />
        </section>
      )
    }
    if (!presente) return null
  }

  const bouton = { background: accent ?? undefined }

  /* LES RÉGLAGES, DANS « MOI » (0055) : le rappel du soir et la discrétion
     sur l'écran verrouillé. Ils valent pour tous ses téléphones, et restent
     lisibles depuis un appareil où les rappels ne sont pas activés — pas
     là où le serveur n'en envoie aucun : régler ce qui ne partira pas, ce
     serait une promesse de plus. */
  const reglages =
    variante === 'reglage' && etat !== 'lecture' && etat !== 'fermee' ? (
      <ReglagesRappels patientId={patientId} accent={accent} telephoneActif={etat === 'active'} />
    ) : null

  return (
    <>
      <section className={s.carte} aria-live="polite">
        <h2 className={s.titre}>Les rappels sur ce téléphone</h2>

        {etat === 'lecture' ? <p className={s.texte}>Vérification…</p> : null}

        {etat === 'inactive' ? (
          <>
            <p className={s.texte}>
              {qui} vous envoyer un rappel à l'heure qui compte — un exercice, l'audio du soir. Sans
              cela, vous ne le verrez qu'en ouvrant votre espace. Sur l'écran verrouillé, son contenu
              reste masqué tant que vous ne choisissez pas de l'afficher.
            </p>
            <button type="button" className={s.bouton} style={bouton} disabled={enCours} onClick={() => void allumer()}>
              {enCours ? 'Activation…' : 'Activer les rappels'}
            </button>
          </>
        ) : null}

        {etat === 'a-installer' ? (
          <p className={s.texte}>
            Sur iPhone, les rappels n'arrivent qu'une fois votre espace installé sur l'écran d'accueil
            — voyez juste au-dessus. Rouvrez-le ensuite depuis son icône : vous pourrez les activer
            ici.
          </p>
        ) : null}

        {etat === 'refusee' && variante === 'reglage' ? (
          <p className={s.texte}>
            Les notifications sont bloquées pour cet espace. Pour recevoir les rappels, autorisez-les
            dans les réglages de votre téléphone (Réglages → Notifications), puis revenez ici.
          </p>
        ) : null}

        {etat === 'fermee' && variante === 'reglage' ? (
          <p className={s.texte}>Les rappels sur le téléphone ne sont pas encore disponibles sur cet espace.</p>
        ) : null}

        {etat === 'indisponible' && variante === 'reglage' ? (
          <p className={s.texte}>
            Ce navigateur ne sait pas recevoir de rappels. Ouvrez votre espace dans Safari ou Chrome, à
            jour.
          </p>
        ) : null}

        {etat === 'active' && variante === 'reglage' ? (
          <>
            <p className={s.texte}>Les rappels de votre thérapeute arrivent sur ce téléphone.</p>
            <button type="button" className={s.secondaire} disabled={enCours} onClick={() => void eteindre()}>
              {enCours ? 'Un instant…' : 'Ne plus les recevoir ici'}
            </button>
          </>
        ) : null}

        {message && !reussi ? <p className={s.note}>{message}</p> : null}
        {message && reussi && variante === 'reglage' ? <p className={s.ok}>{message}</p> : null}

        {variante === 'carte' ? (
          <button
            type="button"
            className={s.plusTard}
            onClick={() => {
              poserPlusTard()
              setPlusTard(true)
            }}
          >
            Plus tard
          </button>
        ) : null}
      </section>
      {reglages}
    </>
  )
}
