import { useEffect, useState } from 'react'
import { Button, Card, Chip, Notice, TextInput, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { patientOf } from '@/state/selectors'
import { useAppState } from '@/state/store'
import s from './FicheSettings.module.css'

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
  /** Saisie du programme qu'on est en train de nommer. */
  const [nouveau, setNouveau] = useState('')
  const [ajout, setAjout] = useState(false)
  /** La suppression se confirme en toutes lettres : elle est irréversible. */
  const [suppression, setSuppression] = useState('')
  const [supprime, setSupprime] = useState(false)

  // Les champs suivent la fiche OUVERTE : on ne garde pas les saisies d'une
  // patiente quand on passe à la suivante. Ils ne suivent pas chaque
  // rechargement du dossier — cocher un module ailleurs sur la page ne doit
  // pas vider un formulaire en cours de frappe.
  useEffect(() => {
    if (!fiche) return
    setProgramme(fiche.program.replace(/^Programme\s+/i, ''))
    setSeances(fiche.totalSessions || 6)
    setEchelle(fiche.scaleLabel === REPLI_ECHELLE ? '' : fiche.scaleLabel)
    setQuestion(fiche.scaleQuestion)
    setProchaine(fiche.nextSession === REPLI_PROCHAINE ? '' : fiche.nextSession)
    setNotice(null)
    setOuvert(false)
    setNouveau('')
    setSuppression('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sel])

  if (!fiche || !cabinet?.reel) return null

  async function enregistrer() {
    if (!cabinet) return
    setEnvoi(true)
    setNotice(null)
    const r = await cabinet.majFiche(state.sel, {
      // Le libellé nu, tel qu'il figure au catalogue : c'est sur lui que
      // l'écran des programmes rattache. Les fiches d'avant, préfixées
      // « Programme … », restent lues correctement à l'affichage.
      programme: programme.trim(),
      seances,
      echelle: echelle.trim(),
      question: question.trim(),
      prochaine: prochaine.trim(),
    })
    setEnvoi(false)
    setNotice({ tone: r.ok ? 'ok' : 'warn', text: r.ok ? 'Fiche mise à jour.' : r.message })
    if (r.ok) setOuvert(false)
  }

  // Le programme déjà porté par la fiche reste proposé même s'il ne figure
  // plus au catalogue : une fiche réglée l'an dernier ne doit pas perdre son
  // programme parce qu'il a été retiré depuis.
  const choix = state.programmes.includes(programme) || !programme
    ? state.programmes
    : [programme, ...state.programmes]

  /**
   * Nommer un programme depuis la fiche : c'est là qu'on s'aperçoit qu'il
   * manque, pas dans un écran de réglages qu'il faudrait aller chercher.
   */
  async function ajouterProgramme() {
    if (!cabinet || ajout) return
    const propre = nouveau.trim()
    if (!propre) return
    setAjout(true)
    setNotice(null)
    const r = await cabinet.creerProgramme(propre)
    setAjout(false)
    if (r.ok) {
      setNouveau('')
      setProgramme(propre)
      return
    }
    setNotice({ tone: 'warn', text: r.message })
  }

  /** Retirer du catalogue. Les fiches qui le portent gardent leur libellé. */
  async function retirerProgramme(label: string) {
    if (!cabinet || ajout) return
    setAjout(true)
    setNotice(null)
    const r = await cabinet.retirerProgramme(label)
    setAjout(false)
    if (r.ok && programme === label) setProgramme('')
    if (!r.ok) setNotice({ tone: 'warn', text: r.message })
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
              {choix.map((p) => (
                <Chip key={p} on={programme === p} onClick={() => setProgramme(p)}>
                  {p}
                </Chip>
              ))}
            </div>
            <div className={s.ajout}>
              <TextInput
                value={nouveau}
                onChange={(e) => setNouveau(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  void ajouterProgramme()
                }}
                placeholder="Nommer un programme…"
                aria-label="Nom du nouveau programme"
              />
              <Button variant="secondary" onClick={() => void ajouterProgramme()} disabled={ajout || !nouveau.trim()}>
                {ajout ? 'Ajout…' : 'Ajouter'}
              </Button>
            </div>
            <span className={s.hint}>
              {state.programmes.length === 0
                ? "Vous n'avez pas encore nommé de programme. Écrivez le vôtre : il servira à toutes vos fiches."
                : 'Vos programmes, tels que vous les avez nommés. Ils sont propres à votre cabinet.'}
            </span>
            {programme && state.programmes.includes(programme) ? (
              <button
                type="button"
                className={s.retirer}
                disabled={ajout}
                onClick={() => void retirerProgramme(programme)}
              >
                Retirer « {programme} » de mes programmes
              </button>
            ) : null}
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

          {/* L'hypnose : une option, pas un automatisme. Toutes les patientes
              n'en ont pas besoin, et c'est de loin l'analyse la plus coûteuse
              du produit — la thérapeute décide, fiche par fiche. */}
          <div className={s.option}>
            <label className={s.optionLigne}>
              <input
                type="checkbox"
                checked={fiche.hypnoseActivee}
                disabled={envoi}
                onChange={(e) => {
                  const active = e.target.checked
                  void cabinet?.reglerHypnose(state.sel, active).then((r) => {
                    if (!r.ok) setNotice({ tone: 'warn', text: r.message })
                  })
                }}
              />
              <span>
                <span className={s.optionTitre}>Écrire une hypnose personnalisée</span>
                <span className={s.hint}>
                  Chaque séance produira une hypnose complète — environ trente minutes à lire à
                  voix haute — bâtie sur les formulations relevées pendant la captation. Elle
                  reste consultable depuis cette fiche.
                </span>
              </span>
            </label>
          </div>

          <div className={s.actions}>
            <Button variant="primary" type="submit" disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button variant="ghost" onClick={() => setOuvert(false)} disabled={envoi}>
              Annuler
            </Button>
          </div>

          {/* Supprimer une fiche emporte un dossier de santé entier. On fait
              écrire le nom : un bouton seul se clique par erreur, un nom
              recopié ne s'écrit pas par accident. */}
          <div className={s.danger}>
            <span className={s.dangerTitre}>Supprimer la fiche de {fiche.name}</span>
            <span className={s.hint}>
              Son dossier, ses modules, ses audios, son journal et ses hypnoses partent avec
              elle. Rien ne se récupère. Pour confirmer, recopiez son nom.
            </span>
            <div className={s.dangerLigne}>
              <TextInput
                value={suppression}
                onChange={(e) => setSuppression(e.target.value)}
                placeholder={fiche.name}
                aria-label={`Recopiez « ${fiche.name} » pour confirmer la suppression`}
                disabled={supprime}
              />
              <Button
                variant="danger"
                type="button"
                disabled={supprime || suppression.trim() !== fiche.name}
                onClick={() => {
                  setSupprime(true)
                  void cabinet?.supprimerPatiente(state.sel).then((r) => {
                    if (!r.ok) {
                      setSupprime(false)
                      setNotice({ tone: 'warn', text: r.message })
                    }
                  })
                }}
              >
                {supprime ? 'Suppression…' : 'Supprimer définitivement'}
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </Card>
  )
}
