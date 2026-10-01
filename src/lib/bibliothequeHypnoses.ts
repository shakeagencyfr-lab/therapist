/**
 * La bibliothèque d'hypnoses du cabinet (0071), sans navigateur ni base : ce
 * que l'écran lit d'une ligne, ce qu'il en dit, et ce qu'il refuse avant
 * d'écrire. Les gestes en base sont dans src/cabinet/bibliothequeHypnoses.ts,
 * l'écran dans src/views/atelier/BibliothequeHypnoses.tsx.
 *
 * UNE HYPNOSE DE LA BIBLIOTHÈQUE NE NOMME PERSONNE. Celle qui est née en
 * séance retient le patient d'où elle vient, pour qu'on puisse la retirer
 * avec sa fiche ; elle ne l'affiche jamais. Ce fichier n'a donc aucune
 * fonction qui rende un nom, et l'écran n'en reçoit pas.
 */
import { plural } from '@/lib/format'
import type { Hypnose, HypnoseDeBibliotheque, HypnoseMouvement, PatientId } from '@/types/domain'

/** Les quatre mouvements, dans l'ordre où la séance les lit. */
export const ORDRE_DES_MOUVEMENTS: ReadonlyArray<HypnoseMouvement['mouvement']> = [
  'induction',
  'approfondissement',
  'travail',
  'retour',
]

/** Le titre d'une ligne ouverte avant d'être écrite, tant qu'on ne lui en donne pas. */
export const TITRE_EN_COURS = 'Hypnose en cours d’écriture'

/** Le titre de repli, quand ni la praticienne ni l'induction n'en donnent. */
export const TITRE_PAR_DEFAUT = 'Hypnose du cabinet'

/** L'intention la plus courte qu'accepte une hypnose sans patient (server/ai.ts). */
export const INTENTION_MINIMALE = 15

/** L'intention la plus longue (server/lecture.ts, BORNES.intention). */
export const INTENTION_MAXIMALE = 2000

/** Le titre le plus long (la contrainte de 0071). */
export const TITRE_MAXIMAL = 300

/**
 * Ce que l'écran dit avant d'attribuer une hypnose née en séance : elle a été
 * écrite sur les mots d'une autre personne.
 */
export const AVERTISSEMENT_SEANCE =
  "Écrite pendant la séance d'un autre patient : relisez-la avant de l'utiliser, elle peut contenir des détails qui lui sont propres."

/** La ligne telle que la base la rend. */
export interface LigneBibliotheque {
  id: string
  titre: string
  intention: string | null
  mouvements: unknown
  origine: string
  complete: boolean
  cree_le: string
  modifie_le: string
  source_patient_id: string | null
}

/** Une copie attribuée, telle que la base la rend : de quelle ligne, à qui. */
export interface CopieAttribuee {
  bibliotheque_id: string | null
  patient_id: string
}

function estMouvement(valeur: unknown): valeur is HypnoseMouvement['mouvement'] {
  return typeof valeur === 'string' && (ORDRE_DES_MOUVEMENTS as readonly string[]).includes(valeur)
}

/**
 * Les mouvements d'une ligne, lus dans sa colonne `mouvements`.
 *
 * La colonne est écrite par le navigateur : on n'en croit que ce qui a la
 * forme d'un mouvement — un nom parmi les quatre, un texte —, une fois par
 * mouvement (le dernier l'emporte, c'est le plus récent), dans l'ordre de
 * la séance.
 */
export function mouvementsDepuisJson(valeur: unknown): HypnoseMouvement[] {
  if (!Array.isArray(valeur)) return []
  const parNom = new Map<HypnoseMouvement['mouvement'], HypnoseMouvement>()
  for (const brut of valeur) {
    if (!brut || typeof brut !== 'object') continue
    const m = brut as Record<string, unknown>
    if (!estMouvement(m.mouvement) || typeof m.texte !== 'string') continue
    parNom.set(m.mouvement, {
      mouvement: m.mouvement,
      titre: typeof m.titre === 'string' ? m.titre : '',
      texte: m.texte,
    })
  }
  return ORDRE_DES_MOUVEMENTS.flatMap((nom) => {
    const m = parNom.get(nom)
    return m ? [m] : []
  })
}

/** La liste avec ce mouvement posé à sa place — ajouté, ou remplaçant l'ancien. */
export function poserMouvement(liste: readonly HypnoseMouvement[], m: HypnoseMouvement): HypnoseMouvement[] {
  return mouvementsDepuisJson([...liste.filter((e) => e.mouvement !== m.mouvement), m])
}

/** Les quatre mouvements sont là, chacun avec un texte : elle se lit d'un bout à l'autre. */
export function estEntiere(mouvements: readonly HypnoseMouvement[]): boolean {
  return ORDRE_DES_MOUVEMENTS.every((nom) => mouvements.some((m) => m.mouvement === nom && m.texte.trim()))
}

