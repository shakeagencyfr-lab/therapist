import { useEffect, useState } from 'react'
import { Button, Card, Notice, TextArea, TextInput, Title } from '@/components/ui'
import type { EtatParcoursTypes } from '@/cabinet/useParcoursTypes'
import {
  LIMITE_CONSIGNE,
  MAX_EXERCICES,
  TYPES_DU_PARCOURS,
  deplacer,
  estTypeDuParcours,
  parcoursModifie,
  refusParcours,
  type ExerciceType,
} from '@/lib/parcoursTypes'
import s from './Parcours.module.css'

interface Resultat {
  ok: boolean
  message: string
}

export interface VueParcoursTypeProps {
  etat: EtatParcoursTypes
  programme: string
  /** Le parcours tel qu'il est enregistré. */
  exercices: ExerciceType[]
  /** Combien de personnes suivent déjà ce programme. */
  suiveurs: number
  onEnregistrer: (exercices: ExerciceType[]) => Promise<Resultat>
  onRelire: () => void
  /** Proposer le parcours à celles et ceux qui suivent déjà le programme. */
  onProposer: () => void
}

const VIDE: ExerciceType = { titre: '', type: 'Exercice', consigne: '' }

/**
 * Le parcours par défaut d'un programme : quelques exercices — un titre, un
 * type, une consigne courte — proposés à chaque attribution.
 *
 * Vue pure : l'état de lecture et les gestes viennent de l'appelant
 * (useParcoursTypes). Le banc de rendu la montre dans chacun de ses états.
 */
