/**
 * Le dossier d'une fiche, tel que la praticienne le relit : l'historique des
 * séances, l'anamnèse et les notes datées (migration 0053).
 *
 * Logique pure : la lecture en base est dans src/cabinet/dossier.ts, les
 * écrans dans src/views/therapist. Ce qui se décide ici — ce qu'une séance
 * montre, ce qu'elle tait, dans quel ordre — se teste sans navigateur.
 */
import type { DraftVigilance } from '@/types/domain'

/* ------------------------------------------------------------------ *
 * Les séances
 * ------------------------------------------------------------------ */

/**
 * LES COLONNES LUES — la transcription n'en est pas, et n'en sera pas.
 *
 * Elle ne sert qu'à écrire la note, s'efface à l'envoi et sept jours après
 * l'ouverture d'une séance abandonnée (0043) ; c'est la donnée la plus
 * sensible du cabinet. Un historique qui la demanderait l'afficherait tôt ou
 * tard. Un test lit ce texte et refuse le mot.
 */
export const COLONNES_SEANCE = 'id, status, occurred_at, consent_revoked_at, duration_seconds, notes, draft, sent_at'

/** Une séance telle que la base la rend, sans son verbatim. */
export interface LigneSeance {
  id: string
  status: string
  occurred_at: string
  consent_revoked_at: string | null
  duration_seconds: number | null
  notes: string | null
  /** Le brouillon relu : du JSON, dont la forme a varié d'une version à l'autre. */
  draft: unknown
  sent_at: string | null
}

export type EtatSeance = 'envoyee' | 'brouillon' | 'retiree' | 'ouverte' | 'rangee'

export const LIBELLE_ETAT: Record<EtatSeance, string> = {
  envoyee: 'Envoyée',
  brouillon: 'Brouillon non envoyé',
  retiree: 'Consentement retiré',
  ouverte: 'Non rédigée',
  rangee: 'Rangée',
}

/** Ce qu'on relit d'un brouillon : la note, pas ses propositions. */
export interface BrouillonRelu {
  synthese: string
  mots: string[]
  themes: string[]
  questions: string[]
  vigilance: DraftVigilance[]
}

export interface SeanceDuDossier {
  id: string
  /** L'instant de la séance, en ISO. */
  le: string
  dureeSecondes: number
  etat: EtatSeance
  retireeLe: string | null
  envoyeeLe: string | null
  /** Les notes écrites pendant la séance. */
  notes: string
  brouillon: BrouillonRelu | null
}

const textes = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : []

/**
 * Le brouillon d'une séance, lu sans confiance.
 *
 * La colonne est du JSON écrit par plusieurs versions du produit : on y a vu
 * une `induction` qui n'existe plus, des listes absentes. On garde ce qui a
 * la bonne forme, et rien ne plante sur ce qui ne l'a pas.
 */
export function lireBrouillon(draft: unknown): BrouillonRelu | null {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null
  const d = draft as Record<string, unknown>
  const vigilance = Array.isArray(d.vigilance)
    ? d.vigilance
        .filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object')
        .map((v) => ({
          point: typeof v.point === 'string' ? v.point.trim() : '',
          conduite: typeof v.conduite === 'string' ? v.conduite.trim() : '',
        }))
        .filter((v) => v.point)
    : []
  const relu: BrouillonRelu = {
    synthese: typeof d.synthese === 'string' ? d.synthese.trim() : '',
    mots: textes(d.mots),
    themes: textes(d.themes),
    questions: textes(d.questions),
    vigilance,
  }
  const vide =
    !relu.synthese && !relu.mots.length && !relu.themes.length && !relu.questions.length && !relu.vigilance.length
  return vide ? null : relu
}

/** L'état d'une séance, dans l'ordre où il se décide. */
export function etatDeSeance(l: Pick<LigneSeance, 'status' | 'consent_revoked_at' | 'sent_at'>): EtatSeance {
  if (l.consent_revoked_at) return 'retiree'
  if (l.sent_at) return 'envoyee'
  if (l.status === 'brouillon') return 'brouillon'
  if (l.status === 'archive') return 'rangee'
  return 'ouverte'
}

