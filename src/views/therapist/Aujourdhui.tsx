import { useId } from 'react'
import { plural } from '@/lib/format'
import type { SeanceDuJour } from '@/lib/agenda'
import s from './Aujourdhui.module.css'

/**
 * Les séances du jour, en tête de la liste des patients (0059).
 *
 * La première question d'une journée de cabinet — qui vient, et à quelle
 * heure — ne se posait nulle part : la prochaine séance n'était qu'un texte.
 * Datée, elle se range ici, dans l'ordre de l'horloge ; un clic ouvre la
 * fiche. Une séance commencée reste, en retrait : on la relit souvent après.
 *
 * Vue pure : les séances viennent de src/lib/agenda.ts (`seancesDuJour`).
 */
export function VueAujourdhui({
  seances,
  selection,
  onChoisir,
}: {
  seances: SeanceDuJour[]
  /** La fiche ouverte, pour la marquer. */
  selection: string
  onChoisir: (patientId: string) => void
}) {
  const id = useId()
  const aVenir = seances.filter((x) => !x.passee).length
  return (
    <section className={s.jour} aria-labelledby={id}>
      <div className={s.tete}>
        <h2 className={s.titre} id={id}>
          Aujourd'hui
        </h2>
        {seances.length ? (
          <span className={s.compte}>
            {aVenir === seances.length
              ? plural(seances.length, 'séance', 'séances')
              : `${aVenir} à venir sur ${seances.length}`}
          </span>
        ) : null}
      </div>
      {seances.length === 0 ? (
        <p className={s.vide}>Aucune séance datée aujourd'hui.</p>
      ) : (
        <ul className={s.liste}>
          {seances.map((x) => {
            const on = x.id === selection
            return (
              <li key={x.id}>
                <button
                  type="button"
                  className={[s.ligne, on ? s.ligneOn : '', x.passee ? s.passee : ''].filter(Boolean).join(' ')}
                  aria-pressed={on}
                  aria-label={`${x.heure}, ${x.nom}${x.passee ? ', séance commencée' : ''} : ouvrir sa fiche`}
                  onClick={() => onChoisir(x.id)}
                >
                  <span className={s.heure}>{x.heure}</span>
                  <span className={s.nom}>{x.nom}</span>
                  {x.passee ? <span className={s.passeeMot} aria-hidden>commencée</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/**
 * Les deux réglages de la liste : l'ordre (arrivée ou prochaine séance) et
 * le filtre « sans prochaine séance ». Deux bascules, pas un menu : on les
 * voit, on sait ce qui est appliqué.
 */
export function ReglagesDeLaListe({
  parSeance,
  sansSeance,
  combienSansSeance,
  onParSeance,
  onSansSeance,
}: {
  parSeance: boolean
  sansSeance: boolean
  combienSansSeance: number
  onParSeance: (actif: boolean) => void
  onSansSeance: (actif: boolean) => void
}) {
  return (
    <div className={s.reglages} role="group" aria-label="Ordre et filtre de la liste des patients">
      <button
        type="button"
        className={parSeance ? `${s.bascule} ${s.basculeOn}` : s.bascule}
        aria-pressed={parSeance}
        onClick={() => onParSeance(!parSeance)}
      >
        Par prochaine séance
      </button>
      <button
        type="button"
        className={sansSeance ? `${s.bascule} ${s.basculeOn}` : s.bascule}
        aria-pressed={sansSeance}
        onClick={() => onSansSeance(!sansSeance)}
      >
        Sans prochaine séance ({combienSansSeance})
      </button>
    </div>
  )
}

/** Ce que dit une liste vidée par le filtre ou la recherche. */
export function ListeVide({ sansSeance, cherche }: { sansSeance: boolean; cherche: boolean }) {
  return (
    <p className={s.listeVide} role="status">
      {sansSeance && !cherche
        ? 'Toutes vos fiches ont une prochaine séance datée.'
        : 'Aucune fiche ne correspond.'}
    </p>
  )
}