/** Qui a reçu quoi : par ligne de la bibliothèque, les patients, chacun une fois. */
export function attributionsParLigne(copies: readonly CopieAttribuee[]): Map<string, PatientId[]> {
  const par = new Map<string, Set<PatientId>>()
  for (const c of copies) {
    if (!c.bibliotheque_id) continue
    const s = par.get(c.bibliotheque_id) ?? new Set<PatientId>()
    s.add(c.patient_id)
    par.set(c.bibliotheque_id, s)
  }
  return new Map([...par].map(([id, s]) => [id, [...s]]))
}

/** Une ligne de la base, à la forme de l'écran. */
export function lireLigne(ligne: LigneBibliotheque, attribueeA: PatientId[] = []): HypnoseDeBibliotheque {
  return {
    id: ligne.id,
    titre: ligne.titre,
    intention: ligne.intention ?? '',
    mouvements: mouvementsDepuisJson(ligne.mouvements),
    origine: ligne.origine === 'seance' ? 'seance' : 'atelier',
    complete: ligne.complete,
    creeLe: ligne.cree_le,
    modifieLe: ligne.modifie_le,
    attribueeA,
    sourcePatientId: ligne.source_patient_id,
  }
}

/** D'où elle vient, dit en trois mots. */
export function libelleOrigine(origine: HypnoseDeBibliotheque['origine']): string {
  return origine === 'seance' ? 'Écrite en séance' : 'Écrite dans l’atelier'
}

/** « attribuée à 3 patients », « pas encore attribuée ». */
export function phraseAttribution(n: number): string {
  return n > 0 ? `attribuée à ${plural(n, 'patient', 'patients')}` : 'pas encore attribuée'
}

