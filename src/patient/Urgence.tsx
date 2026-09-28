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
 */
export function Urgence() {
  return (
    <aside className={s.urgence} aria-label="En cas d'urgence">
      Cet espace n'est pas surveillé en temps réel. En cas de détresse :{' '}
      <a className={s.numero} href="tel:3114">
        3114
      </a>
      , numéro national de prévention du suicide, 24 h/24 ; urgence :{' '}
      <a className={s.numero} href="tel:15">
        15
      </a>{' '}
      ou{' '}
      <a className={s.numero} href="tel:112">
        112
      </a>
      .
    </aside>
  )
}
