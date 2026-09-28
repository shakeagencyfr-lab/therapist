/**
 * Le dossier d'une fiche, lu et écrit à la demande (migration 0053).
 *
 * POURQUOI À LA DEMANDE, ET PAS AVEC LE RESTE DU CABINET. `useCabinet` relit
 * tout le cabinet à chaque retour sur l'onglet ; y ajouter l'historique de
 * toutes les séances, les anamnèses et les notes de toutes les fiches ferait
 * voyager le plus sensible du cabinet pour afficher… la liste des patients.
 * Ce qui se lit fiche par fiche se charge quand on ouvre la fiche, sur le
 * volet qui le montre.
 *
 * Aucune requête ne nomme un cabinet pour se borner : la RLS le fait. Et
 * aucune ne demande la transcription (COLONNES_SEANCE, src/lib/dossier.ts).
 */
import { supabase } from '@/lib/supabase'
import {
  COLONNES_SEANCE,
  anamneseDepuisLigne,
  anamneseVersLigne,
  notesDepuisLignes,
  refusAnamnese,
  seancesDuDossier,
  type Anamnese,
  type LigneAnamnese,
  type LigneNote,
  type LigneSeance,
  type NoteDatee,
  type SeanceDuDossier,
} from '@/lib/dossier'
import {
  estMention,
  identiteProposee,
  manquesIdentite,
  noteDepuisLigne,
  refusEmission,
  type IdentiteFacturation,
  type LigneNoteHonoraires,
  type MentionTva,
  type MentionsVitrine,
  type NoteHonoraires,
  type SourceIdentite,
} from '@/lib/honoraires'
import type { PatientId } from '@/types/domain'

interface Resultat {
  ok: boolean
  message: string
}

/**
 * Ce qui a été lu du dossier d'une fiche.
 *
 * `null` N'EST PAS « VIDE ». Une partie qui n'a pas pu être lue vaut `null`,
 * et l'écran le dit ; une liste vide dit qu'il n'y a rien. C'est la règle de
 * `useCabinet` (« ce qui n'a pas été lu n'est pas vide »), tenue ici aussi :
 * tant que 0053 n'est pas appliquée, les séances se lisent déjà, et l'écran
 * ne présente pas une anamnèse illisible comme une anamnèse vierge.
 */
export interface DossierLu {
  seances: SeanceDuDossier[] | null
  /** Les séances ouvertes sur lesquelles rien n'a été pris : comptées, pas listées. */
  sansRien: number
  anamnese: Anamnese | null
  anamneseModifieeLe: string | null
  notes: NoteDatee[] | null
  honoraires: NoteHonoraires[] | null
}

/** Une demande de note d'honoraires, telle que l'écran la prépare. */
export interface DemandeNote {
  patientId: PatientId
  /** La séance envoyée qu'elle facture ; nulle pour une séance non captée. */
  sessionId: string | null
  /** « AAAA-MM-JJ » ; nulle pour reprendre la date de la séance. */
  date: string | null
  prestation: string
  montantCents: number
  mentionTva: MentionTva | null
}

export interface IdentiteLue {
  identite: IdentiteFacturation
  source: SourceIdentite
}

export interface GestesDossier {
  lire: (patientId: PatientId) => Promise<DossierLu | null>
  enregistrerAnamnese: (patientId: PatientId, a: Anamnese) => Promise<Resultat>
  ajouterNote: (patientId: PatientId, le: string, texte: string) => Promise<Resultat>
  modifierNote: (noteId: string, le: string, texte: string) => Promise<Resultat>
  supprimerNote: (noteId: string) => Promise<Resultat>
  lireIdentite: () => Promise<IdentiteLue | null>
  enregistrerIdentite: (i: IdentiteFacturation) => Promise<Resultat>
  emettreNote: (d: DemandeNote) => Promise<Resultat & { note?: NoteHonoraires }>
  annulerNote: (noteId: string) => Promise<Resultat & { note?: NoteHonoraires }>
  /** Inscrit l'export au journal d'accès, sans son contenu. À appeler AVANT de fabriquer le PDF. */
  tracerExport: (patientId: PatientId) => Promise<Resultat>
}

const HORS_CABINET: Resultat = { ok: false, message: 'Connectez-vous à votre cabinet.' }

