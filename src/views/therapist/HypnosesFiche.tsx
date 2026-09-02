import { useState } from 'react'
import { Card, Overline, Title } from '@/components/ui'
import { NOM_MOUVEMENT } from '@/services/aiClient'
import { patientOf } from '@/state/selectors'
import { useAppState } from '@/state/store'
import s from './HypnosesFiche.module.css'

/** « 2 septembre 2026 » */
function dateLongue(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Les hypnoses écrites pour cette patiente.
 *
 * Elles sont pliées : une séance d'hypnose fait trois mille mots, et la fiche
 * n'est pas l'endroit où on la lit d'un bout à l'autre — c'est l'endroit où on
 * la retrouve. On la déplie le jour où on la relit à voix haute.
 *
 * Une hypnose interrompue en cours d'écriture s'affiche quand même, avec ce
 * qu'elle a : deux mouvements valent mieux que rien, et le dire vaut mieux
 * que servir un texte qui s'arrête au milieu sans prévenir.
 */
export function HypnosesFiche() {
  const state = useAppState()
  const fiche = patientOf(state)
  const [ouverte, setOuverte] = useState('')

  const hypnoses = fiche?.hypnoses ?? []
  if (!fiche || (hypnoses.length === 0 && !fiche.hypnoseActivee)) return null

  const prenom = fiche.name.split(' ')[0] ?? fiche.name

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

      {hypnoses.length === 0 ? (
        <p className={s.vide}>
          L'hypnose est activée pour {prenom} : la prochaine séance en produira une, écrite sur
          ses mots. Elle apparaîtra ici.
        </p>
      ) : (
        <ul className={s.liste}>
          {hypnoses.map((h) => {
            const ouvert = ouverte === h.id
            const minutes = Math.round(
              h.mouvements.reduce((n, m) => n + m.texte.split(/\s+/).filter(Boolean).length, 0) / 100,
            )
            return (
              <li key={h.id} className={s.item}>
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
                  <span className={s.chevron} aria-hidden>
                    {ouvert ? '−' : '+'}
                  </span>
                </button>

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
      )}
    </Card>
  )
}
