import { useEffect, useState } from 'react'
import { Button, Card, Notice, Pill, SquareCheck, Title } from '@/components/ui'
import {
  apercuPourLePatient,
  choixParDefaut,
  etapesDeLaConsigne,
  libelleAjout,
  type ExerciceType,
} from '@/lib/parcoursTypes'
import s from './Parcours.module.css'

interface Resultat {
  ok: boolean
  message: string
}

/** Une personne à qui proposer le parcours, et ce que son parcours contient déjà. */
export interface PersonneAProposer {
  id: string
  nom: string
  parcours: Array<{ title: string; kind: string }>
}

export interface VueProposerParcoursProps {
  programme: string
  /** Le parcours enregistré du programme : seuls les exercices qui ont un identifiant se proposent. */
  exercices: ExerciceType[]
  personnes: PersonneAProposer[]
  onAjouter: (patient: { id: string; nom: string }, exerciceIds: string[]) => Promise<Resultat>
  onFermer: () => void
}

/**
 * Proposer le parcours d'un programme, personne par personne.
 *
 * L'APERÇU AVANT L'AJOUT. Chaque exercice se montre avec sa consigne telle
 * que le patient la lira ; ce qu'il a déjà n'est pas coché d'office. Rien ne
 * part sans un geste par personne — et « Ne rien ajouter » est un geste aussi.
 *
 * Vue pure : les gestes viennent de l'appelant. Le banc de rendu la montre.
 */
export function VueProposerParcours({ programme, exercices, personnes, onAjouter, onFermer }: VueProposerParcoursProps) {
  /* Cochés d'office dès le premier affichage — pas après : une liste qui
     s'affiche vide puis se coche fait croire qu'on a touché à quelque chose. */
  const parDefaut = () => {
    const initial: Record<string, string[]> = {}
    for (const p of personnes) initial[p.id] = choixParDefaut(apercuPourLePatient(exercices, p.parcours))
    return initial
  }
  const [choix, setChoix] = useState<Record<string, string[]>>(parDefaut)
  /** La phrase rendue pour chaque personne traitée : elle remplace sa liste. */
  const [faits, setFaits] = useState<Record<string, { tone: 'ok' | 'warn'; text: string; fini: boolean }>>({})
  const [enCours, setEnCours] = useState('')

  // Une autre liste proposée (autre programme, autres personnes) repart de ses cases d'office.
  const cle = `${programme}|${personnes.map((p) => p.id).join(',')}|${exercices.map((e) => e.id).join(',')}`
  const [cleVue, setCleVue] = useState(cle)
  useEffect(() => {
    if (cle === cleVue) return
    setCleVue(cle)
    setChoix(parDefaut())
    setFaits({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])

  if (!exercices.some((e) => e.id) || personnes.length === 0) return null

  async function ajouter(p: PersonneAProposer) {
    const ids = choix[p.id] ?? []
    if (enCours || !ids.length) return
    setEnCours(p.id)
    const r = await onAjouter({ id: p.id, nom: p.nom }, ids)
    setEnCours('')
    setFaits((f) => ({ ...f, [p.id]: { tone: r.ok ? 'ok' : 'warn', text: r.message, fini: r.ok } }))
  }

  function basculer(patientId: string, exerciceId: string) {
    setChoix((c) => {
      const avant = c[patientId] ?? []
      return {
        ...c,
        [patientId]: avant.includes(exerciceId) ? avant.filter((x) => x !== exerciceId) : [...avant, exerciceId],
      }
    })
  }

  const restants = personnes.filter((p) => !faits[p.id]?.fini).length

  return (
    <Card className={s.carte}>
      <Title large as="h2">
        Proposer le parcours de « {programme} »
      </Title>
      <p className={s.intro}>
        Cochez, pour chaque personne, les exercices à ajouter. Ils arrivent à la suite de son
        parcours, dans son espace, avec leur consigne. Ce qu'elle a déjà n'est pas coché, et ne
        serait pas ajouté deux fois.
      </p>

      <div className={s.personnes}>
        {personnes.map((p) => {
          const apercu = apercuPourLePatient(exercices, p.parcours)
          const choisis = choix[p.id] ?? []
          const fait = faits[p.id]
          return (
            <section key={p.id} className={s.personne} aria-label={`Parcours proposé à ${p.nom}`}>
              <h3 className={s.personneTitre}>{p.nom}</h3>
              {fait?.fini ? (
                <p className={s.fait} role="status">
                  {fait.text}
                </p>
              ) : (
                <>
                  <ul className={s.choix}>
                    {apercu.map((e) => {
                      const on = choisis.includes(e.id)
                      const etapes = etapesDeLaConsigne(e.consigne)
                      return (
                        <li key={e.id} className={s.choixLigne}>
                          <SquareCheck
                            on={on}
                            onClick={() => basculer(p.id, e.id)}
                            label={`${on ? 'Ne pas ajouter' : 'Ajouter'} « ${e.titre} » au parcours de ${p.nom}`}
                          />
                          <span className={s.choixTexte}>
                            <span className={s.choixTitre}>
                              {e.titre} <Pill tone="kind">{e.type}</Pill>
                              {e.dejaLa ? <span className={s.deja}>déjà dans son parcours</span> : null}
                            </span>
                            {etapes.length ? (
                              <ol className={s.choixConsigne}>
                                {etapes.map((etape, i) => (
                                  <li key={i}>{etape}</li>
                                ))}
                              </ol>
                            ) : (
                              <span className={s.deja}>Sans consigne écrite : expliqué en séance.</span>
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                  {fait && !fait.fini ? (
                    <div className={s.noticeSlot}>
                      <Notice tone="warn">{fait.text}</Notice>
                    </div>
                  ) : null}
                  <div className={s.actions}>
                    <Button
                      variant="primary"
                      disabled={enCours !== '' || choisis.length === 0}
                      onClick={() => void ajouter(p)}
                    >
                      {enCours === p.id ? 'Ajout…' : libelleAjout(choisis.length)}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={enCours !== ''}
                      onClick={() =>
                        setFaits((f) => ({
                          ...f,
                          [p.id]: { tone: 'ok', text: `Rien d'ajouté pour ${p.nom}.`, fini: true },
                        }))
                      }
                    >
                      Ne rien ajouter
                    </Button>
                  </div>
                </>
              )}
            </section>
          )
        })}
      </div>

      <div className={s.actions}>
        <Button variant={restants === 0 ? 'secondary' : 'ghost'} disabled={enCours !== ''} onClick={onFermer}>
          {restants === 0 ? 'Terminer' : 'Fermer sans rien ajouter de plus'}
        </Button>
      </div>
    </Card>
  )
}