const instant = (iso: string) => {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

/**
 * Les séances de la fiche, de la plus récente à la plus ancienne.
 *
 * UNE SÉANCE AU CONSENTEMENT RETIRÉ SE MONTRE, VIDE. La base a déjà tout
 * effacé (0043) ; l'écran ne l'inventerait pas, mais la ligne vide dit à la
 * praticienne ce qui s'est passé ce jour-là plutôt que de faire disparaître
 * la séance.
 *
 * UNE SÉANCE OUVERTE SUR LAQUELLE RIEN N'A ÉTÉ PRIS NE SE MONTRE PAS. Signer
 * le consentement ouvre une ligne ; beaucoup s'arrêtent là (un essai, un
 * patient qui préfère ne pas être enregistré). Les lister noierait les vraies
 * séances : on les compte, et l'écran le dit en une ligne.
 */
export function seancesDuDossier(lignes: readonly LigneSeance[]): {
  seances: SeanceDuDossier[]
  sansRien: number
} {
  const seances: SeanceDuDossier[] = []
  let sansRien = 0
  for (const l of lignes) {
    const etat = etatDeSeance(l)
    const retiree = etat === 'retiree'
    const notes = retiree ? '' : (l.notes ?? '').trim()
    const brouillon = retiree ? null : lireBrouillon(l.draft)
    if (!retiree && etat !== 'envoyee' && !notes && !brouillon) {
      sansRien += 1
      continue
    }
    seances.push({
      id: l.id,
      le: l.occurred_at,
      dureeSecondes: Math.max(0, Math.round(l.duration_seconds ?? 0)),
      etat,
      retireeLe: l.consent_revoked_at,
      envoyeeLe: l.sent_at,
      notes,
      brouillon,
    })
  }
  seances.sort((a, b) => instant(b.le) - instant(a.le))
  return { seances, sansRien }
}

/**
 * La séance à relire : la dernière qui porte quelque chose. C'est elle que
 * l'écran ouvre d'office — relire la séance précédente est le geste qu'on
 * vient faire.
 */
export function seanceARelire(seances: readonly SeanceDuDossier[]): string | null {
  return seances.find((s) => s.etat !== 'retiree' && (s.brouillon || s.notes))?.id ?? null
}

/** « 52 min », « 1 h 05 » ; vide quand la durée n'a pas été mesurée. */
export function dureeDeSeance(secondes: number): string {
  if (!secondes || secondes < 0) return ''
  if (secondes < 60) return "moins d'une minute"
  const minutes = Math.round(secondes / 60)
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

/** « jeudi 3 septembre 2026 », à l'heure de Paris. */
export function dateDeSeance(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  })
}

/* ------------------------------------------------------------------ *
 * L'anamnèse
 * ------------------------------------------------------------------ */

export interface Anamnese {
  motif: string
  antecedents: string
  contreIndications: string
  traitements: string
}

export const ANAMNESE_VIDE: Anamnese = { motif: '', antecedents: '', contreIndications: '', traitements: '' }

/** La limite de la base (0053), dite avant qu'elle ne refuse. */
export const LIMITE_CHAMP_ANAMNESE = 8000
export const LIMITE_NOTE_DATEE = 20000

/**
 * Les champs, dans l'ordre d'un premier rendez-vous. Des champs libres :
 * l'application ne tient aucune liste médicale, et n'en inventera pas —
 * c'est la praticienne qui sait ce qui contre-indique une hypnose chez
 * cette personne.
 */
export const CHAMPS_ANAMNESE: ReadonlyArray<{
  cle: keyof Anamnese
  libelle: string
  aide: string
  exemple: string
}> = [
  {
    cle: 'motif',
    libelle: 'Motif de consultation',
    aide: 'Ce qui amène cette personne, dans ses mots si possible.',
    exemple: 'Arrêter de fumer avant l’été ; « je n’y arrive plus seule ».',
  },
  {
    cle: 'antecedents',
    libelle: 'Antécédents',
    aide: 'Ce qui a déjà été tenté, les suivis passés ou en cours, ce qui compte dans son histoire.',
    exemple: 'Deux arrêts de six mois, patchs en 2023. Suivi psychologique en 2021.',
  },
  {
    cle: 'contreIndications',
    libelle: 'Contre-indications à l’hypnose',
    aide:
      'Ce que vous avez recueilli et qui appelle la prudence — épilepsie, troubles psychotiques… Consignez-le tel quel : l’application ne le vérifie pas.',
    exemple: 'Aucune connue à ce jour.',
  },
  {
    cle: 'traitements',
    libelle: 'Traitements en cours',
    aide: 'Ce que la personne vous a dit prendre, et qui la suit.',
    exemple: 'Aucun traitement déclaré.',
  },
]

