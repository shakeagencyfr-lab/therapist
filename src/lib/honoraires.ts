/**
 * La note d'honoraires : ce qu'elle porte, comment elle se numérote, ce qui
 * la refuse (migration 0053).
 *
 * La base émet, numérote et fige la note ; ici, on prépare la demande et on
 * relit la réponse. Rien de ce qui compte légalement — le numéro, l'identité
 * imprimée — ne se décide dans le navigateur.
 */
import { euroCents } from '@/lib/format'
import { segmentDeFichier } from '@/lib/pdfTexte'

export type MentionTva = 'art-261-4-1' | 'art-293-b'

/**
 * Les deux mentions d'exonération que la note sait porter.
 *
 * 293 B : la franchise en base, celle de la plupart des praticiennes et
 * praticiens en hypnose, profession non réglementée — c'est elle qui est
 * proposée d'office. 261-4-1° : les soins dispensés par les professions
 * médicales et paramédicales réglementées, pour qui l'est. C'est à chacune
 * de choisir celle qui la concerne : le produit ne le sait pas.
 */
export const MENTIONS_TVA: Record<MentionTva, string> = {
  'art-261-4-1': 'TVA non applicable, art. 261-4-1° du CGI',
  'art-293-b': 'TVA non applicable, art. 293 B du CGI',
}

export const MENTION_PAR_DEFAUT: MentionTva = 'art-293-b'

export const PRESTATION_PAR_DEFAUT = 'Séance d’hypnose'

/** La limite de la base, dite avant qu'elle ne refuse. */
export const MONTANT_MAX_CENTS = 500_000

export function estMention(v: unknown): v is MentionTva {
  return v === 'art-261-4-1' || v === 'art-293-b'
}

/** L'identité imprimée sur chaque note. */
export interface IdentiteFacturation {
  praticien: string
  adresse: string
  numeroPro: string
  /** La mention proposée par défaut ; nulle : aucune. */
  mentionTva: MentionTva | null
}

/** Une note émise, telle que la base la garde. */
export interface NoteHonoraires {
  id: string
  numero: number
  patientId: string | null
  sessionId: string | null
  /** « AAAA-MM-JJ » */
  datePrestation: string
  prestation: string
  montantCents: number
  mentionTva: MentionTva | null
  praticien: string
  praticienAdresse: string
  praticienNumero: string
  beneficiaire: string
  emiseLe: string
  annuleeLe: string | null
}

/** Une ligne de `notes_honoraires`. */
export interface LigneNoteHonoraires {
  id: string
  numero: number
  patient_id: string | null
  session_id: string | null
  date_prestation: string
  prestation: string
  montant_cents: number
  mention_tva: string | null
  praticien: string
  praticien_adresse: string
  praticien_numero: string
  beneficiaire: string
  emise_le: string
  annulee_le: string | null
}

export function noteDepuisLigne(l: LigneNoteHonoraires): NoteHonoraires {
  return {
    id: l.id,
    numero: l.numero,
    patientId: l.patient_id,
    sessionId: l.session_id,
    datePrestation: l.date_prestation,
    prestation: l.prestation,
    montantCents: l.montant_cents,
    mentionTva: estMention(l.mention_tva) ? l.mention_tva : null,
    praticien: l.praticien,
    praticienAdresse: l.praticien_adresse,
    praticienNumero: l.praticien_numero,
    beneficiaire: l.beneficiaire,
    emiseLe: l.emise_le,
    annuleeLe: l.annulee_le,
  }
}

/** « 0007 » : quatre chiffres, pour qu'un classement alphabétique reste dans l'ordre. */
export function numeroDeNote(n: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(4, '0')
}

/**
 * Des euros saisis vers des centimes : « 60 », « 60,5 », « 60.50 », « 60 € »,
 * « 1 200 ». `null` si ce n'est pas un montant — trois décimales, deux
 * virgules, une lettre : on ne devine pas ce qu'on imprimera sur une pièce
 * comptable.
 */
