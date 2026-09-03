import { useState } from 'react'
import { Button, Card, Notice, Overline, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { useEcritureHypnose } from '@/cabinet/useEcritureHypnose'
import { MOUVEMENTS_HYPNOSE, NOM_MOUVEMENT } from '@/services/aiClient'
import { patientOf } from '@/state/selectors'
import { useAppState } from '@/state/store'
import s from './HypnosesFiche.module.css'

/** « 2 septembre 2026 » */
function dateLongue(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Les hypnoses écrites pour ce patient, et de quoi en refaire une.
 *
 * Elles sont pliées : une séance d'hypnose fait trois mille mots, et la fiche
 * n'est pas l'endroit où on la lit d'un bout à l'autre — c'est l'endroit où on
 * la retrouve, où on en réécrit une autrement, et où on efface celles qui
 * n'ont pas abouti.
 *
 * LA RÉÉCRITURE PART DE LA DERNIÈRE SÉANCE. Sans les formulations et la
 * synthèse qu'elle porte, on n'écrirait plus qu'à partir du dossier — et on
 * perdrait la matière la plus précieuse, les mots du patient. La fiche
 * charge donc ce brouillon avec le reste, et le dit quand il manque.
 */
export function HypnosesFiche() {
  const state = useAppState()
  const cabinet = useMaybeCabinet()
  const fiche = patientOf(state)
  const [ouverte, setOuverte] = useState('')
  const [intention, setIntention] = useState('')
  const [aSupprimer, setASupprimer] = useState('')
  const [notice, setNotice] = useState('')
  const { ecriture, enCours, ecrits, erreur, fini, ecrire, reinitialiser } = useEcritureHypnose()

  const hypnoses = fiche?.hypnoses ?? []
  if (!fiche || (hypnoses.length === 0 && !fiche.hypnoseActivee)) return null

  const prenom = fiche.name.split(' ')[0] ?? fiche.name
  const brouillon = fiche.dernierBrouillon
  const cle = state.sel

  async function supprimer(id: string) {
    setNotice('')
    const r = await cabinet?.supprimerHypnose(id)
    setASupprimer('')
    if (r && !r.ok) setNotice(r.message)
  }

  return (
    <Card className={s.card}>
      <div className={s.head}>
        <Title large as="h2">
          Hypnoses de {prenom}
        </Title>
        {hypnoses.length ? (
          <span className={s.compte}>
            {hypnoses.length} {hypnoses.length > 1 ? 'séances écrites' : 'séance écrite'}
          </span>
        ) : null}
      </div>

      {notice ? <Notice tone="warn">{notice}</Notice> : null}
      {erreur ? <Notice tone="warn">{erreur}</Notice> : null}

      {hypnoses.length === 0 && !ecriture && ecrits.length === 0 ? (
        <p className={s.vide}>
          L'hypnose est activée pour {prenom}. Elle s'écrira à sa prochaine séance — ou dès
          maintenant, à partir de la dernière.
        </p>
      ) : null}

      {/* Écrire, ou réécrire autrement. Une hypnose ratée ne se corrige pas :
          on en refait une, avec une autre intention. */}
      {!ecriture && ecrits.length === 0 ? (
        <div className={s.relance}>
          <label className={s.champ}>
            <span className={s.label}>Ce que vous voulez travailler (facultatif)</span>
            <input
              className={s.input}
              value={intention}
              onChange={(e) => setIntention(e.target.value)}
              placeholder="Une autre métaphore, un angle différent, une séance plus courte…"
              disabled={!brouillon}
            />
          </label>
          <Button
            variant={hypnoses.length ? 'secondary' : 'primary'}
            disabled={!brouillon || !cabinet?.reel}
            onClick={() => brouillon && void ecrire(cle, brouillon, intention)}
          >
            {hypnoses.length ? 'En écrire une autre' : 'Écrire une hypnose'}
          </Button>
        </div>
      ) : null}

      {!brouillon ? (
        <p className={s.hint}>
          Aucune séance analysée pour {prenom} : une hypnose se bâtit sur les formulations et la
          synthèse d'une séance. Captez-en une, et elle pourra s'écrire.
        </p>
      ) : null}

      {/* L'écriture en cours, annoncée dès le clic. */}
      {ecriture || ecrits.length > 0 ? (
        <div className={s.progression}>
          {enCours ? (
            <p className={s.encours}>
              <span className={s.point} aria-hidden />
              {enCours} en cours d'écriture… chaque mouvement demande une trentaine de secondes.
            </p>
          ) : null}
          <ol className={s.avancement}>
            {MOUVEMENTS_HYPNOSE.map((m, i) => {
              const ecrit = ecrits[i]
              return (
                <li key={m} className={ecrit ? s.fait : s.attente}>
                  <span className={s.puce}>{ecrit ? '✓' : i + 1}</span>
                  <span>{ecrit?.titre || NOM_MOUVEMENT[m]}</span>
                </li>
              )
            })}
          </ol>
          {fini ? (
            <div className={s.finiLigne}>
              <Notice tone="ok">Hypnose écrite et conservée.</Notice>
              <Button
                variant="ghost"
                onClick={() => {
                  reinitialiser()
                  setIntention('')
                }}
              >
                Fermer
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {hypnoses.length ? (
        <ul className={s.liste}>
          {hypnoses.map((h) => {
            const ouvert = ouverte === h.id
            const minutes = Math.round(
              h.mouvements.reduce((n, m) => n + m.texte.split(/\s+/).filter(Boolean).length, 0) / 100,
            )
            return (
              <li key={h.id} className={s.item}>
                <div className={s.ligne}>
                  <button
                    type="button"
                    className={s.entete}
                    onClick={() => setOuverte(ouvert ? '' : h.id)}
                    aria-expanded={ouvert}
                  >
                    <span className={s.titre}>{h.titre}</span>
                    <span className={s.meta}>
                      {dateLongue(h.createdAt)}
                      {h.complete
                        ? minutes > 0
                          ? ` · ≈ ${minutes} min de lecture`
                          : ''
                        : ` · interrompue, ${h.mouvements.length} mouvement${h.mouvements.length > 1 ? 's' : ''} sur 4`}
                    </span>
                  </button>

                  {/* Une hypnose interrompue ou en double n'a aucune valeur :
                      elle s'efface sans cérémonie. Une confirmation en un clic
                      suffit — ce n'est pas un dossier de santé, c'est un texte
                      qu'on peut réécrire. */}
                  {aSupprimer === h.id ? (
                    <span className={s.confirme}>
                      <button type="button" className={s.oui} onClick={() => void supprimer(h.id)}>
                        Supprimer
                      </button>
                      <button type="button" className={s.non} onClick={() => setASupprimer('')}>
                        Annuler
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={s.effacer}
                      onClick={() => setASupprimer(h.id)}
                      aria-label={`Supprimer l'hypnose « ${h.titre} »`}
                    >
                      Supprimer
                    </button>
                  )}
                </div>

                {ouvert ? (
                  <div className={s.corps}>
                    {h.intention ? (
                      <p className={s.intention}>
                        <Overline>Intention</Overline> {h.intention}
                      </p>
                    ) : null}
                    {h.mouvements.map((m) => (
                      <article key={m.mouvement} className={s.mouvement}>
                        <h3 className={s.mouvementTitre}>
                          {NOM_MOUVEMENT[m.mouvement]} · {m.titre}
                        </h3>
                        {m.texte
                          .split('\n')
                          .filter(Boolean)
                          .map((para, i) => (
                            <p key={i} className={s.para}>
                              {para}
                            </p>
                          ))}
                      </article>
                    ))}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </Card>
  )
}
