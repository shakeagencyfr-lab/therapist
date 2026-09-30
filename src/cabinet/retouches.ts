/**
 * Les avis sur l'IA et les préférences retenues (0066), à la demande.
 *
 * Hors du rechargement général, comme le dossier et les parcours types
 * (src/cabinet/dossier.ts, src/cabinet/parcoursTypes.ts) : un avis s'écrit
 * au clic d'un pouce, une préférence après une retouche réussie, et la liste
 * ne se lit que dans Intégrations. Rien de cela n'a à attendre le retour sur
 * l'onglet.
 *
 * Trois fonctions de la base écrivent — le navigateur n'a aucun droit
 * d'écriture sur ces tables ; la lecture passe sous la RLS du cabinet.
 */
import { supabase } from '@/lib/supabase'
import { estCibleRetouche, nomDansLaConsigne, type CibleRetouche, type CibleVote, type Vote } from '@/lib/retouche'

interface Resultat {
  ok: boolean
  message: string
}

/** Une préférence retenue, telle que la liste d'Intégrations la montre. */
export interface PreferenceIA {
  id: string
  cible: CibleRetouche
  consigne: string
  /** ISO : le jour où elle a été retenue. */
  creeLe: string
}

/**
 * `null` : la lecture a échoué — ce n'est pas « aucune préférence ». Et
 * « indisponible » : la base n'a pas encore 0066, ce qu'aucun « réessayez »
 * ne réparera.
 */
export type LecturePreferences = PreferenceIA[] | 'indisponible' | null

export interface GestesRetouches {
  /** Un avis sur un type de texte. Un échec ne se dit pas : c'est un avis, pas un geste de soin. */
  voter: (cible: CibleVote, vote: Vote) => Promise<Resultat>
  /**
   * Retient la consigne que la praticienne a relue, pour les prochaines
   * générations du même type — chez tous les patients du cabinet.
   * `patient` : le nom du patient dont le texte parlait, quand l'écran le
   * connaît ; une consigne qui le contient ne part pas.
   */
  retenir: (cible: CibleRetouche, consigne: string, patient?: string | null) => Promise<Resultat>
  lire: () => Promise<LecturePreferences>
  oublier: (id: string) => Promise<Resultat>
}

function tableAbsente(message: string | undefined): boolean {
  return /preferences_ia|schema cache|does not exist|cabinet_(voter_ia|retenir_preference|oublier_preference)/i.test(
    message ?? '',
  )
}

/**
 * Ce que la base refuse, dit à l'écran. Ses propres phrases sont déjà en
 * français (« Une préférence tient en 400 caractères au plus… ») ; le reste
 * — réseau, base sans 0066 — se dit sans jargon.
 */
export function messageRefusRetouche(message: string | undefined, repli: string): string {
  if (!message) return repli
  if (tableAbsente(message)) return "Les préférences de l'IA ne sont pas encore disponibles sur ce serveur."
  // Les messages de la base écrits par 0066 : on les garde tels quels.
  if (/préférence|avis|pouce|cabinet n'est pas le vôtre|ne se note pas/i.test(message)) return message
  return repli
}

interface LignePreference {
  id: string
  cible: string
  consigne: string
  cree_le: string
}

export function gestesRetouches(cabinetId: string | null): GestesRetouches {
  return {
    async voter(cible, vote) {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: '' }
      try {
        const { error } = await db.rpc('cabinet_voter_ia', { p_cabinet: cabinetId, p_cible: cible, p_vote: vote })
        return error ? { ok: false, message: messageRefusRetouche(error.message, '') } : { ok: true, message: '' }
      } catch {
        // L'écran n'attend pas l'avis : une panne ne doit pas remonter en erreur non traitée.
        return { ok: false, message: '' }
      }
    },

    async retenir(cible, texte, patient) {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Les préférences se retiennent depuis votre cabinet.' }
      /* RIEN NE SE COUPE. La fenêtre a déjà compté les caractères ; une
         consigne trop longue qui passerait quand même est refusée par la
         base, et sa phrase se dit — la tronquer ici effaçait en silence ce
         qu'elle disait en dernier. */
      const consigne = texte.trim()
      if (!consigne) return { ok: false, message: 'Une préférence vide ne se retient pas.' }
      // La base ne connaît pas le patient : ce contrôle-là ne se fait qu'ici.
      const nom = nomDansLaConsigne(consigne, patient)
      if (nom) {
        return {
          ok: false,
          message: `Préférence non retenue : « ${nom} » est le nom de ce patient, et elle s'appliquerait à tous. La retouche, elle, est faite.`,
        }
      }
      const { error } = await db.rpc('cabinet_retenir_preference', {
        p_cabinet: cabinetId,
        p_cible: cible,
        p_consigne: consigne,
      })
      if (error) {
        // La phrase de la base (« …raccourcissez-la »), quand elle en a une.
        const dit = messageRefusRetouche(error.message, '')
        return {
          ok: false,
          message: dit
            ? `${dit} La retouche, elle, est faite.`
            : "La préférence n'a pas pu être retenue. La retouche, elle, est faite.",
        }
      }
      return { ok: true, message: 'Préférence retenue pour les prochaines générations.' }
    },

    async lire() {
      const db = supabase()
      if (!db || !cabinetId) return null
      const { data, error } = await db
        .from('preferences_ia')
        .select('id, cible, consigne, cree_le')
        .eq('cabinet_id', cabinetId)
        .eq('actif', true)
        .order('cree_le', { ascending: false })
      if (error) return tableAbsente(error.message) ? 'indisponible' : null
      return ((data ?? []) as LignePreference[])
        .filter((l): l is LignePreference & { cible: CibleRetouche } => estCibleRetouche(l.cible))
        .map((l) => ({ id: l.id, cible: l.cible, consigne: l.consigne, creeLe: l.cree_le }))
    },

    async oublier(id) {
      const db = supabase()
      if (!db || !cabinetId) return { ok: false, message: 'Les préférences se règlent depuis votre cabinet.' }
      const { error } = await db.rpc('cabinet_oublier_preference', { p_id: id })
      if (error) return { ok: false, message: messageRefusRetouche(error.message, "La préférence n'a pas pu être oubliée. Réessayez.") }
      return { ok: true, message: "Préférence oubliée : l'IA ne la relira plus." }
    },
  }
}
