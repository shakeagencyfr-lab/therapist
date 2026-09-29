import { useState } from 'react'
import { Button, Notice, Overline } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { dateDuJour } from '@/lib/format'
import { nouvelleSeance } from '@/state/selectors'
import { useStore } from '@/state/store'
import { PatientPick } from './PatientPick'
import { ConsentStep } from './ConsentStep'
import { RecordStep } from './RecordStep'
import { DraftStep } from './DraftStep'
import s from './SessionView.module.css'

/**
 * Captation de séance, en quatre étapes successives : la fiche concernée,
 * le consentement (bloquant), la captation, puis le brouillon de note.
 *
 * L'étape courante se déduit de l'état plutôt que d'un compteur : tant
 * qu'aucune fiche n'est choisie il n'y a pas de séance, et tant que le
 * consentement n'est pas signé, rien d'autre n'est accessible.
 */
export function SessionView() {
  const { state, set } = useStore()
  const cabinet = useMaybeCabinet()
  const patient = state.patients[state.sessionPatient]
  const hasDraft = state.draft !== null

  /** Le retrait du consentement : fermé, à confirmer, en cours. */
  const [retrait, setRetrait] = useState<'ferme' | 'confirmer' | 'en-cours'>('ferme')
  /** Ce que le dernier retrait a fait, ou pourquoi il a échoué — à l'étape
   *  où il se lit, et pas au-delà : il ne suit pas la séance suivante. */
  const [avis, setAvis] = useState<{ ton: 'ok' | 'warn'; texte: string; etape: number } | null>(null)

  const step = !patient ? 1 : !state.consent ? 2 : !hasDraft ? 3 : 4
  const prenom = patient ? patient.name.split(' ')[0] : ''

  /* Les quatre étapes, en regard : titre, phrase d'accroche et pastille.
     Les garder ensemble évite qu'un ajout d'étape n'en décale qu'une.

     L'accroche de la captation promettait « l'audio est transcrit puis
     détruit ; seul le texte, chiffré, reste dans le dossier » — alors que
     la transcription est celle du navigateur, qui envoie le son chez son
     éditeur. Elle dit maintenant le trajet réel, et ce que nous en
     garantissons : le son n'arrive jamais ici.

     Le brouillon disait « Modifiez librement » : seuls la synthèse et le
     message se corrigent, le reste se retient ou s'écarte. */
  const { title, intro, badge } = [
    {
      title: 'Pour qui est cette séance ?',
      intro:
        "Une séance se rattache à une fiche : c'est elle qui recevra la note, les modules et les audios. Choisissez la personne que vous recevez.",
      badge: 'Étape 1 · Patient',
    },
    {
      title: "Avant d'enregistrer",
      intro:
        "Un enregistrement de séance est la donnée la plus sensible d'un cabinet. Le consentement se signe une fois, en présence du patient.",
      badge: 'Étape 2 · Consentement',
    },
    state.capture === 'notes'
      ? {
          title: 'Notes de séance',
          intro: state.sansEnregistrement
            ? "Séance sans enregistrement : le micro reste fermé, rien n'est transcrit. Écrivez vos notes, pendant ou après la séance — le brouillon se rédige à partir d'elles, et elles s'enregistrent dans la séance au fil de l'eau."
            : "Pas de micro pour cette séance : écrivez vos notes, pendant ou après — le brouillon se rédige à partir d'elles, et elles s'enregistrent dans la séance au fil de l'eau.",
          badge: 'Étape 3 · Notes',
        }
      : {
          title: 'Dictaphone de séance',
          intro:
            "La transcription est faite par votre navigateur : le son part chez son éditeur, qui le transcrit, et seul le texte revient ici — le son n'est jamais enregistré. Le texte s'enregistre dans la séance au fil de l'eau.",
          badge: 'Étape 3 · Captation',
        },
    state.sent
      ? {
          title: 'Séance envoyée',
          intro: `La note est au dossier de ${prenom} et les modules retenus sont dans son parcours. La synthèse se corrige encore ici ; pour recevoir quelqu'un d'autre, ouvrez une nouvelle séance.`,
          badge: 'Étape 4 · Envoyée',
        }
      : {
          title: 'Brouillon de note de séance',
          intro: `Rien de tout ceci n'entre dans le parcours de ${prenom} avant que vous ne le décidiez. La synthèse et le message se corrigent ici même ; les modules et les audios se retiennent ou s'écartent d'un clic. C'est votre note, pas celle de la machine.`,
          badge: 'Étape 4 · Validation',
        },
  ][step - 1]

  const crumb = patient
    ? `Séance du ${dateDuJour()} · ${patient.name}${patient.program ? ` · ${patient.program}` : ''}`
    : `Séance du ${dateDuJour()}`

  /* Le consentement se retire tant que la séance n'est pas envoyée : après,
     la transcription est déjà effacée et la note appartient au dossier. */
  const retirable = Boolean(patient && state.consent && !state.sent)

  /**
   * Retirer le consentement.
   *
   * Le texte lu au patient le promet — « l'arrêt de l'enregistrement, ou
   * l'effacement de ce qui a déjà été pris, à tout moment » — et aucun geste
   * ne le faisait : consent_revoked_at n'était écrit nulle part. Poser la
   * date suffit, la base efface le reste (0043). L'écran repart ensuite de
   * zéro sur la même fiche : si la personne veut reprendre plus tard, elle
   * resignera.
   */
  async function retirer() {
    if (!patient) return
    const sessionId = state.sessionId
    if (cabinet?.reel && sessionId) {
      setRetrait('en-cours')
      const r = await cabinet.retirerConsentement(sessionId)
      if (!r.ok) {
        setRetrait('confirmer')
        setAvis({ ton: 'warn', texte: r.message, etape: step })
        return
      }
    }
    const sans = state.sansEnregistrement
    setRetrait('ferme')
    set(nouvelleSeance(state.sessionPatient))
    setAvis({
      ton: 'ok',
      etape: 2,
      texte: !cabinet?.reel
        ? `${sans ? 'Séance abandonnée' : 'Consentement retiré'}. Rien n'était enregistré : la démonstration n'écrit dans aucun dossier.`
        : sans
          ? 'Séance abandonnée. Ses notes et son brouillon sont effacés ; il reste sa date au dossier.'
          : `Consentement retiré. La transcription, les notes et le brouillon de cette séance sont effacés ; il reste la date du consentement et celle de son retrait.`,
    })
  }

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <div>
          <div className={s.crumb}>
            <Overline>{crumb}</Overline>
            {/* Se tromper de fiche est l'erreur la plus coûteuse ici : la
                sortie reste ouverte tant que la note n'est pas envoyée. */}
            {patient && !state.sent ? (
              <button
                type="button"
                className={s.change}
                onClick={() => {
                  setAvis(null)
                  setRetrait('ferme')
                  set(nouvelleSeance())
                }}
              >
                Changer de patient
              </button>
            ) : null}
            {/* Après l'envoi, la seule suite est une autre séance. « Reprendre »
                et « Nouvelle séance » ramenaient au brouillon envoyé, qu'on
                pouvait réécrire et renvoyer. */}
            {state.sent ? (
              <button type="button" className={s.change} onClick={() => set(nouvelleSeance())}>
                Nouvelle séance
              </button>
            ) : null}
            {retirable && retrait === 'ferme' ? (
              <button type="button" className={s.change} onClick={() => setRetrait('confirmer')}>
                {state.sansEnregistrement ? 'Abandonner cette séance' : 'Retirer le consentement'}
              </button>
            ) : null}
          </div>
          <h1 className={s.h1}>{title}</h1>
        </div>
        <span className={s.badge}>{badge}</span>
      </div>
      <p className={s.intro}>{intro}</p>

      {retirable && retrait !== 'ferme' ? (
        <div
          className={s.retrait}
          role="alertdialog"
          aria-label={state.sansEnregistrement ? 'Abandonner cette séance' : 'Retirer le consentement'}
        >
          <p className={s.retraitTexte}>
            {state.sansEnregistrement
              ? 'Abandonner cette séance : ses notes et son brouillon sont effacés, tout de suite et sans retour. Sa date reste au dossier.'
              : `${prenom} retire son consentement : la transcription, les notes et le brouillon de cette séance sont effacés, tout de suite et sans retour. Le consentement reste daté, avec son retrait.`}
          </p>
          <div className={s.retraitActions}>
            <Button variant="danger" onClick={() => void retirer()} disabled={retrait === 'en-cours'}>
              {retrait === 'en-cours' ? 'Effacement…' : 'Effacer cette séance'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setRetrait('ferme')
                setAvis(null)
              }}
              disabled={retrait === 'en-cours'}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : null}

      {avis && avis.etape === step ? (
        <div className={s.avis}>
          <Notice tone={avis.ton}>{avis.texte}</Notice>
        </div>
      ) : null}

      {step === 1 && <PatientPick />}
      {step === 2 && <ConsentStep />}
      {step === 3 && <RecordStep />}
      {step === 4 && <DraftStep />}
    </div>
  )
}