export function centimesDepuisSaisie(saisie: string): number | null {
  const propre = saisie
    .replace(/€/g, '')
    .replace(/[\s  ]/g, '')
    .replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(propre)) return null
  const [entiers, decimales = ''] = propre.split('.')
  const cents = Number(entiers) * 100 + Number(decimales.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

/** « 60,00 € » */
export const montantLisible = (cents: number): string => euroCents(cents)

/** Le refus d'un montant, en français ; vide s'il peut partir. */
export function refusMontant(cents: number | null): string {
  if (cents === null) return 'Le montant n’est pas lisible : écrivez-le en euros, par exemple 60 ou 60,50.'
  if (cents < 1) return 'Le montant doit être supérieur à zéro.'
  if (cents > MONTANT_MAX_CENTS) return 'Le montant dépasse 5 000 € : vérifiez-le.'
  return ''
}

/** Ce qui manque à l'identité pour émettre, dit comme l'écran le dira. */
export function manquesIdentite(i: Pick<IdentiteFacturation, 'praticien' | 'adresse' | 'numeroPro'>): string[] {
  const manque: string[] = []
  if (!i.praticien.trim()) manque.push('votre nom')
  if (!i.adresse.trim()) manque.push('l’adresse du cabinet')
  if (!i.numeroPro.trim()) manque.push('votre numéro professionnel (SIRET, ADELI ou RPPS)')
  return manque
}

/** Ce que la vitrine sait déjà : les mentions légales de 0048. */
export interface MentionsVitrine {
  responsable: string | null
  adresse: string | null
  numero_pro: string | null
}

export type SourceIdentite = 'enregistree' | 'vitrine' | 'a-saisir'

/**
 * L'identité à proposer.
 *
 * Enregistrée : c'est elle, telle que la praticienne l'a confirmée. Sinon,
 * les mentions légales du site vitrine si elles existent — même personne,
 * déjà écrites —, puis le nom de son compte. Proposée seulement : une note
 * ne part pas avec une identité que personne n'a relue, c'est pourquoi la
 * source est rendue avec elle.
 */
export function identiteProposee(
  enregistree: IdentiteFacturation | null,
  vitrine: MentionsVitrine | null,
  nomDuCompte: string,
): { identite: IdentiteFacturation; source: SourceIdentite } {
  if (enregistree && manquesIdentite(enregistree).length === 0) {
    return { identite: enregistree, source: 'enregistree' }
  }
  const depuisVitrine = {
    praticien: (vitrine?.responsable ?? '').trim(),
    adresse: (vitrine?.adresse ?? '').trim(),
    numeroPro: (vitrine?.numero_pro ?? '').trim(),
  }
  const identite: IdentiteFacturation = {
    praticien: enregistree?.praticien.trim() || depuisVitrine.praticien || nomDuCompte.trim(),
    adresse: enregistree?.adresse.trim() || depuisVitrine.adresse,
    numeroPro: enregistree?.numeroPro.trim() || depuisVitrine.numeroPro,
    mentionTva: enregistree ? enregistree.mentionTva : MENTION_PAR_DEFAUT,
  }
  const vitrineServie = Object.values(depuisVitrine).some(Boolean)
  return { identite, source: vitrineServie ? 'vitrine' : 'a-saisir' }
}

/**
 * Le refus de la base, rendu lisible.
 *
 * Les refus attendus (fiche hors du cabinet, séance non envoyée, séance déjà
 * facturée, saisie hors bornes) arrivent avec une phrase déjà écrite pour
 * l'écran : on la rend telle quelle. Le reste est une panne — et la base
 * ayant tout annulé, aucun numéro n'a été pris : on peut le dire.
 */
export function refusEmission(erreur: { code?: string; message?: string } | null): string {
  if (!erreur) return ''
  if (['P0002', '55000', '23505', '22023'].includes(erreur.code ?? '') && erreur.message) return erreur.message
  return 'La note n’a pas pu être émise. Aucun numéro n’a été pris : réessayez.'
}

/** « Note-honoraires-0007_Camille-Martin_2026-09-25.pdf » */
export function nomFichierNote(note: Pick<NoteHonoraires, 'numero' | 'beneficiaire' | 'datePrestation'>): string {
  return (
    [`Note-honoraires-${numeroDeNote(note.numero)}`, segmentDeFichier(note.beneficiaire), note.datePrestation]
      .filter(Boolean)
      .join('_') + '.pdf'
  )
}

/** « 25 septembre 2026 » depuis « 2026-09-25 » ou un instant ISO, au jour de Paris. */
export function jourLisible(jourOuInstant: string): string {
  const instant = new Date(jourOuInstant)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jourOuInstant) && Number.isNaN(instant.getTime())) return jourOuInstant
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(jourOuInstant)
    ? jourOuInstant
    : new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(instant)
  const [a, m, j] = jour.split('-').map(Number)
  if (!a || !m || !j) return jourOuInstant
  return new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Une note se relit-elle pour cette séance ? La plus récente non annulée. */
export function noteDeLaSeance(notes: readonly NoteHonoraires[], sessionId: string): NoteHonoraires | null {
  return notes.find((n) => n.sessionId === sessionId && !n.annuleeLe) ?? null
}
