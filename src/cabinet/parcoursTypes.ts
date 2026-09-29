/**
 * Le parcours par défaut des programmes, lu, réglé et proposé à la demande
 * (0059).
 *
 * Hors du rechargement général, comme le dossier et les rappels
 * (src/cabinet/dossier.ts, src/cabinet/rappelsReguliers.ts) : seuls l'écran
 * des programmes et la fiche, au moment d'attribuer un programme, en ont
 * besoin — et `useCabinet` relit déjà beaucoup à chaque retour d'onglet.
 *
 * Régler et ajouter passent par deux fonctions de la base : la liste entière
 * se remplace d'un coup, et l'ajout au parcours d'un patient se fait dans une
 * seule transaction, rangé à la suite, sans doublon. La table n'a aucun droit
 * d'écriture pour le navigateur.
 */
import { supabase } from '@/lib/supabase'
import {
  messageRefusParcours,
  parcoursAEnvoyer,
  phraseAjout,
  programmesDepuisLignes,
  refusParcours,
  type ExerciceType,
  type LigneProgramme,
  type ProgrammeAvecParcours,
} from '@/lib/parcoursTypes'
import { plural } from '@/lib/format'

interface Resultat {
  ok: boolean
  message: string
}

/**
 * Ce que la lecture a donné, par libellé de programme.
 *
 * `null` : la lecture a échoué — ce n'est pas « aucun parcours ». Et
 * « indisponible » : la base n'a pas encore 0059, ce qu'aucun « réessayez »
 * ne réparera.
 */
export type LectureParcours = Record<string, ProgrammeAvecParcours> | 'indisponible' | null

export interface GestesParcoursTypes {
  lire: () => Promise<LectureParcours>
  regler: (programmeId: string, exercices: ExerciceType[]) => Promise<Resultat>
  /** Rend aussi le nombre réellement ajouté : la base ne double pas ce qu'il a déjà. */
  appliquer: (
    programmeId: string,
    patient: { id: string; nom: string },
    exerciceIds: string[],
  ) => Promise<Resultat & { ajoutes?: number }>
}

const COLONNES = 'id, label, exercices:exercices_du_programme (id, rang, titre, type_module, consigne)'

function tableAbsente(message: string | undefined): boolean {
  return /exercices_du_programme|schema cache|does not exist/i.test(message ?? '')
}

export function gestesParcoursTypes(cabinetId: string | null): GestesParcoursTypes {
  return {
    async lire() {
      const db = supabase()
      if (!db || !cabinetId) return null
      /* Les programmes du catalogue seulement : un programme retiré ne se
         propose plus, et son parcours ne se modifie plus (la base le refuse). */
      const { data, error } = await db
        .from('cabinet_programs')
        .select(COLONNES)
        .eq('cabinet_id', cabinetId)
        .is('archived_at', null)
      if (error) return tableAbsente(error.message) ? 'indisponible' : null
      return programmesDepuisLignes(data as unknown as LigneProgramme[])
    },

    async regler(programmeId, exercices) {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Le parcours se règle depuis votre cabinet.' }
      const refus = refusParcours(exercices)
      if (refus) return { ok: false, message: refus }
      const { data, error } = await db.rpc('cabinet_regler_parcours_type', {
        p_programme: programmeId,
        p_exercices: parcoursAEnvoyer(exercices),
      })
      if (error) return { ok: false, message: messageRefusParcours(error.message) }
      const n = typeof data === 'number' ? data : exercices.length
      return {
        ok: true,
        message:
          n === 0
            ? 'Parcours par défaut retiré : ce programme ne proposera plus rien à l’attribution.'
            : `Parcours enregistré : ${plural(n, 'exercice', 'exercices')}, proposés à chaque attribution du programme.`,
      }
    },

    async appliquer(programmeId, patient, exerciceIds) {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Les exercices s’ajoutent depuis votre cabinet.' }
      const choisis = [...new Set(exerciceIds)]
      if (!choisis.length) return { ok: false, message: 'Choisissez au moins un exercice à ajouter.' }
      const { data, error } = await db.rpc('cabinet_appliquer_parcours_type', {
        p_programme: programmeId,
        p_patient: patient.id,
        p_exercices: choisis,
      })
      if (error) return { ok: false, message: messageRefusParcours(error.message) }
      const ajoutes = typeof data === 'number' ? data : 0
      return { ok: true, ajoutes, message: phraseAjout(ajoutes, patient.nom) }
    },
  }
}
