/**
 * Le fil entre un patient et son cabinet : le mot lu, le mot répondu (0054).
 *
 * Ce qui se raisonne sans navigateur ni base, partagé par la fiche de la
 * thérapeute (journal partagé, liste des patients) et l'espace du patient
 * (son journal, les mots de son cabinet).
 *
 * UNE PAGE PARTAGÉE EST UN MOT. Le « mot pour votre thérapeute » est une page
 * du journal partagée d'emblée (src/patient/MotAuTherapeute.tsx) ; une page
 * que le patient décide de montrer est adressée de la même façon. Les deux
 * se lisent, et se répondent, pareil.
 */
import { plural } from '@/lib/format'
import type { AppState } from '@/state/state'
import type { PatientId, ReponseDuCabinet } from '@/types/domain'

/** La longueur que la base accepte (cabinet_repondre_a_la_page). */
export const REPONSE_MAX = 2000

/**
 * « 3 septembre à 18 h 05 » — l'heure de l'appareil qui lit.
 *
 * L'heure est dite comme le reste du produit la dit (« Ce soir, 20 h ») :
 * « 18:05 » se lit, « 18 h 05 » se dit.
 */
export function momentDit(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const jour = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  const h = d.getHours()
  const m = d.getMinutes()
  return `${jour} à ${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`
}

/** Sous la page, chez le patient : ce que sa thérapeute en a fait. */
export function phraseLu(iso: string | null | undefined): string {
  if (!iso) return ''
  const quand = momentDit(iso)
  return quand ? `Lu par votre thérapeute le ${quand}` : ''
}

/** « 1 réponse », « 2 réponses · 1 nouvelle » : ce qui attend sous la page repliée. */
export function filDesReponses(reponses: ReponseDuCabinet[]): string {
  if (!reponses.length) return ''
  const nouvelles = reponses.filter((r) => !r.lueLe).length
  const combien = plural(reponses.length, 'réponse', 'réponses')
  return nouvelles ? `${combien} · ${plural(nouvelles, 'nouvelle', 'nouvelles')}` : combien
}

/** Le compteur de la liste des patients, dit en entier pour qui ne voit pas la pastille. */
export function libelleNonLus(n: number): string {
  return n > 0 ? plural(n, 'mot non lu', 'mots non lus') : ''
}

/** Ce qui empêche la réponse de partir — ou rien. */
export function refusReponse(texte: string): string {
  const propre = texte.trim()
  if (!propre) return "Écrivez votre réponse avant de l'envoyer."
  const trop = Array.from(propre).length - REPONSE_MAX
  if (trop > 0) {
    return `Votre réponse dépasse ${REPONSE_MAX.toLocaleString('fr-FR')} signes : retirez-en ${trop.toLocaleString('fr-FR')}.`
  }
  return ''
}

/**
 * Le refus de la base, dit pour l'écran.
 *
 * Les trois refus qui ont une cause lisible — la page reprise, le suivi clos,
 * le texte — gardent leur cause ; le reste est un incident, et se dit comme
 * tel, sans le jargon de la base.
 */
export function messageRefusReponse(erreur: string): string {
  if (/clos/i.test(erreur)) {
    return "Ce suivi est clos : son espace est fermé, la réponse n'y serait pas lue."
  }
  if (/pas partagée/i.test(erreur)) {
    return "Cette page n'est plus partagée : le patient l'a reprise entre-temps. Rien n'est parti."
  }
  if (/vide|dépasse/i.test(erreur)) return erreur
  return "La réponse n'a pas pu partir. Votre texte est encore là : réessayez dans un instant."
}

/**
 * Ce que l'écran dit une fois la réponse partie.
 *
 * Le téléphone n'est promis que s'il est inscrit : sans rappels activés, la
 * réponse attend dans son espace, et la thérapeute doit le savoir pour ne
 * pas compter sur une sonnerie qui ne viendra pas.
 */