export function VueParcoursType({
  etat,
  programme,
  exercices,
  suiveurs,
  onEnregistrer,
  onRelire,
  onProposer,
}: VueParcoursTypeProps) {
  const [brouillon, setBrouillon] = useState<ExerciceType[]>(exercices)
  const [enCours, setEnCours] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  // Le brouillon suit le programme ouvert et chaque relecture — pas la frappe.
  const cle = `${programme}|${JSON.stringify(exercices)}`
  useEffect(() => {
    setBrouillon(exercices)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])
  useEffect(() => setNotice(null), [programme])

  const modifie = parcoursModifie(exercices, brouillon)
  const refus = refusParcours(brouillon)
  const plein = brouillon.length >= MAX_EXERCICES

  function changer(i: number, patch: Partial<ExerciceType>) {
    setBrouillon((l) => l.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  }

  async function enregistrer() {
    if (enCours || refus || !modifie) return
    setEnCours(true)
    setNotice(null)
    const r = await onEnregistrer(brouillon)
    setEnCours(false)
    setNotice({ tone: r.ok ? 'ok' : 'warn', text: r.message })
  }

  let corps
  if (etat === 'demo') {
    corps = (
      <p className={s.muted}>
        Démonstration : le parcours par défaut se règle depuis votre cabinet, une fois connecté.
      </p>
    )
  } else if (etat === 'indisponible') {
    corps = (
      <p className={s.muted}>
        Le parcours par défaut n'est pas encore disponible sur votre cabinet. Vos programmes et
        leurs rattachements fonctionnent comme avant.
      </p>
    )
  } else if (etat === 'chargement' && !exercices.length) {
    corps = (
      <p className={s.muted} role="status">
        Lecture du parcours…
      </p>
    )
  } else {
    corps = (
      <>
        {etat === 'echec' ? (
          <div className={s.noticeSlot}>
            <Notice tone="warn">
              Le parcours de ce programme n'a pas pu être lu. Ce qui manque ici n'est pas vide : il
              n'a pas été chargé.{' '}
              <button type="button" className={s.petit} onClick={onRelire}>
                Relire
              </button>
            </Notice>
          </div>
        ) : null}

        {brouillon.length === 0 ? (
          <p className={s.muted}>
            Aucun exercice pour l'instant. Ajoutez ceux que vous confiez d'ordinaire en début de
            programme : ils vous seront proposés à chaque attribution, personne par personne.
          </p>
        ) : (
          <ol className={s.liste}>
            {brouillon.map((e, i) => {
              const n = i + 1
              return (
                <li key={e.id ?? `nouveau-${i}`} className={s.exercice}>
                  <span className={s.rang} aria-hidden>
                    {n}
                  </span>
                  <div className={s.champs}>
                    <div className={s.ligne}>
                      <label className={s.champ}>
                        <span className={s.label}>Titre</span>
                        <TextInput
                          value={e.titre}
                          maxLength={120}
                          placeholder="Respiration carrée"
                          onChange={(ev) => changer(i, { titre: ev.target.value })}
                          disabled={enCours}
                        />
                      </label>
                      <label className={s.champ}>
                        <span className={s.label}>Type</span>
                        <select
                          className={s.select}
                          value={e.type}
                          disabled={enCours}
                          onChange={(ev) => {
                            const t = ev.target.value
                            if (estTypeDuParcours(t)) changer(i, { type: t })
                          }}
                        >
                          {TYPES_DU_PARCOURS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className={s.champ}>
                      <span className={s.label}>Consigne courte</span>
                      <TextArea
                        className={s.consigne}
                        value={e.consigne}
                        maxLength={LIMITE_CONSIGNE}
                        rows={2}
                        placeholder="Une étape par ligne. Facultatif : le détail se donne en séance."
                        onChange={(ev) => changer(i, { consigne: ev.target.value })}
                        disabled={enCours}
                      />
                    </label>
                    <div className={s.gestes}>
                      <button
                        type="button"
                        className={s.petit}
                        disabled={enCours || i === 0}
                        onClick={() => setBrouillon((l) => deplacer(l, i, -1))}
                        aria-label={`Monter l'exercice ${n}`}
                      >
                        Monter
                      </button>
                      <button
                        type="button"
                        className={s.petit}
                        disabled={enCours || i === brouillon.length - 1}
                        onClick={() => setBrouillon((l) => deplacer(l, i, 1))}
                        aria-label={`Descendre l'exercice ${n}`}
                      >
                        Descendre
                      </button>
                      <button
                        type="button"
                        className={`${s.petit} ${s.retirer}`}
                        disabled={enCours}
                        onClick={() => setBrouillon((l) => l.filter((_, j) => j !== i))}
                        aria-label={`Retirer l'exercice ${n}${e.titre.trim() ? ` « ${e.titre.trim()} »` : ''}`}
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        <div className={s.actions}>
          <Button
            variant="secondary"
            disabled={enCours || plein}
            onClick={() => setBrouillon((l) => [...l, { ...VIDE }])}
          >
            Ajouter un exercice
          </Button>
          {plein ? <span className={s.hint}>Douze exercices au plus : le reste se confie fiche par fiche.</span> : null}
        </div>

        {modifie && refus ? (
          <div className={s.noticeSlot}>
            <Notice tone="warn">{refus}</Notice>
          </div>
        ) : null}
        {notice ? (
          <div className={s.noticeSlot} role="status">
            <Notice tone={notice.tone}>{notice.text}</Notice>
          </div>
        ) : null}

        <div className={s.actions}>
          <Button variant="primary" disabled={enCours || !modifie || Boolean(refus)} onClick={() => void enregistrer()}>
            {enCours ? 'Enregistrement…' : 'Enregistrer le parcours'}
          </Button>
          {modifie ? (
            <Button variant="ghost" disabled={enCours} onClick={() => setBrouillon(exercices)}>
              Annuler les changements
            </Button>
          ) : null}
          {!modifie && exercices.length > 0 && suiveurs > 0 ? (
            <Button variant="ghost" className={s.boutonLong} onClick={onProposer}>
              {suiveurs === 1 ? 'Le proposer à la personne qui le suit' : `Le proposer aux ${suiveurs} personnes qui le suivent`}
            </Button>
          ) : null}
        </div>
      </>
    )
  }

  return (
    <Card className={s.carte}>
      <Title large as="h2">
        Parcours par défaut
      </Title>
      <p className={s.intro}>
        Les exercices que « {programme} » propose quand vous l'attribuez. Rien ne s'ajoute sans
        vous : à chaque attribution, vous voyez la liste et cochez ce qui convient à la personne.
      </p>
      {corps}
    </Card>
  )
}