/** Le compte connecté : de quoi dire « vous » plutôt que son propre nom. */
async function moi(): Promise<string | null> {
  const db = supabase()
  if (!db) return null
  const { data } = await db.auth.getSession()
  return data.session?.user.id ?? null
}

export function gestesDossier(cabinetId: string | null): GestesDossier {
  const pret = () => {
    const db = supabase()
    return db && cabinetId ? db : null
  }

  return {
    async lire(patientId) {
      const db = pret()
      if (!db) return null
      const [seances, anamnese, notes, honoraires, membres, compte] = await Promise.all([
        db
          .from('therapy_sessions')
          .select(COLONNES_SEANCE)
          .eq('patient_id', patientId)
          .order('occurred_at', { ascending: false })
          .limit(200),
        db
          .from('dossier_anamneses')
          .select('motif, antecedents, contre_indications, traitements, modifiee_le')
          .eq('patient_id', patientId)
          .maybeSingle<LigneAnamnese>(),
        db
          .from('dossier_notes')
          .select('id, le, texte, auteur, creee_le, modifiee_le')
          .eq('patient_id', patientId)
          .order('le', { ascending: false }),
        db.from('notes_honoraires').select('*').eq('patient_id', patientId).order('numero', { ascending: false }),
        db.from('cabinet_members').select('user_id, display_name').eq('cabinet_id', cabinetId as string),
        moi(),
      ])
      const noms = new Map(
        ((membres.data ?? []) as Array<{ user_id: string; display_name: string | null }>)
          .filter((m) => m.display_name)
          .map((m) => [m.user_id, m.display_name as string]),
      )
      const lues = seances.error ? null : seancesDuDossier((seances.data ?? []) as unknown as LigneSeance[])
      return {
        seances: lues?.seances ?? null,
        sansRien: lues?.sansRien ?? 0,
        anamnese: anamnese.error ? null : anamneseDepuisLigne(anamnese.data),
        anamneseModifieeLe: anamnese.data?.modifiee_le ?? null,
        notes: notes.error ? null : notesDepuisLignes((notes.data ?? []) as LigneNote[], compte, noms),
        honoraires: honoraires.error
          ? null
          : ((honoraires.data ?? []) as LigneNoteHonoraires[]).map(noteDepuisLigne),
      }
    },

    async enregistrerAnamnese(patientId, a) {
      const db = pret()
      if (!db) return HORS_CABINET
      const refus = refusAnamnese(a)
      if (refus) return { ok: false, message: refus }
      /* Le cabinet est reposé par la base d'après la fiche (0053, rangement) :
         celui qu'on envoie ne sert qu'à satisfaire la colonne. */
      const { error } = await db
        .from('dossier_anamneses')
        .upsert({ patient_id: patientId, cabinet_id: cabinetId, ...anamneseVersLigne(a) }, { onConflict: 'patient_id' })
      if (error) return { ok: false, message: "L'anamnèse n'a pas pu être enregistrée. Votre saisie est toujours là : réessayez." }
      return { ok: true, message: 'Anamnèse enregistrée.' }
    },

    async ajouterNote(patientId, le, texte) {
      const db = pret()
      if (!db) return HORS_CABINET
      const { error } = await db
        .from('dossier_notes')
        .insert({ patient_id: patientId, cabinet_id: cabinetId, le, texte: texte.trim() })
      if (error) return { ok: false, message: "La note n'a pas pu être enregistrée. Votre saisie est toujours là : réessayez." }
      return { ok: true, message: 'Note ajoutée.' }
    },

    async modifierNote(noteId, le, texte) {
      const db = pret()
      if (!db) return HORS_CABINET
      const { data, error } = await db
        .from('dossier_notes')
        .update({ le, texte: texte.trim() })
        .eq('id', noteId)
        .select('id')
      if (error) return { ok: false, message: "La note n'a pas pu être modifiée. Réessayez." }
      if (!data?.length) return { ok: false, message: "Cette note n'existe plus." }
      return { ok: true, message: 'Note modifiée.' }
    },

    async supprimerNote(noteId) {
      const db = pret()
      if (!db) return HORS_CABINET
      const { data, error } = await db.from('dossier_notes').delete().eq('id', noteId).select('id')
      if (error) return { ok: false, message: "La note n'a pas pu être supprimée. Réessayez." }
      if (!data?.length) return { ok: false, message: "Cette note n'existe plus." }
      return { ok: true, message: 'Note supprimée.' }
    },

    async lireIdentite() {
      const db = pret()
      if (!db) return null
      const compte = await moi()
      const [facturation, vitrine, membre] = await Promise.all([
        db
          .from('cabinet_facturation')
          .select('praticien, adresse, numero_pro, mention_tva')
          .eq('cabinet_id', cabinetId as string)
          .maybeSingle<{ praticien: string; adresse: string; numero_pro: string; mention_tva: string | null }>(),
        db
          .from('cabinet_sites')
          .select('responsable, adresse, numero_pro')
          .eq('cabinet_id', cabinetId as string)
          .maybeSingle<MentionsVitrine>(),
        compte
          ? db
              .from('cabinet_members')
              .select('display_name')
              .eq('cabinet_id', cabinetId as string)
              .eq('user_id', compte)
              .maybeSingle<{ display_name: string | null }>()
          : Promise.resolve({ data: null, error: null }),
      ])
      /* L'identité enregistrée est la seule qui compte : sans elle lue, on ne
         propose rien — pré-remplir depuis la vitrine par-dessus une identité
         qu'on n'a simplement pas pu lire l'écraserait à l'enregistrement. */
      if (facturation.error) return null
      const enregistree: IdentiteFacturation | null = facturation.data
        ? {
            praticien: facturation.data.praticien,
            adresse: facturation.data.adresse,
            numeroPro: facturation.data.numero_pro,
            mentionTva: estMention(facturation.data.mention_tva) ? facturation.data.mention_tva : null,
          }
        : null
      return identiteProposee(enregistree, vitrine.error ? null : vitrine.data, membre.data?.display_name ?? '')
    },

    async enregistrerIdentite(i) {
      const db = pret()
      if (!db) return HORS_CABINET
      const manque = manquesIdentite(i)
      if (manque.length) return { ok: false, message: `Il manque ${manque.join(', ')}.` }
      const { error } = await db.from('cabinet_facturation').upsert(
        {
          cabinet_id: cabinetId,
          praticien: i.praticien.trim(),
          adresse: i.adresse.trim(),
          numero_pro: i.numeroPro.trim(),
          mention_tva: i.mentionTva,
        },
        { onConflict: 'cabinet_id' },
      )
      if (error) {
        return {
          ok: false,
          message: /check/i.test(error.message)
            ? 'Une coordonnée est trop longue : nom 120 caractères, adresse 300, numéro 60.'
            : "Vos coordonnées n'ont pas pu être enregistrées. Réessayez.",
        }
      }
      return { ok: true, message: 'Coordonnées enregistrées : elles figureront sur vos prochaines notes.' }
    },

    async emettreNote(d) {
      const db = pret()
      if (!db) return HORS_CABINET
      const { data, error } = await db.rpc('cabinet_emettre_note_honoraires', {
        p_patient: d.patientId,
        p_session: d.sessionId,
        p_date: d.date,
        p_prestation: d.prestation.trim(),
        p_montant_cents: d.montantCents,
        p_mention_tva: d.mentionTva,
      })
      if (error || !data) return { ok: false, message: refusEmission(error ?? {}) }
      const note = noteDepuisLigne(data as LigneNoteHonoraires)
      return { ok: true, message: '', note }
    },

    async annulerNote(noteId) {
      const db = pret()
      if (!db) return HORS_CABINET
      const { data, error } = await db.rpc('cabinet_annuler_note_honoraires', { p_note: noteId })
      if (error || !data) {
        return {
          ok: false,
          message: error?.code === 'P0002' ? error.message : "La note n'a pas pu être annulée. Réessayez.",
        }
      }
      return { ok: true, message: '', note: noteDepuisLigne(data as LigneNoteHonoraires) }
    },

    async tracerExport(patientId) {
      const db = pret()
      if (!db) return HORS_CABINET
      const { error } = await db.rpc('cabinet_tracer_export', { p_patient: patientId })
      if (error) {
        return {
          ok: false,
          message:
            "L'export n'a pas pu être inscrit au journal d'accès : il n'a pas été fabriqué. Réessayez dans un instant.",
        }
      }
      return { ok: true, message: '' }
    },
  }
}