/** « 2 septembre 2026 » — vide sur une date illisible plutôt qu'« Invalid Date ». */
export function dateDeLaBibliotheque(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * La ligne de méta d'une hypnose de la liste : d'où elle vient, quand, à
 * combien de patients. Jamais à qui, ni de qui.
 */
export function metaDeLaBibliotheque(h: HypnoseDeBibliotheque, enCours = false): string {
  const date = dateDeLaBibliotheque(h.creeLe)
  const etat = enCours
    ? 'en cours d’écriture'
    : h.complete
      ? phraseAttribution(h.attribueeA.length)
      : `interrompue, ${plural(h.mouvements.length, 'mouvement', 'mouvements')} sur 4`
  return [libelleOrigine(h.origine), date, etat].filter(Boolean).join(' · ')
}

/**
 * Pourquoi l'intention ne suffit pas, ou null si elle suffit.
 *
 * Sans patient, c'est elle qui porte le script : le serveur la refuse sous
 * quinze caractères (server/ai.ts) — on le dit avant l'appel, sans rien
 * décompter.
 */
export function refusIntention(intention: string): string | null {
  const t = intention.trim()
  if (t.length < INTENTION_MINIMALE) {
    return 'Décrivez en une phrase ou deux ce que cette hypnose doit travailler : sans patient, c’est votre intention qui la porte.'
  }
  if (t.length > INTENTION_MAXIMALE) {
    return `L’intention est trop longue : une ou deux phrases suffisent, ${INTENTION_MAXIMALE.toLocaleString('fr-FR')} caractères au plus.`
  }
  return null
}

/** Le titre qu'on a donné, ou celui de l'induction : la métaphore qui porte la séance. */
export function titreDeLaBibliotheque(titreLibre: string, ecrits: readonly HypnoseMouvement[]): string {
  const choisi = titreLibre.trim() || ecrits.find((m) => m.mouvement === 'induction')?.titre.trim() || TITRE_PAR_DEFAUT
  return choisi.slice(0, TITRE_MAXIMAL)
}

/** Le titre qu'une ligne reprise garde : celui qu'on lui avait donné, pas celui d'attente. */
export function titreLibreDe(h: Pick<HypnoseDeBibliotheque, 'titre'>): string {
  return h.titre === TITRE_EN_COURS ? '' : h.titre
}

/** Une hypnose de la bibliothèque, à la forme que le PDF lit. */
export function hypnosePourPdf(h: HypnoseDeBibliotheque): Hypnose {
  return {
    id: h.id,
    titre: h.titre,
    intention: h.intention,
    complete: h.complete,
    createdAt: h.creeLe,
    mouvements: h.mouvements,
  }
}

/** Ce que l'écran dit avant de retirer une hypnose de la bibliothèque. */
export function consequenceDeLaSuppression(titre: string): string {
  return `« ${titre} » quitte la bibliothèque du cabinet. Les patients qui l'ont reçue la gardent dans leur fiche.`
}

/** Combien de lignes sont nées des séances de ce patient. */
export function neesDe(liste: readonly HypnoseDeBibliotheque[], patientId: PatientId): number {
  return liste.filter((h) => h.sourcePatientId === patientId).length
}

/**
 * La case de la suppression d'une fiche, quand la bibliothèque garde des
 * hypnoses de ses séances. `null` : le compte n'a pas pu être lu — la case
 * reste offerte, sans chiffre.
 */
export function caseDeLaSuppression(n: number | null): string {
  if (n === null) {
    return "Retirer aussi de la bibliothèque les hypnoses écrites pendant ses séances, s'il y en a (elles peuvent contenir des détails qui lui sont propres)"
  }
  return n > 1
    ? `Retirer aussi de la bibliothèque les ${n} hypnoses écrites pendant ses séances (elles peuvent contenir des détails qui lui sont propres)`
    : "Retirer aussi de la bibliothèque l'hypnose écrite pendant ses séances (elle peut contenir des détails qui lui sont propres)"
}

/**
 * La phrase de la zone de suppression d'une fiche sur la bibliothèque : ce
 * qui part, ce qui reste. Vide quand la bibliothèque n'a rien de ses séances.
 */
export function phraseDeLaSuppression(n: number | null, retirer: boolean): string {
  if (n === 0) return ''
  return retirer
    ? ' Les hypnoses de la bibliothèque du cabinet écrites pendant ses séances partent aussi, avant la fiche.'
    : ' Les hypnoses de la bibliothèque du cabinet écrites pendant ses séances y restent, sans plus la désigner.'
}

/** Ce qu'une attribution réussie dit à l'écran. */
export function phraseApresAttribution(titre: string, n: number): string {
  return n > 1
    ? `« ${titre} » est dans la fiche de ${n} patients, avec ses quatre mouvements.`
    : `« ${titre} » est dans la fiche du patient choisi, avec ses quatre mouvements.`
}

/**
 * Ce que l'écran dit d'un refus de la base.
 *
 * Les messages de `cabinet_attribuer_hypnose` sont écrits pour l'écran (0071) :
 * ils passent tels quels. Une base qui n'a pas encore 0071, ou une panne, se
 * dit sans jargon.
 */
export function messageRefusBibliotheque(message: string | null | undefined): string {
  const m = message ?? ''
  if (
    /pas dans la bibliothèque de votre cabinet|n'est pas ouverte pour votre cabinet|n'est pas entière|au moins un patient|Deux cents patients|suivi en cours de votre cabinet/.test(
      m,
    )
  ) {
    return m
  }
  if (/bibliotheque_hypnoses|cabinet_attribuer_hypnose|schema cache|does not exist/i.test(m)) {
    return "La bibliothèque d'hypnoses n'est pas encore disponible sur votre cabinet. Réessayez plus tard, ou prévenez l'assistance."
  }
  return "L'opération n'a pas abouti. Vérifiez votre connexion, puis réessayez."
}

/** Ce que l'écran sait de l'écriture d'une hypnose de bibliothèque. */
export interface EtatEcritureBibliotheque {
  fini: boolean
  conservee: boolean
  ecrits: number
  interrompue: boolean
}

/**
 * Le bilan d'une écriture d'atelier — le pendant de `bilanHypnose`
 * (src/lib/texteHypnose.ts) pour une hypnose qui ne va dans aucune fiche.
 * « Conservée » n'est dit que si la bibliothèque l'a reçue.
 */
export function bilanBibliotheque(etat: EtatEcritureBibliotheque): { ton: 'ok' | 'warn' | 'neutre'; texte: string } | null {
  if (etat.fini) {
    return etat.conservee
      ? { ton: 'ok', texte: 'Hypnose écrite et rangée dans la bibliothèque du cabinet. Relisez-la, puis attribuez-la.' }
      : {
          ton: 'warn',
          texte:
            "Hypnose écrite, mais pas conservée : la bibliothèque ne l'a pas reçue. Réessayez de l'enregistrer — sinon, elle disparaîtra au prochain chargement.",
        }
  }
  if (!etat.interrompue) return null
  if (etat.ecrits === 0) {
    return { ton: 'neutre', texte: "Aucun mouvement n'a pu être écrit. Relancez l'écriture, ou fermez pour changer d'intention." }
  }
  return etat.conservee
    ? {
        ton: 'neutre',
        texte: `${plural(etat.ecrits, 'mouvement écrit et conservé', 'mouvements écrits et conservés')} sur 4. Reprenez là où l'écriture s'est arrêtée, ou fermez : l'hypnose reste dans la liste, marquée interrompue, et pourra être reprise plus tard.`,
      }
    : {
        ton: 'warn',
        texte: `${plural(etat.ecrits, 'mouvement écrit', 'mouvements écrits')} sur 4, mais pas tous conservés. Reprenez : ce qui manque à la bibliothèque y sera versé avant que l'écriture ne continue.`,
      }
}
