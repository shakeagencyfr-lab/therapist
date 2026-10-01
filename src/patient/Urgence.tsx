import s from './Urgence.module.css'

/**
 * Où appeler en cas de détresse.
 *
 * CET ESPACE N'EST PAS SURVEILLÉ, ET IL FAUT LE DIRE. On y écrit un mot à sa
 * thérapeute un soir difficile, on y note une soirée à 0 : rien de cela
 * n'est lu dans l'heure, et quelqu'un en danger ne doit pas attendre une
 * réponse qui viendra au mieux le lendemain. La mention est discrète — elle
 * n'a pas à peser sur chaque visite — mais elle est en bas de chaque écran,
 * et les numéros s'appellent d'un doigt.
 *
 * Deux lignes au plus sur un téléphone : trois, en gras, faisaient du pied
 * de page la chose la plus visible de l'écran. Ce que « 3114 » veut dire est
 * lu en entier aux lecteurs d'écran.
 */
export function Urgence() {
  return (
    <aside className={s.urgence} aria-label="En cas d'urgence">
      Espace non surveillé en temps réel.{' '}
      <span className={s.numeros}>
        Détresse :{' '}
        <a className={s.numero} href="tel:3114" aria-label="3114, numéro national de prévention du suicide, 24 heures sur 24">
          3114
        </a>{' '}
        <span aria-hidden="true">·</span> Urgence :{' '}
        <a className={s.numero} href="tel:15">
          15
        </a>{' '}
        ou{' '}
        <a className={s.numero} href="tel:112">
          112
        </a>
      </span>
    </aside>
  )
}
