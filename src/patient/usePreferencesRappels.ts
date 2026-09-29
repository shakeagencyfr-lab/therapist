import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { preferencesDepuisLigne, type PreferencesRappels } from '@/lib/rappelsReguliers'

/**
 * Ses réglages de rappel (0055) : la discrétion sur l'écran verrouillé, le
 * rappel du soir.
 *
 * Lus et écrits par deux fonctions de la base, et par elles seules : la
 * table n'a aucun droit direct, et le cabinet n'y a pas accès. C'est SON
 * réglage — ni sa thérapeute ni personne d'autre ne sait qui masque ses
 * rappels, ni à quelle heure elle note sa soirée.
 *
 *   chargement    la lecture est partie ;
 *   pret          les réglages sont là ;
 *   echec         la lecture a échoué : l'écran le dit, et ne montre pas de
 *                 réglages supposés — « masqué » affiché sur la foi d'une
 *                 lecture ratée serait un mensonge rassurant ;
 *   indisponible  la base n'a pas encore ces réglages (0055 non passée).
 */
export type EtatPreferences = 'chargement' | 'pret' | 'echec' | 'indisponible'

export interface ChangementRappels {
  masquerContenu?: boolean
  soirActif?: boolean
  soirHeure?: string
}

export interface Resultat {
  ok: boolean
  message: string
}

function baseSansReglages(message: string | undefined): boolean {
  return /patient_preferences_rappels|patient_regler_rappels|schema cache|does not exist/i.test(message ?? '')
}

export function usePreferencesRappels(patientId: string) {
  const [etat, setEtat] = useState<EtatPreferences>('chargement')
  const [preferences, setPreferences] = useState<PreferencesRappels | null>(null)
  const [enCours, setEnCours] = useState(false)
  /* Une réponse en retard ne remplace pas une réponse plus récente : deux
     interrupteurs touchés coup sur coup ne doivent pas se contredire à
     l'écran. */
  const derniere = useRef(0)

  const lire = useCallback(async () => {
    const db = supabase()
    if (!db || !patientId) {
      setEtat('indisponible')
      return
    }
    const numero = ++derniere.current
    const { data, error } = await db.rpc('patient_preferences_rappels', { p_patient: patientId })
    if (numero !== derniere.current) return
    if (error) {
      setEtat(baseSansReglages(error.message) ? 'indisponible' : 'echec')
      return
    }
    const lu = preferencesDepuisLigne(data)
    setPreferences(lu)
    setEtat(lu ? 'pret' : 'echec')
  }, [patientId])

  useEffect(() => {
    void lire()
  }, [lire])

  /**
   * Change un réglage. L'écran suit la RÉPONSE de la base, pas le geste :
   * c'est elle qui décide de ce qui s'affichera sur l'écran verrouillé.
   */
  const regler = useCallback(
    async (changement: ChangementRappels): Promise<Resultat> => {
      const db = supabase()
      if (!db || !patientId) return { ok: false, message: "L'espace n'est pas relié à sa base." }
      setEnCours(true)
      const numero = ++derniere.current
      const { data, error } = await db.rpc('patient_regler_rappels', {
        p_patient: patientId,
        p_masquer_contenu: changement.masquerContenu ?? null,
        p_soir_actif: changement.soirActif ?? null,
        p_soir_heure: changement.soirHeure ?? null,
      })
      setEnCours(false)
      const lu = error ? null : preferencesDepuisLigne(data)
      if (!lu) {
        if (error && /Heure illisible/.test(error.message)) {
          return { ok: false, message: 'Heure illisible : choisissez une heure et des minutes.' }
        }
        return {
          ok: false,
          message: baseSansReglages(error?.message)
            ? "Ces réglages ne sont pas encore disponibles sur votre espace."
            : "Le réglage n'a pas pu être enregistré. Réessayez dans un instant.",
        }
      }
      if (numero === derniere.current) {
        setPreferences(lu)
        setEtat('pret')
      }
      return { ok: true, message: '' }
    },
    [patientId],
  )

  return { etat, preferences, enCours, regler, relire: lire }
}
