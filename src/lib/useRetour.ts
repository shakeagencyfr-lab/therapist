import { useEffect } from 'react'

/**
 * Recharger quand on revient sur l'onglet.
 *
 * Ces deux espaces se regardent : la thérapeute règle la question du soir
 * pendant que sa patiente a son application ouverte ; la patiente partage
 * une page de journal pendant que la fiche est affichée en face. Chargé une
 * fois au montage et jamais relu, chaque écran montrait alors l'état du
 * monde au moment où il a été ouvert — et l'autre côté avait l'air en panne.
 *
 * C'est exactement ce qui s'est produit : une page partagée à 17 h 47
 * n'apparaissait pas dans un onglet ouvert à 17 h 30, alors que la base, la
 * politique de lecture et la requête étaient toutes justes.
 *
 * Deux signaux, parce qu'aucun ne suffit seul : `visibilitychange` couvre le
 * téléphone qu'on déverrouille et l'onglet qu'on revient voir, `focus` couvre
 * le retour depuis une autre fenêtre sur un ordinateur. Le garde-fou de
 * fraîcheur évite de relire la base à chaque va-et-vient entre deux fenêtres.
 */
export function useRetour(recharger: () => void, secondes = 20): void {
  useEffect(() => {
    let dernier = Date.now()

    const reprendre = () => {
      if (document.visibilityState === 'hidden') return
      const maintenant = Date.now()
      if (maintenant - dernier < secondes * 1000) return
      dernier = maintenant
      recharger()
    }

    document.addEventListener('visibilitychange', reprendre)
    window.addEventListener('focus', reprendre)
    return () => {
      document.removeEventListener('visibilitychange', reprendre)
      window.removeEventListener('focus', reprendre)
    }
  }, [recharger, secondes])
}
