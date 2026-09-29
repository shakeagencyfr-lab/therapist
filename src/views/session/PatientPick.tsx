import { useEffect, useState } from 'react'
import { Avatar, Button, Card, Notice, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import type { BrouillonEnAttente } from '@/cabinet/useCabinet'
import { useReprendreBrouillon } from '@/cabinet/useReprendreBrouillon'
import { libelleEnTete } from '@/lib/agenda'
import { nouvelleSeance, riskColor } from '@/state/selectors'
import { useStore } from '@/state/store'
import s from './PatientPick.module.css'

/** « lundi 29 septembre » : le jour de la séance, sans l'année. */
const jourDeLaSeance = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

/**
 * Les brouillons rédigés, jamais envoyés : on les retrouve ici, avant de
 * choisir une fiche. Rien n'y part d'office — les reprendre ramène à la
 * validation, où l'on envoie, ou garde encore.
 */
function BrouillonsEnAttente() {
  const { state } = useStore()
  const cabinet = useMaybeCabinet()
  const reprendre = useReprendreBrouillon()
  const [liste, setListe] = useState<BrouillonEnAttente[] | null>(null)
  const [enCours, setEnCours] = useState('')
  const [echec, setEchec] = useState('')
  const lire = cabinet?.reel ? cabinet.brouillonsEnAttente : null

  useEffect(() => {
    if (!lire) return
    let vivant = true
    void lire().then((l) => vivant && setListe(l))
    return () => {
      vivant = false
    }
  }, [lire])

  if (!liste?.length) return null

  async function ouvrir(id: string) {
    setEnCours(id)
    setEchec('')
    const r = await reprendre(id)
    setEnCours('')
    if (!r.ok) setEchec(r.message)
  }

  return (
    <Card padded={false} className={s.attente}>
      <div className={s.attenteTete}>
        <Title as="h2">Brouillons à envoyer</Title>
        <span className={s.sub}>Rédigés, relus en partie, et gardés pour plus tard : rien n'est parti.</span>
      </div>
      {echec ? (
        <div className={s.attenteEchec}>
          <Notice tone="warn">{echec}</Notice>
        </div>
      ) : null}
      <ul className={s.list}>
        {liste.map((b) => {
          const patient = state.patients[b.patientId]
          return (
            <li key={b.id} className={s.attenteLigne}>
              <span className={s.who}>
                <span className={s.name}>{patient?.name ?? 'Fiche introuvable'}</span>
                <span className={s.sub}>
                  Séance du {jourDeLaSeance(b.le)}
                  {b.sansEnregistrement ? ' · sans enregistrement' : ''}
                </span>
              </span>
              <Button variant="secondary" onClick={() => void ouvrir(b.id)} disabled={Boolean(enCours) || !patient}>
                {enCours === b.id ? 'Ouverture…' : 'Reprendre'}
              </Button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/**
 * Étape 1 : pour qui.
 *
 * Une séance n'existe pas en l'air — elle se rattache à une fiche, celle qui
 * recevra la note, les modules et les audios. Tant qu'aucune n'est choisie,
 * il n'y a ni consentement à signer ni micro à ouvrir : c'est pourquoi cet
 * écran précède tout le reste plutôt que d'être un réglage parmi d'autres.
 */
export function PatientPick() {
  const { state, set } = useStore()
  const fiches = state.patientOrder

  if (!fiches.length) {
    return (
      <Card className={s.empty}>
        <h2 className={s.emptyTitle}>Aucune fiche dans ce cabinet</h2>
        <p className={s.emptyBody}>
          Une séance se rattache à une fiche. Ouvrez-en une, avec un nom et une adresse : c'est
          tout ce qu'il faut pour enregistrer.
        </p>
        <Button
          variant="primary"
          onClick={() => set({ mode: 'therapist', pNewOpen: true, pNotice: '' })}
        >
          Ajouter un patient
        </Button>
      </Card>
    )
  }

  return (
    <>
      {state.avisSeance ? (
        <div className={s.avis}>
          <Notice tone="ok">{state.avisSeance}</Notice>
        </div>
      ) : null}
      <BrouillonsEnAttente />
      <Card padded={false} className={s.card}>
        <div className={s.list}>
          {fiches.map((id) => {
            const patient = state.patients[id]
            if (!patient) return null
            return (
              <button
                key={id}
                type="button"
                className={s.row}
                onClick={() =>
                  /* Choisir, c'est ouvrir une séance neuve : rien de la
                     précédente ne doit rester. La fiche latérale suit, pour que
                     « Voir le parcours » ouvre bien celle-là. */
                  set({ ...nouvelleSeance(id), sel: id, openTask: null, pAudio: 0, playing: false })
                }
              >
                <Avatar initials={patient.initials} />
                <span className={s.who}>
                  <span className={s.name}>{patient.name}</span>
                  <span className={s.sub}>{patient.subtitle}</span>
                </span>
                <span className={s.facts}>
                  <span className={s.fact}>{libelleEnTete(patient)}</span>
                  <span
                    className={s.dot}
                    style={{ background: riskColor(patient.adherence) }}
                    aria-hidden
                  />
                </span>
              </button>
            )
          })}
        </div>
        <p className={s.foot}>
          {state.patientsReels
            ? 'Les fiches de votre cabinet. La note et les modules iront dans celle que vous choisissez.'
            : "Fiches de démonstration. Connectez-vous à votre cabinet pour enregistrer une vraie séance."}
        </p>
      </Card>
    </>
  )
}
