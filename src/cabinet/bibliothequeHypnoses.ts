/**
 * La bibliothèque d'hypnoses du cabinet (0071), lue et écrite à la demande.
 *
 * Hors du rechargement général, comme le dossier, les rappels et les
 * parcours (src/cabinet/dossier.ts, src/cabinet/parcoursTypes.ts) : seul
 * l'onglet « Hypnoses » de l'atelier en a besoin — et la suppression d'une
 * fiche, pour compter ce qu'elle laisserait dans la bibliothèque. Trente
 * mille mots par hypnose n'ont rien à faire dans chaque retour d'onglet.
 *
 * La base borne tout au cabinet (RLS) ; le navigateur n'écrit que le titre,
 * l'intention, les mouvements et l'achèvement d'une ligne (droits de
 * colonne, 0071). Attribuer passe par `cabinet_attribuer_hypnose`, qui copie
 * la ligne sur chaque fiche dans une seule transaction.
 */
import { supabase } from '@/lib/supabase'
import {
  TITRE_EN_COURS,
  attributionsParLigne,
  lireLigne,
  messageRefusBibliotheque,
  phraseApresAttribution,
  type CopieAttribuee,
  type LigneBibliotheque,
} from '@/lib/bibliothequeHypnoses'
import type { HypnoseDeBibliotheque, HypnoseMouvement, PatientId } from '@/types/domain'

interface Resultat {
  ok: boolean
  message: string
}

/**
 * Ce que la lecture a donné. `null` : elle a échoué — ce n'est pas « aucune
 * hypnose ». « indisponible » : la base n'a pas encore 0071.
 */
export type LectureBibliotheque = HypnoseDeBibliotheque[] | 'indisponible' | null

export interface GestesBibliothequeHypnoses {
  lire: () => Promise<LectureBibliotheque>
  /** Ouvre une ligne d'atelier vide, avant d'écrire : rend son identifiant. */
  ouvrir: (intention: string, titre: string) => Promise<string | null>
  /** Verse les mouvements déjà écrits — la colonne entière, à chaque fois. */
  verser: (id: string, mouvements: HypnoseMouvement[]) => Promise<Resultat>
  /** Referme la ligne : ses quatre mouvements, son titre, entière. */
  achever: (id: string, titre: string, mouvements: HypnoseMouvement[]) => Promise<Resultat>
  renommer: (id: string, titre: string) => Promise<Resultat>
  supprimer: (id: string) => Promise<Resultat>
  attribuer: (id: string, titre: string, patientIds: PatientId[]) => Promise<Resultat & { copies?: number }>
  /** Combien de lignes sont nées des séances de ce patient ; null si on n'a pas pu le lire. */
  neesDe: (patientId: PatientId) => Promise<number | null>
  /** Retire de la bibliothèque les lignes nées des séances de ce patient. */
  retirerNeesDe: (patientId: PatientId) => Promise<Resultat>
}

const COLONNES = 'id, titre, intention, mouvements, origine, complete, cree_le, modifie_le, source_patient_id'

function tableAbsente(message: string | undefined): boolean {
  return /bibliotheque_hypnoses|bibliotheque_id|schema cache|does not exist/i.test(message ?? '')
}

export function gestesBibliothequeHypnoses(cabinetId: string | null): GestesBibliothequeHypnoses {
  return {
    async lire() {
      const db = supabase()
      if (!db || !cabinetId) return null
      const [lignes, copies] = await Promise.all([
        db.from('bibliotheque_hypnoses').select(COLONNES).eq('cabinet_id', cabinetId).order('cree_le', { ascending: false }),
        /* Les copies vivantes, pour « attribuée à N patients » : une copie
           partie avec la fiche de son patient ne compte plus. */
        db.from('hypnoses').select('bibliotheque_id, patient_id').not('bibliotheque_id', 'is', null),
      ])
      if (lignes.error) return tableAbsente(lignes.error.message) ? 'indisponible' : null
      if (copies.error) return tableAbsente(copies.error.message) ? 'indisponible' : null
      const par = attributionsParLigne((copies.data ?? []) as CopieAttribuee[])
      return ((lignes.data ?? []) as LigneBibliotheque[]).map((l) => lireLigne(l, par.get(l.id) ?? []))
    },

    async ouvrir(intention, titre) {
      const db = supabase()
      if (!db || !cabinetId) return null
      const { data, error } = await db
        .from('bibliotheque_hypnoses')
        .insert({ cabinet_id: cabinetId, titre: titre.trim() || TITRE_EN_COURS, intention: intention.trim() })
        .select('id')
        .maybeSingle<{ id: string }>()
      if (error || !data) return null
      return data.id
    },

    async verser(id, mouvements) {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db.from('bibliotheque_hypnoses').update({ mouvements }).eq('id', id)
      if (error) return { ok: false, message: "Ce mouvement n'a pas pu être conservé dans la bibliothèque." }
      return { ok: true, message: '' }
    },

    async achever(id, titre, mouvements) {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db
        .from('bibliotheque_hypnoses')
        .update({ mouvements, titre, complete: true })
        .eq('id', id)
      if (error) return { ok: false, message: "L'hypnose n'a pas pu être refermée dans la bibliothèque." }
      return { ok: true, message: '' }
    },

    async renommer(id, titre) {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const propre = titre.trim()
      if (!propre) return { ok: false, message: 'Une hypnose garde un titre : c’est par lui qu’on la retrouve.' }
      const { error } = await db.from('bibliotheque_hypnoses').update({ titre: propre.slice(0, 300) }).eq('id', id)
      if (error) return { ok: false, message: "Le titre n'a pas pu être enregistré." }
      return { ok: true, message: '' }
    },

    async supprimer(id) {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      // Les copies déjà attribuées restent sur les fiches : la clé passe à null.
      const { error } = await db.from('bibliotheque_hypnoses').delete().eq('id', id)
      if (error) return { ok: false, message: "L'hypnose n'a pas pu être retirée de la bibliothèque. Réessayez." }
      return { ok: true, message: '' }
    },

    async attribuer(id, titre, patientIds) {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Les hypnoses s’attribuent depuis votre cabinet.' }
      const choisis = [...new Set(patientIds)]
      if (!choisis.length) return { ok: false, message: 'Choisissez au moins un patient.' }
      const { data, error } = await db.rpc('cabinet_attribuer_hypnose', { p_bibliotheque: id, p_patients: choisis })
      if (error) return { ok: false, message: messageRefusBibliotheque(error.message) }
      const copies = Array.isArray(data) ? data.length : choisis.length
      return { ok: true, copies, message: phraseApresAttribution(titre, copies) }
    },

    async neesDe(patientId) {
      const db = supabase()
      if (!db || !cabinetId) return 0
      const { count, error } = await db
        .from('bibliotheque_hypnoses')
        .select('id', { count: 'exact', head: true })
        .eq('source_patient_id', patientId)
      if (error) return tableAbsente(error.message) ? 0 : null
      return count ?? 0
    },

    async retirerNeesDe(patientId) {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      const { error } = await db.from('bibliotheque_hypnoses').delete().eq('source_patient_id', patientId)
      if (error) {
        return {
          ok: false,
          message:
            "Les hypnoses nées de ses séances n'ont pas pu être retirées de la bibliothèque : rien n'a été supprimé. Réessayez.",
        }
      }
      return { ok: true, message: '' }
    },
  }
}
