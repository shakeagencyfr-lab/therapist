import { useState } from 'react'
import { Button, Notice, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import {
  AiError,
  MOUVEMENTS_HYPNOSE,
  NOM_MOUVEMENT,
  buildPatientContext,
  genererHypnose,
  type MouvementEcrit,
} from '@/services/aiClient'
import { useStore } from '@/state/store'
import s from './HypnoseCard.module.css'

/**
 * L'hypnose personnalisée, écrite pour cette patiente.
 *
 * Elle remplace l'ancien « brouillon d'induction » : cent trente mots trop
 * courts pour être lus en séance et trop génériques pour être repris. Ici
 * c'est la séance entière, environ trente minutes à voix haute, bâtie sur
 * les formulations relevées pendant la captation.
 *
 * L'ÉCRITURE SE VOIT. Quatre appels séparés, un par mouvement, et l'écran
 * dit lequel s'écrit : trois minutes de rond qui tourne feraient croire à
 * une panne. Chaque mouvement est conservé dès qu'il arrive — une écriture
 * interrompue au troisième laisse les deux premiers acquis.
 *
 * ELLE NE S'OUVRE PAS TOUJOURS. C'est une option que la thérapeute règle
 * patiente par patiente : toutes n'en ont pas besoin, et elle coûte plus
 * cher que tout le reste de la séance réuni.
 */
export function HypnoseCard() {
  const { state, read } = useStore()
  const cabinet = useMaybeCabinet()
  const key = state.sessionPatient
  const patient = state.patients[key]

  const [intention, setIntention] = useState('')
  /*
   * L'option se décide AUSSI ici, au moment où la question se pose vraiment :
   * la séance vient de se dérouler, la thérapeute sait maintenant si cette
   * patiente-là en tirera quelque chose. L'envoyer régler une case sur la
   * fiche à ce moment-là lui ferait perdre le fil.
   *
   * C'est le même réglage que sur la fiche, pas un doublon : cocher ici
   * l'ouvre aussi pour les séances suivantes. Une copie locale garde l'écran
   * réactif — et laisse la démonstration fonctionner sans base.
   */
  const [ouverteIci, setOuverteIci] = useState<boolean | null>(null)
  const [ecrits, setEcrits] = useState<MouvementEcrit[]>([])
  const [enCours, setEnCours] = useState<string>('')
  const [erreur, setErreur] = useState('')
  const [fini, setFini] = useState(false)

  if (!patient) return null

  const prenom = patient.name.split(' ')[0] ?? patient.name
  const ouverte = ouverteIci ?? patient.hypnoseActivee
  const draft = state.draft

  async function ecrire() {
    if (!draft) return
    setErreur('')
    setFini(false)
    setEcrits([])

    // L'hypnose s'ouvre en base AVANT d'être écrite : chaque mouvement y est
    // versé dès qu'il arrive, et rien n'est perdu si l'un d'eux échoue.
    const hypnoseId = cabinet?.reel
      ? await cabinet.creerHypnose(key, state.sessionId || null, intention.trim())
      : null

    try {
      const tous = await genererHypnose(
        {
          context: buildPatientContext(read(), key),
          mots: draft.mots ?? [],
          themes: draft.themes ?? [],
          synthese: draft.synthese ?? '',
          intention: intention.trim(),
        },
        async (ecrit, rang) => {
          setEcrits((prev) => [...prev, ecrit])
          setEnCours(MOUVEMENTS_HYPNOSE[rang] ? NOM_MOUVEMENT[MOUVEMENTS_HYPNOSE[rang]] : '')
          if (hypnoseId) await cabinet?.ajouterMouvement(hypnoseId, ecrit, rang)
        },
      )
      if (hypnoseId) {
        // Le titre de la séance est celui de son induction : c'est la
        // métaphore qui la porte d'un bout à l'autre.
        await cabinet?.acheverHypnose(hypnoseId, tous[0]?.titre || `Séance pour ${prenom}`)
      }
      setFini(true)
    } catch (err) {
      setErreur(err instanceof AiError ? err.message : "L'hypnose n'a pas pu être écrite.")
    } finally {
      setEnCours('')
    }
  }

  const ecriture = Boolean(enCours) || (ecrits.length > 0 && !fini && !erreur)

  return (
    <section className={s.card}>
      <div className={s.head}>
        <Title large as="h2">
          Hypnose personnalisée
        </Title>
        {ouverte ? <span className={s.duree}>≈ 30 minutes de lecture</span> : null}
      </div>

      <label className={s.bascule}>
        <input
          type="checkbox"
          checked={ouverte}
          disabled={ecriture}
          onChange={(e) => {
            const active = e.target.checked
            setOuverteIci(active)
            void cabinet?.reglerHypnose(key, active)
          }}
        />
        <span>
          <span className={s.basculeTitre}>Écrire une hypnose pour {prenom}</span>
          <span className={s.basculeHint}>
            Une séance complète, bâtie sur les formulations relevées ci-dessus et lisible à voix
            haute. C'est l'analyse la plus coûteuse du produit : cochez-la quand elle sert.
            Le réglage vaut aussi pour ses prochaines séances.
          </span>
        </span>
      </label>

      {!ouverte ? null : (
        <>
          <p className={s.sub}>
            Écrite sur les formulations relevées ci-dessus, en quatre mouvements : induction,
            approfondissement, travail, retour. C'est un texte à dire, pas à donner.
          </p>

          {ecrits.length === 0 && !ecriture ? (
            <div className={s.lancement}>
              <label className={s.champ}>
                <span className={s.label}>Ce que vous voulez travailler (facultatif)</span>
                <input
                  className={s.input}
                  value={intention}
                  onChange={(e) => setIntention(e.target.value)}
                  placeholder="Installer le délai avant le geste, ancrer la main sur le sternum…"
                />
              </label>
              <Button variant="primary" onClick={() => void ecrire()} disabled={!draft}>
                Écrire l'hypnose
              </Button>
            </div>
          ) : null}

          {erreur ? <Notice tone="warn">{erreur}</Notice> : null}

          {ecrits.length > 0 || ecriture ? (
            <ol className={s.avancement}>
              {MOUVEMENTS_HYPNOSE.map((m, i) => {
                const ecrit = ecrits[i]
                const encours = !ecrit && i === ecrits.length && ecriture
                return (
                  <li key={m} className={ecrit ? s.fait : encours ? s.actif : s.attente}>
                    <span className={s.puce}>{ecrit ? '✓' : i + 1}</span>
                    <span>{ecrit?.titre || NOM_MOUVEMENT[m]}</span>
                  </li>
                )
              })}
            </ol>
          ) : null}

          {ecrits.map((e) => (
            <article key={e.mouvement} className={s.mouvement}>
              <h3 className={s.mouvementTitre}>
                {NOM_MOUVEMENT[e.mouvement]} · {e.titre}
              </h3>
              {e.texte.split('\n').filter(Boolean).map((para, i) => (
                <p key={i} className={s.para}>
                  {para}
                </p>
              ))}
            </article>
          ))}

          {fini ? (
            <Notice tone="ok">
              Hypnose écrite et conservée. Vous la retrouverez sur la fiche de {prenom}.
            </Notice>
          ) : null}
        </>
      )}
    </section>
  )
}
