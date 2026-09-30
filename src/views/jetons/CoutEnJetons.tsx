import { useJetons } from '@/cabinet/useJetons'
import { phraseDuDevis, type Devis } from '@/lib/jetonsIA'
import { useStore } from '@/state/store'
import s from './Jetons.module.css'

/**
 * Le chemin vers la recharge, posé là où les jetons manquent.
 *
 * Un changement de vue, pas un lien : la carte des jetons vit dans
 * Intégrations, et c'est elle qui sait acheter — ou dire à qui demander.
 */
export function VersLaRecharge() {
  const { set } = useStore()
  const jetons = useJetons()
  const paiement = jetons?.paiementPossible === true
  return (
    <>
      {paiement ? null : 'Demandez des jetons à votre revendeur. '}
      <button type="button" className={s.lien} onClick={() => set({ mode: 'integrations' })}>
        {paiement ? 'Recharger vos jetons' : 'Voir vos jetons'}
      </button>
    </>
  )
}

/**
 * Ce qu'une analyse va coûter, dit à côté du bouton qui la lance.
 *
 * « Cette analyse utilisera 12 jetons (il vous en reste 312). » Et quand le
 * solde ne suffit pas, le constat et le chemin de la recharge : le bouton,
 * lui, est fermé par l'écran qui le porte — le serveur refuserait de toute
 * façon, mais après que la praticienne a cliqué et attendu.
 *
 * Rien hors du mode jetons : l'écran garde ses textes d'avant.
 */
export function CoutEnJetons({
  devis,
  sujet = 'Cette analyse',
  className,
}: {
  devis: Devis | null
  /** Le sujet de la phrase : « Cette analyse », « Ce module », « Cette hypnose »… */
  sujet?: string
  className?: string
}) {
  if (!devis) return null
  return (
    <p className={[s.cout, devis.manque ? s.manque : '', className ?? ''].filter(Boolean).join(' ')} role="status">
      {phraseDuDevis(devis, sujet)}
      {devis.manque ? (
        <>
          {' '}
          <VersLaRecharge />
        </>
      ) : null}
    </p>
  )
}
