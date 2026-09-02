import { useEffect, useState } from 'react'
import { Button, Card, Chip, Notice, TextInput, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { patientOf } from '@/state/selectors'
import { useAppState } from '@/state/store'
import s from './FicheSettings.module.css'

/** Les quatre programmes du cabinet. */
const PROGRAMMES = ['Liberté', 'Équilibre', 'Harmonie', 'Compétences']

/** Les valeurs de repli que l'assemblage affiche : à l'édition, elles valent « vide ». */
const REPLI_ECHELLE = 'Auto-évaluation'
const REPLI_PROCHAINE = 'Aucune séance planifiée'

/**
 * Réglages de la fiche : ce qu'on a retiré de la création parce que ça ne
 * s'invente pas avant la première séance — le programme, l'échelle du soir
 * et sa question, la prochaine séance. Replié par défaut : c'est un réglage,
 * pas une lecture quotidienne.
 */
export function FicheSettings() {
  const state = useAppState()
  const cabinet = useMaybeCabinet()
  const fiche = patientOf(state)
  const [ouvert, setOuvert] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  const [programme, setProgramme] = useState('')
  const [seances, setSeances] = useState(6)
  const [echelle, setEchelle] = useState('')
  const [question, setQuestion] = useState('')
  const [prochaine, setProchaine] = useState('')

  // Les champs suivent la fiche ouverte ; on ne garde pas les saisies d'une
  // patiente quand on passe à la suivante.
  useEffect(() => {
    if (!fiche) return
    setProgramme(fiche.program.replace(/^Programme\s+/i, ''))
    setSeances(fiche.totalSessions || 6)
    setEchelle(fiche.scaleLabel === REPLI_ECHELLE ? '' : fiche.scaleLabel)
    setQuestion(fiche.scaleQuestion)
    setProchaine(fiche.nextSession === REPLI_PROCHAINE ? '' : fiche.nextSession)
    setNotice(null)
    setOuvert(false)
  }, [state.sel, fiche])

  if (!fiche || !cabinet?.reel) return null

  async function enregistrer() {
    if (!cabinet) return
    setEnvoi(true)
    setNotice(null)
    const r = await cabinet.majFiche(state.sel, {
      programme: programme ? `Programme ${programme}` : '',
      seances,
      echelle: echelle.trim(),
      question: question.trim(),
      prochaine: prochaine.trim(),
    })
    setEnvoi(false)
    setNotice({ tone: r.ok ? 'ok' : 'warn', text: r.ok ? 'Fiche mise à jour.' : r.message })
    if (r.ok) setOuvert(false)
  }

  const resume = [
    fiche.program || 'Aucun programme',
    fiche.totalSessions ? `${fiche.totalSessions} séances prévues` : null,
    fiche.scaleLabel === REPLI_ECHELLE ? "Rien de suivi le soir" : `Suivi : ${fiche.scaleLabel}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card className={s.card}>
      <div className={s.head}>
        <div className={s.headText}>
          <Title>Réglages de la fiche</Title>
          <span className={s.resume}>{resume}</span>
        </div>
        <Button variant={ouvert ? 'ghost' : 'secondary'} onClick={() => setOuvert((o) => !o)}>
          {ouvert ? 'Fermer' : 'Modifier'}
        </Button>
      </div>

      {notice ? (
        <div className={s.notice}>
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      ) : null}

      {ouvert ? (
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault()
            void enregistrer()
          }}
        >
          <div className={s.field}>
            <span className={s.label}>Programme</span>
            <div className={s.chips}>
              <Chip on={!programme} onClick={() => setProgramme('')}>
                Aucun
              </Chip>
              {PROGRAMMES.map((p) => (
                <Chip key={p} on={programme === p} onClick={() => setProgramme(p)}>
                  {p}
                </Chip>
              ))}
            </div>
          </div>

          <div className={s.row}>
            <label className={s.field}>
              <span className={s.label}>Ce que vous suivez</span>
              <TextInput
                value={echelle}
                onChange={(e) => setEchelle(e.target.value)}
                placeholder="Envie de fumer"
              />
              <span className={s.hint}>Le titre de la courbe, et de son échelle du soir.</span>
            </label>
            <label className={s.field}>
              <span className={s.label}>Séances prévues</span>
              <TextInput
                type="number"
                min={1}
                max={52}
                value={seances}
                onChange={(e) => setSeances(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
              />
            </label>
          </div>

          <label className={s.field}>
            <span className={s.label}>La question du soir</span>
            <TextInput
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Où en est l'envie de fumer ?"
            />
            <span className={s.hint}>Elle la lira chaque soir : écrivez-la comme vous la lui diriez.</span>
          </label>

          <label className={s.field}>
            <span className={s.label}>Prochaine séance</span>
            <TextInput
              value={prochaine}
              onChange={(e) => setProchaine(e.target.value)}
              placeholder="Jeudi 10 septembre, 14 h"
            />
          </label>

          <div className={s.actions}>
            <Button variant="primary" type="submit" disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button variant="ghost" onClick={() => setOuvert(false)} disabled={envoi}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  )
}
