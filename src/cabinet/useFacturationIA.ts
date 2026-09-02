/**
 * Comment ce cabinet paie son IA, pour les écrans qui doivent l'annoncer.
 *
 * L'écran de séance chiffre le coût d'une analyse avant de la lancer. Ce
 * chiffre n'a de sens qu'en mode « clé du cabinet » : quand le revendeur
 * fournit l'IA, la thérapeute ne paie pas des euros mais UN CRÉDIT, et
 * annoncer « 0,07 € » lui mentirait sur la nature de la dépense.
 *
 * La lecture est silencieuse : si le serveur ne répond pas, l'écran retombe
 * sur le mode « clé du cabinet », qui est le mode par défaut. Une séance ne
 * s'arrête pas parce qu'un compteur n'a pas pu être lu.
 */
import { useEffect, useState } from 'react'
import { lireCredits, type EtatCredits } from '@/services/credits'

export interface FacturationIA {
  mode: 'cle_cabinet' | 'credits'
  solde: number
  decouvert: number
}

const PAR_DEFAUT: FacturationIA = { mode: 'cle_cabinet', solde: 0, decouvert: 0 }

export function useFacturationIA(actif = true): FacturationIA {
  const [etat, setEtat] = useState<FacturationIA>(PAR_DEFAUT)

  useEffect(() => {
    if (!actif) return
    let vivant = true
    lireCredits()
      .then((lu: EtatCredits) => {
        if (vivant) setEtat({ mode: lu.mode, solde: lu.solde, decouvert: lu.decouvert })
      })
      .catch(() => {
        /* Silence volontaire : le mode par défaut reste affiché. */
      })
    return () => {
      vivant = false
    }
  }, [actif])

  return etat
}
