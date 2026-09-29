import { useCallback } from 'react'
import { useMaybeCabinet } from '@/cabinet/context'
import { etatDeReprise } from '@/state/selectors'
import { useStore } from '@/state/store'

/**
 * Reprendre un brouillon de séance gardé pour plus tard.
 *
 * Depuis la liste d'attente de l'onglet Séance comme depuis la fiche : la
 * séance est relue en base (elle a pu être envoyée ou effacée ailleurs
 * entre-temps), puis l'écran de séance s'ouvre sur son brouillon, avec les
 * choix qui avaient été faits dessus.
 */
export function useReprendreBrouillon(): (sessionId: string) => Promise<{ ok: boolean; message: string }> {
  const cabinet = useMaybeCabinet()
  const { set } = useStore()
  const charger = cabinet?.reel ? cabinet.chargerSeance : null
  return useCallback(
    async (sessionId: string) => {
      if (!charger) return { ok: false, message: 'En démonstration, aucun brouillon ne se garde.' }
      const o = await charger(sessionId)
      if (!o) {
        return {
          ok: false,
          message: "Ce brouillon n'a pas pu être rouvert : il a peut-être été envoyé ou effacé entre-temps.",
        }
      }
      set({ ...etatDeReprise(o, o.patientId), sel: o.patientId, openTask: null, mode: 'session' })
      return { ok: true, message: '' }
    },
    [charger, set],
  )
}