/** Une ligne de `dossier_anamneses`, telle que la base la rend. */
export interface LigneAnamnese {
  motif: string | null
  antecedents: string | null
  contre_indications: string | null
  traitements: string | null
  modifiee_le?: string | null
}

export function anamneseDepuisLigne(ligne: LigneAnamnese | null | undefined): Anamnese {
  if (!ligne) return { ...ANAMNESE_VIDE }
  return {
    motif: ligne.motif ?? '',
    antecedents: ligne.antecedents ?? '',
    contreIndications: ligne.contre_indications ?? '',
    traitements: ligne.traitements ?? '',
  }
}

/** Ce qui part en base : les blancs de bord retirés, rien d'autre. */
export function anamneseVersLigne(a: Anamnese): Omit<LigneAnamnese, 'modifiee_le'> {
  return {
    motif: a.motif.trim(),
    antecedents: a.antecedents.trim(),
    contre_indications: a.contreIndications.trim(),
    traitements: a.traitements.trim(),
  }
}

export function anamneseVide(a: Anamnese): boolean {
  return CHAMPS_ANAMNESE.every(({ cle }) => !a[cle].trim())
}

/** Deux saisies disent-elles la même chose, aux blancs de bord près ? */
export function anamneseModifiee(a: Anamnese, b: Anamnese): boolean {
  return CHAMPS_ANAMNESE.some(({ cle }) => a[cle].trim() !== b[cle].trim())
}

/** Le refus d'écrire, en français ; vide si la saisie peut partir. */
export function refusAnamnese(a: Anamnese): string {
  const long = CHAMPS_ANAMNESE.find(({ cle }) => a[cle].trim().length > LIMITE_CHAMP_ANAMNESE)
  return long
    ? `« ${long.libelle} » dépasse 8 000 caractères : raccourcissez-le, ou passez le détail dans une note datée.`
    : ''
}

/* ------------------------------------------------------------------ *
 * Les notes datées
 * ------------------------------------------------------------------ */

export interface NoteDatee {
  id: string
  /** Le jour de la note, « AAAA-MM-JJ », choisi par la praticienne. */
  le: string
  texte: string
  /** Qui l'a écrite, dit comme l'écran le dit ; vide si c'est vous ou si on ne sait pas. */
  auteur: string
  creeeLe: string
  modifieeLe: string
}

/** Une ligne de `dossier_notes`. */
export interface LigneNote {
  id: string
  le: string
  texte: string
  auteur: string | null
  creee_le: string
  modifiee_le: string
}

/**
 * Les notes, de la plus récente à la plus ancienne ; à jour égal, la
 * dernière écrite d'abord. L'auteur n'est nommé que s'il n'est pas vous :
 * dans un cabinet à une praticienne, « par vous » sur chaque note serait
 * du bruit ; dans une équipe, savoir qui a écrit compte.
 */
export function notesDepuisLignes(
  lignes: readonly LigneNote[],
  moi: string | null,
  noms: ReadonlyMap<string, string>,
): NoteDatee[] {
  return lignes
    .map((l) => ({
      id: l.id,
      le: l.le,
      texte: l.texte,
      auteur: l.auteur && l.auteur !== moi ? (noms.get(l.auteur) ?? 'un autre membre de l’équipe') : '',
      creeeLe: l.creee_le,
      modifieeLe: l.modifiee_le,
    }))
    .sort((a, b) => b.le.localeCompare(a.le) || instant(b.creeeLe) - instant(a.creeeLe))
}

/** « 28 septembre 2026 » depuis « 2026-09-28 », sans glisser d'un jour. */
export function dateDeNote(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number)
  if (!a || !m || !j) return jour
  return new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Le refus d'écrire une note datée ; vide si elle peut partir. */
export function refusNoteDatee(texte: string, le: string, aujourdhui: string): string {
  if (!texte.trim()) return 'La note est vide.'
  if (texte.trim().length > LIMITE_NOTE_DATEE) return 'La note est trop longue : coupez-la en deux notes.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(le)) return 'Choisissez le jour de la note.'
  if (le > aujourdhui) return 'Une note se date au plus tard aujourd’hui.'
  return ''
}
