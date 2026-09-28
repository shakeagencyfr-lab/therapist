import { useCallback, useEffect, useRef, useState } from 'react'
import { useMaybeCabinet } from '@/cabinet/context'
import { useRetour } from '@/lib/useRetour'
import type { DossierLu, GestesDossier } from './dossier'
import type { PatientId } from '@/types/domain'

/**
 * Le dossier de la fiche ouverte : séances, anamnèse, notes, honoraires.
 *
 * - `demo` : aucun cabinet réel (démonstration, banc de rendu). Rien ne se
 *   lit, et l'écran le dit plutôt que de montrer un historique inventé.
 * - `chargement`, `pret`, `echec` : la lecture, dans l'ordre.
 *
 * UNE RÉPONSE EN RETARD NE S'AFFICHE PAS SUR LA MAUVAISE FICHE. Passer de
 * Nadia à Camille pendant que les séances de Nadia arrivent afficherait
 * celles de Nadia sous le nom de Camille : chaque lecture porte un numéro,
 * et seule la dernière est retenue.
 */
export type EtatDossier = 'demo' | 'chargement' | 'pret' | 'echec'

export interface DossierFiche {
  etat: EtatDossier
  dossier: DossierLu | null
  gestes: GestesDossier | null
  recharger: () => Promise<void>
}

export function useDossierFiche(patientId: PatientId): DossierFiche {
  const cabinet = useMaybeCabinet()
  const reel = Boolean(cabinet?.reel)
  const gestes = reel ? (cabinet?.dossier ?? null) : null
  const [etat, setEtat] = useState<EtatDossier>(reel ? 'chargement' : 'demo')
  const [dossier, setDossier] = useState<DossierLu | null>(null)
  const derniere = useRef(0)

  const recharger = useCallback(async () => {
    if (!gestes || !patientId) {
      setEtat('demo')
      setDossier(null)
      return
    }
    const numero = ++derniere.current
    const lu = await gestes.lire(patientId)
    if (numero !== derniere.current) return
    setDossier(lu)
    setEtat(lu ? 'pret' : 'echec')
  }, [gestes, patientId])

  useEffect(() => {
    // Une autre fiche : on repart de rien, sans montrer la précédente.
    setDossier(null)
    setEtat(gestes && patientId ? 'chargement' : 'demo')
    void recharger()
  }, [recharger, gestes, patientId])

  // La séance vient d'être envoyée depuis un autre onglet : on relit au retour.
  useRetour(recharger)

  return { etat, dossier, gestes, recharger }
}
