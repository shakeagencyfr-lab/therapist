import { useCallback, useEffect, useRef, useState } from 'react'
import { useMaybeCabinet } from '@/cabinet/context'
import type { ExerciceType, ProgrammeAvecParcours } from '@/lib/parcoursTypes'
import type { GestesParcoursTypes } from './parcoursTypes'

/**
 * Le parcours par défaut des programmes du cabinet (0059), pour l'écran des
 * programmes et la fiche.
 *
 *   demo          aucun cabinet réel (démonstration, banc de rendu) : rien ne
 *                 se lit, rien ne se règle, et l'écran le dit ;
 *   chargement    la lecture est partie ;
 *   pret          les programmes sont là — avec ou sans parcours ;
 *   echec         la lecture a échoué : ce n'est pas « aucun parcours » ;
 *   indisponible  la base n'a pas encore 0059.
 */
export type EtatParcoursTypes = 'demo' | 'chargement' | 'pret' | 'echec' | 'indisponible'

interface Resultat {
  ok: boolean
  message: string
}

export interface ParcoursTypesData {
  etat: EtatParcoursTypes
  /** Par libellé de programme. */
  programmes: Record<string, ProgrammeAvecParcours>
  recharger: () => Promise<void>
  regler: (programmeId: string, exercices: ExerciceType[]) => Promise<Resultat>
  appliquer: (
    programmeId: string,
    patient: { id: string; nom: string },
    exerciceIds: string[],
  ) => Promise<Resultat & { ajoutes?: number }>
}

/**
 * `actif` à faux, rien ne se lit : la fiche n'en a besoin qu'après avoir
 * changé de programme, pas à chaque ouverture.
 *
 * `catalogue` : les libellés du catalogue, mis bout à bout. Un programme
 * créé, renommé ou retiré change la clé, et l'on relit — sans quoi le
 * parcours d'un programme renommé se chercherait sous son ancien nom.
 */
export function useParcoursTypes(actif = true, catalogue = ''): ParcoursTypesData {
  const cabinet = useMaybeCabinet()
  const gestes: GestesParcoursTypes | null = cabinet?.reel ? (cabinet.parcoursTypes ?? null) : null
  const [etat, setEtat] = useState<EtatParcoursTypes>(gestes ? 'chargement' : 'demo')
  const [programmes, setProgrammes] = useState<Record<string, ProgrammeAvecParcours>>({})
  // Une lecture en retard ne remplace pas une lecture plus récente.
  const derniere = useRef(0)

  const recharger = useCallback(async () => {
    if (!gestes) {
      setEtat('demo')
      setProgrammes({})
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
    setProgrammes(lu)
    setEtat('pret')
  }, [gestes])

  useEffect(() => {
    if (!actif) return
    setEtat(gestes ? 'chargement' : 'demo')
    void recharger()
  }, [recharger, gestes, actif, catalogue])

  const regler = useCallback(
    async (programmeId: string, exercices: ExerciceType[]): Promise<Resultat> => {
      if (!gestes) return { ok: false, message: 'Le parcours se règle depuis votre cabinet.' }
      const r = await gestes.regler(programmeId, exercices)
      if (r.ok) await recharger()
      return r
    },
    [gestes, recharger],
  )

  const appliquer = useCallback(
    async (programmeId: string, patient: { id: string; nom: string }, exerciceIds: string[]) => {
      if (!gestes) return { ok: false, message: 'Les exercices s’ajoutent depuis votre cabinet.' }
      const r = await gestes.appliquer(programmeId, patient, exerciceIds)
      // Le parcours du patient a changé : la fiche le relit.
      if (r.ok && (r.ajoutes ?? 0) > 0) await cabinet?.recharger()
      return r
    },
    [gestes, cabinet],
  )

  return { etat, programmes, recharger, regler, appliquer }
}
