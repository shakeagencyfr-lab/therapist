import { useState } from 'react'
import { Button, Notice, Title } from '@/components/ui'
import { MOUVEMENTS_HYPNOSE, NOM_MOUVEMENT } from '@/services/aiClient'
import { useEcritureHypnose } from '@/cabinet/useEcritureHypnose'
import { useStore } from '@/state/store'
import { HypnoseToggle } from './HypnoseToggle'
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
  const { state } = useStore()
  const key = state.sessionPatient
  const patient = state.patients[key]

  const [intention, setIntention] = useState('')
  /*
   * L'option se décide AUSSI ici, au moment où la question se pose vraiment :
   * la séance vient de se dérouler, la thérapeute sait maintenant si cette
   * patiente-là en tirera quelque chose.
   *
   * C'est le même réglage que sur la fiche, pas un doublon : cocher ici
   * l'ouvre aussi pour les séances suivantes. Une copie locale garde l'écran
   * réactif — et laisse la démonstration fonctionner sans base.
   */
  const [ouverteIci, setOuverteIci] = useState<boolean | null>(null)
  const { ecriture, enCours, ecrits, erreur, fini, ecrire } = useEcritureHypnose()

  if (!patient) return null

  const prenom = patient.name.split(' ')[0] ?? patient.name
  const ouverte = ouverteIci ?? patient.hypnoseActivee
  const draft = state.draft

  return (
    <section className={s.card}>
      <div className={s.head}>
        <Title large as="h2">
          Hypnose personnalisée
        </Title>
        {ouverte ? <span className={s.duree}>≈ 30 minutes de lecture</span> : null}
      </div>

      <HypnoseToggle actif={ouverte} onChange={setOuverteIci} disabled={ecriture} />

      {!ouverte ? null : (
        <>
          <p className={s.sub}>
            Écrite sur les formulations relevées ci-dessus, en quatre mouvements : induction,
            approfondissement, travail, retour. C'est un texte à dire, pas à donner.
          </p>

          {!ecriture && ecrits.length === 0 ? (
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
              <Button
                variant="primary"
                onClick={() => draft && void ecrire(key, draft, intention)}
                disabled={!draft || ecriture}
              >
                {ecriture ? 'Écriture en cours…' : "Écrire l'hypnose"}
              </Button>
            </div>
          ) : null}

          {erreur ? <Notice tone="warn">{erreur}</Notice> : null}

          {ecriture || ecrits.length > 0 ? (
            <>
            {enCours ? (
              <p className={s.encours}>
                <span className={s.point} aria-hidden />
                {enCours} en cours d'écriture… chaque mouvement demande une trentaine de
                secondes.
              </p>
            ) : null}
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
            </>
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