export function retourReponse(appareils: number): string {
  return appareils > 0
    ? 'Réponse envoyée. Elle arrive dans son espace, sous sa page, et sur son téléphone.'
    : "Réponse envoyée. Elle l'attend dans son espace, sous sa page : les rappels ne sont pas activés sur son téléphone."
}

/** Une réponse telle que la base la rend, d'un côté ou de l'autre. */
export interface LigneReponse {
  id: string
  body: string
  created_at: string
  en_reponse_a: string | null
  /** Côté patient seulement : quand il l'a ouverte. */
  read_at?: string | null
}

/**
 * Les réponses rangées sous leur page, de la plus ancienne à la plus récente.
 *
 * Un fil se lit dans le sens du temps : la page, puis ce qu'on lui a répondu,
 * dans l'ordre où c'est arrivé. Une réponse dont la page a été effacée
 * (`en_reponse_a` vide) n'est sous aucune page — elle reste un mot du cabinet.
 */
export function reponsesParPage(lignes: LigneReponse[]): Record<string, ReponseDuCabinet[]> {
  const parPage: Record<string, ReponseDuCabinet[]> = {}
  const triees = [...lignes].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const l of triees) {
    if (!l.en_reponse_a) continue
    const reponse: ReponseDuCabinet = { id: l.id, texte: l.body, le: l.created_at }
    if (l.read_at !== undefined) reponse.lueLe = l.read_at
    const liste = parPage[l.en_reponse_a] ?? (parPage[l.en_reponse_a] = [])
    liste.push(reponse)
  }
  return parPage
}

/** La page à laquelle répond chaque mot : de quoi relier « Mots de votre cabinet » au journal. */
export function pageDuMot(parPage: Record<string, ReponseDuCabinet[]>): Record<string, string> {
  const pages: Record<string, string> = {}
  for (const [page, reponses] of Object.entries(parPage)) {
    for (const r of reponses) pages[r.id] = page
  }
  return pages
}

/** Les pages non lues par fiche, telles que `cabinet_pages_non_lues` les compte. */
export function nonLusParFiche(lignes: Array<{ patient_id: string; non_lues: number }>): Record<PatientId, number> {
  const parFiche: Record<PatientId, number> = {}
  for (const l of lignes) {
    if (l.non_lues > 0) parFiche[l.patient_id] = (parFiche[l.patient_id] ?? 0) + l.non_lues
  }
  return parFiche
}

/**
 * La page est lue : l'entrée du journal et le compteur de la fiche suivent.
 *
 * Sans relire tout le dossier — vingt requêtes pour une pastille. Le compteur
 * ne baisse que si la page attendait vraiment : une seconde ouverture, ou la
 * consœur qui l'a ouverte avant, ne le fait pas descendre deux fois.
 */
export function marquerLue(
  prev: Pick<AppState, 'patients' | 'nonLus'>,
  patientId: PatientId,
  pageId: string,
  luLe: string,
): Pick<AppState, 'patients' | 'nonLus'> {
  const fiche = prev.patients[patientId]
  const entree = fiche?.journal.find((j) => j.id === pageId)
  if (!fiche || !entree) return { patients: prev.patients, nonLus: prev.nonLus }
  const attendait = !entree.luLe
  return {
    patients: {
      ...prev.patients,
      [patientId]: {
        ...fiche,
        journal: fiche.journal.map((j) => (j.id === pageId ? { ...j, luLe: j.luLe || luLe } : j)),
      },
    },
    nonLus: attendait
      ? { ...prev.nonLus, [patientId]: Math.max(0, (prev.nonLus[patientId] ?? 1) - 1) }
      : prev.nonLus,
  }
}

/** Le total, pour le bouton « Patients » qui replie la liste sur un téléphone. */
export function totalNonLus(nonLus: Record<PatientId, number>, fiches: PatientId[]): number {
  return fiches.reduce((n, id) => n + (nonLus[id] ?? 0), 0)
}
