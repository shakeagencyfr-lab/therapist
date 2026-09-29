import { useCallback, useEffect, useRef, useState } from 'react'
import { useMaybeCabinet } from '@/cabinet/context'
import { useRetour } from '@/lib/useRetour'
import type { RappelRegulier, SaisieRappel } from '@/lib/rappelsReguliers'
import type { GestesRappels } from './rappelsReguliers'

/**
 * Les rappels qui reviennent du cabinet (0055), pour l'écran des
 * notifications.
 *
 *   demo          aucun cabinet réel (démonstration, banc de rendu) : rien ne
 *                 se lit, rien ne se programme, et l'écran le dit ;
 *   chargement    la lecture est partie ;
 *   pret          la liste est là — vide ou non ;
 *   echec         la lecture a échoué : ce n'est pas « aucun rappel » ;
 *   indisponible  la base n'a pas encore 0055.
 */
export type EtatRappelsReguliers = 'demo' | 'chargement' | 'pret' | 'echec' | 'indisponible'

interface Resultat {
  ok: boolean
  message: string
}

export interface RappelsReguliersData {
  etat: EtatRappelsReguliers
  rappels: RappelRegulier[]
  recharger: () => Promise<void>
  programmer: (saisie: SaisieRappel) => Promise<Resultat>
  arreter: (rappelId: string) => Promise<Resultat>
}

export function useRappelsReguliers(): RappelsReguliersData {
  const cabinet = useMaybeCabinet()
  const gestes: GestesRappels | null = cabinet?.reel ? (cabinet.rappels ?? null) : null
  const [etat, setEtat] = useState<EtatRappelsReguliers>(gestes ? 'chargement' : 'demo')
  const [rappels, setRappels] = useState<RappelRegulier[]>([])
  // Une lecture en retard ne remplace pas une lecture plus récente.
  const derniere = useRef(0)

  const recharger = useCallback(async () => {
    if (!gestes) {
      setEtat('demo')
      setRappels([])
      return
    }
    const numero = ++derniere.current
    const lu = await gestes.lire()
    if (numero !== derniere.current) return
    if (lu === 'indisponible') {
      setEtat('indisponible')
      return
    }
    if (!lu) {
      // Illisible : on garde ce qu'on montrait, et l'on dit que ce n'est plus sûr.
      setEtat('echec')
      return
    }
    setRappels(lu)
    setEtat('pret')
  }, [gestes])

  useEffect(() => {
    setEtat(gestes ? 'chargement' : 'demo')
    void recharger()
  }, [recharger, gestes])

  // Un rappel est parti pendant qu'on regardait ailleurs : on relit au retour.
  useRetour(recharger)

  const programmer = useCallback(
    async (saisie: SaisieRappel): Promise<Resultat> => {
      if (!gestes) return { ok: false, message: 'Les rappels réguliers se programment depuis votre cabinet.' }
      const r = await gestes.programmer(saisie)
      if (r.ok) await recharger()
      return r
    },
    [gestes, recharger],
  )

  const arreter = useCallback(
    async (rappelId: string): Promise<Resultat> => {
      if (!gestes) return { ok: false, message: '' }
      const r = await gestes.arreter(rappelId)
      await recharger()
      return r
    },
    [gestes, recharger],
  )

  return { etat, rappels, recharger, programmer, arreter }
}
