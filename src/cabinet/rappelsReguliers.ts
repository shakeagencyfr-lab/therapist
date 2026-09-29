/**
 * Les rappels qui reviennent, lus et programmés à la demande (0055).
 *
 * Hors du rechargement général, comme le dossier (src/cabinet/dossier.ts) :
 * seul l'écran des notifications les montre, et `useCabinet` relit déjà
 * beaucoup à chaque retour d'onglet.
 *
 * Programmer et arrêter passent par deux fonctions de la base : le rappel et
 * ses destinataires s'écrivent dans la même transaction, et la table n'a
 * aucun droit d'écriture pour le navigateur. Le texte du rappel ne va nulle
 * part ailleurs qu'en base : ni journal du serveur, ni trace d'audit.
 */
import { plural } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import {
  dateDite,
  heureDuChamp,
  libelleRecurrence,
  messageRefusRappel,
  phrasePremierEnvoi,
  rappelsDepuisLignes,
  type LigneRappel,
  type RappelRegulier,
  type SaisieRappel,
} from '@/lib/rappelsReguliers'

interface Resultat {
  ok: boolean
  message: string
}

/**
 * Ce que la lecture a donné.
 *
 * `null` : la lecture a échoué — ce n'est pas « aucun rappel ». Et
 * « indisponible » : la base n'a pas encore 0055, ce qu'aucun « réessayez »
 * ne réparera.
 */
export type LectureRappels = RappelRegulier[] | 'indisponible' | null

export interface GestesRappels {
  lire: () => Promise<LectureRappels>
  programmer: (saisie: SaisieRappel) => Promise<Resultat>
  arreter: (rappelId: string) => Promise<Resultat>
}

const COLONNES =
  'id, title, body, jour_semaine, heure, fin_le, created_at, annule_le, ' +
  'destinataires:rappels_recurrents_patients (patient_id, patient:patients (display_name, archived_at))'

function tableAbsente(message: string | undefined): boolean {
  return /rappels_recurrents|schema cache|does not exist/i.test(message ?? '')
}

export function gestesRappels(cabinetId: string | null): GestesRappels {
  return {
    async lire() {
      const db = supabase()
      if (!db || !cabinetId) return null
      /* La RLS borne déjà la lecture aux cabinets dont on est membre ; le
         filtre dit lequel on regarde, pour qui appartiendrait à deux. */
      const { data, error } = await db
        .from('rappels_recurrents')
        .select(COLONNES)
        .eq('cabinet_id', cabinetId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) return tableAbsente(error.message) ? 'indisponible' : null
      return rappelsDepuisLignes(data as unknown as LigneRappel[])
    },

    async programmer(s) {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Les rappels réguliers se programment depuis votre cabinet.' }
      const heure = heureDuChamp(s.heure)
      const jour = s.frequence === 'semaine' ? s.jourSemaine : null
      const { error } = await db.rpc('cabinet_programmer_rappel', {
        p_cabinet: cabinetId,
        p_titre: s.titre.trim(),
        p_texte: s.texte.trim(),
        p_jour_semaine: jour,
        p_heure: heure,
        p_fin: s.finLe,
        p_patients: [...new Set(s.patients)],
      })
      if (error) return { ok: false, message: messageRefusRappel(error.message) }
      const qui = plural(new Set(s.patients).size, 'personne', 'personnes')
      return {
        ok: true,
        message: `Rappel programmé : ${libelleRecurrence(jour, heure ?? s.heure).toLowerCase()}, pour ${qui}, jusqu'au ${dateDite(s.finLe)}. ${phrasePremierEnvoi(s)}`.trim(),
      }
    },

    async arreter(rappelId) {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { data, error } = await db.rpc('cabinet_arreter_rappel', { p_rappel: rappelId })
      if (error) return { ok: false, message: messageRefusRappel(error.message) }
      return data === true
        ? { ok: true, message: 'Rappel arrêté : il ne partira plus. Les mots déjà envoyés restent dans les espaces.' }
        : { ok: false, message: 'Ce rappel était déjà arrêté.' }
    },
  }
}
