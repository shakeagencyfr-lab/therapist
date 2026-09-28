import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui'
import s from './GesteAConfirmer.module.css'

/**
 * Un geste qu'on ne fait pas d'un seul clic.
 *
 * Retirer un domaine, un serveur d'envoi, une clé, déconnecter un compte de
 * paiement : chacun met hors service quelque chose que des patients utilisent,
 * et certains obligent ensuite à ressaisir une clé secrète qu'on n'a plus sous
 * la main. Ils partaient au premier clic, sur un bouton discret posé à côté
 * d'un autre.
 *
 * Le premier clic ouvre la confirmation ; elle NOMME la conséquence, dans les
 * mots de la personne — « Confirmer ? » seul ne protège de rien, on clique
 * par réflexe. Le second clic, sur un bouton de danger, fait le geste.
 * « Garder » referme sans rien faire.
 */
export function GesteAConfirmer({
  libelle,
  consequence,
  confirmer,
  enCours,
  libelleEnCours,
  disabled,
  onConfirmer,
}: {
  /** Le bouton de départ : « Retirer », « Déconnecter »… */
  libelle: string
  /** Ce qui cessera de marcher, dit en une ou deux phrases. */
  consequence: ReactNode
  /** Le bouton qui fait le geste : « Retirer ce domaine »… */
  confirmer: string
  enCours: boolean
  libelleEnCours: string
  disabled?: boolean
  onConfirmer: () => void
}) {
  const [ouvert, setOuvert] = useState(false)

  if (!ouvert && !enCours) {
    return (
      <Button variant="ghost" disabled={disabled} onClick={() => setOuvert(true)}>
        {libelle}
      </Button>
    )
  }

  return (
    <div className={s.boite} role="group" aria-label={confirmer}>
      <p className={s.consequence}>{consequence}</p>
      <div className={s.gestes}>
        <Button
          variant="danger"
          disabled={disabled || enCours}
          onClick={() => {
            onConfirmer()
            setOuvert(false)
          }}
        >
          {enCours ? libelleEnCours : confirmer}
        </Button>
        <Button variant="ghost" disabled={enCours} onClick={() => setOuvert(false)}>
          Garder
        </Button>
      </div>
    </div>
  )
}
