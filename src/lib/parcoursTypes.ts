/**
 * Le parcours par défaut d'un programme (0059) — la part qui se raisonne
 * sans base ni écran.
 *
 * Un programme revient avec les mêmes premiers exercices : « Sommeil »
 * commence souvent par une respiration et trois lignes le soir. Le parcours
 * par défaut les garde, et les PROPOSE quand on attribue le programme à un
 * patient : l'écran montre la liste, la praticienne coche, rien ne s'ajoute
 * tout seul. Un exercice qu'il a déjà n'est pas coché d'office, et la base ne
 * le doublerait pas de toute façon.
 *
 * Les règles d'ici redisent celles de la base (cabinet_regler_parcours_type,
 * cabinet_appliquer_parcours_type) : l'écran refuse avant d'envoyer ce que la
 * base refuserait — avec les mêmes mots.
 *
 * Logique pure, sans import de l'application.
 */
import type { ModuleKind } from '../types/domain'
import { plural } from './format'

/**
 * Les types d'un parcours par défaut : ceux de l'atelier, des tâches que le
 * patient fait et coche. Ni « Audio » ni « Échelle », qui ne se cochent pas.
 */
export const TYPES_DU_PARCOURS = ['Exercice', 'Journal', 'Écriture', 'Visualisation'] as const satisfies readonly ModuleKind[]
export type TypeDuParcours = (typeof TYPES_DU_PARCOURS)[number]

export const MAX_EXERCICES = 12
export const LIMITE_TITRE = 120
export const LIMITE_CONSIGNE = 600

/** Un exercice du parcours par défaut. `id` absent : pas encore enregistré. */
export interface ExerciceType {
  id?: string
  titre: string
  type: TypeDuParcours
  consigne: string
}

/** Un programme du cabinet, avec son parcours. */
export interface ProgrammeAvecParcours {
  id: string
  label: string
  exercices: ExerciceType[]
}

/** Une ligne de `cabinet_programs` avec ses exercices, telle que l'API la rend. */
export interface LigneProgramme {
  id: string
  label: string
  exercices?: Array<{
    id: string
    rang: number
    titre: string
    type_module: string
    consigne: string | null
  }> | null
}

const longueur = (texte: string) => Array.from(texte.trim()).length

export function estTypeDuParcours(valeur: unknown): valeur is TypeDuParcours {
  return typeof valeur === 'string' && (TYPES_DU_PARCOURS as readonly string[]).includes(valeur)
}

/**
 * Les programmes lus, par libellé — c'est par son libellé que l'écran des
 * programmes et la fiche désignent un programme.
 *
 * Un exercice d'un type inconnu est écarté plutôt que montré faux : la base
 * l'interdit, et il ne pourrait pas s'ajouter.
 */
export function programmesDepuisLignes(lignes: LigneProgramme[] | null | undefined): Record<string, ProgrammeAvecParcours> {
  const par: Record<string, ProgrammeAvecParcours> = {}
  for (const l of lignes ?? []) {
    par[l.label] = {
      id: l.id,
      label: l.label,
      exercices: [...(l.exercices ?? [])]
        .sort((a, b) => a.rang - b.rang)
        .flatMap((e) =>
          estTypeDuParcours(e.type_module)
            ? [{ id: e.id, titre: e.titre, type: e.type_module, consigne: e.consigne ?? '' }]
            : [],
        ),
    }
  }
  return par
}

/** Ce qui empêche d'enregistrer le parcours, dit comme la base le dirait — ou `null`. */
export function refusParcours(exercices: readonly ExerciceType[]): string | null {
  if (exercices.length > MAX_EXERCICES) {
    return 'Un parcours par défaut compte douze exercices au plus : il se complète ensuite, fiche par fiche.'
  }
  for (const e of exercices) {
    if (!e.titre.trim()) return "Chaque exercice a besoin d'un titre."
    if (longueur(e.titre) > LIMITE_TITRE) return "Le titre d'un exercice dépasse 120 caractères."
    if (!estTypeDuParcours(e.type)) {
      return "Type d'exercice inconnu : choisissez Exercice, Journal, Écriture ou Visualisation."
    }
    if (longueur(e.consigne) > LIMITE_CONSIGNE) {
      return 'Une consigne dépasse 600 caractères : elle se veut courte, le détail se donne en séance.'
    }
  }
  return null
}

/** Ce que la base reçoit : les champs relus, dans l'ordre de l'écran. */
export function parcoursAEnvoyer(exercices: readonly ExerciceType[]): Array<Omit<ExerciceType, 'id'>> {
  return exercices.map((e) => ({ titre: e.titre.trim(), type: e.type, consigne: e.consigne.trim() }))
}

/** Le parcours a-t-il changé depuis sa lecture ? */
export function parcoursModifie(avant: readonly ExerciceType[], apres: readonly ExerciceType[]): boolean {
  const cle = (l: readonly ExerciceType[]) => JSON.stringify(parcoursAEnvoyer(l))
  return cle(avant) !== cle(apres)
}

/**
 * Les étapes que le patient lira : une par ligne, les lignes vides écartées.
 * La base fait la même découpe à l'ajout.
 */
export function etapesDeLaConsigne(consigne: string): string[] {
  return consigne
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Déplacer un exercice d'un cran, sans sortir de la liste. */
export function deplacer<T>(liste: readonly T[], index: number, sens: -1 | 1): T[] {
  const cible = index + sens
  if (index < 0 || index >= liste.length || cible < 0 || cible >= liste.length) return [...liste]
  const copie = [...liste]
  ;[copie[index], copie[cible]] = [copie[cible], copie[index]]
  return copie
}

/* ------------------------------------------------------------------ *
 * La proposition, fiche par fiche
 * ------------------------------------------------------------------ */

const normal = (titre: string) => titre.trim().toLocaleLowerCase('fr')

/** Un exercice proposé à un patient, et s'il l'a déjà. */
export interface ExercicePropose extends ExerciceType {
  id: string
  /** Déjà dans son parcours, sous ce titre et ce type : la base ne le doublerait pas. */
  dejaLa: boolean
}

/**
 * L'aperçu pour un patient : chaque exercice du programme, et s'il l'a déjà —
 * même règle que la base (titre sans casse ni espaces autour, même type,
 * toujours dans son parcours).
 */
export function apercuPourLePatient(
  exercices: readonly ExerciceType[],
  parcours: ReadonlyArray<{ title: string; kind: string }>,
): ExercicePropose[] {
  const deja = new Set(parcours.map((m) => `${m.kind}|${normal(m.title)}`))
  return exercices.flatMap((e) =>
    e.id ? [{ ...e, id: e.id, dejaLa: deja.has(`${e.type}|${normal(e.titre)}`) }] : [],
  )
}

/** Cochés d'office : tout ce qu'il n'a pas déjà. */
export function choixParDefaut(apercu: readonly ExercicePropose[]): string[] {
  return apercu.filter((e) => !e.dejaLa).map((e) => e.id)
}

/**
 * « 2 exercices ajoutés au parcours de Camille R. » — ou ce qui en tient lieu.
 * Un nom qui finit déjà par un point (« Camille R. ») n'en reçoit pas un second.
 */
export function phraseAjout(ajoutes: number, nom: string): string {
  if (ajoutes === 0) return `Rien de neuf pour ${nom} : ces exercices étaient déjà dans son parcours.`
  const fin = nom.trim().endsWith('.') ? '' : '.'
  return `${plural(ajoutes, 'exercice ajouté', 'exercices ajoutés')} au parcours de ${nom.trim()}${fin}`
}

/** « Ajouter 2 exercices » : le bouton dit ce qu'il fera. */
export function libelleAjout(choisis: number): string {
  return choisis === 0 ? 'Choisissez au moins un exercice' : `Ajouter ${plural(choisis, 'exercice', 'exercices')}`
}

/**
 * Les messages de la base, rendus à l'écran.
 *
 * Ceux qu'elle écrit pour être lus passent tels quels ; les autres — réseau,
 * base sans 0059 — deviennent une phrase qui dit quoi faire.
 */
export function messageRefusParcours(message: string | null | undefined): string {
  const m = message ?? ''
  if (
    /programme n'est pas celui|retiré de votre catalogue|douze exercices|besoin d'un titre|dépasse 120|Type d'exercice inconnu|dépasse 600|suivi en cours de votre cabinet|au moins un exercice|n'appartient pas à ce programme|Parcours illisible/.test(
      m,
    )
  ) {
    return m
  }
  if (/exercices_du_programme|parcours_type|schema cache|does not exist/i.test(m)) {
    return "Les parcours par défaut ne sont pas encore disponibles sur votre cabinet. Réessayez plus tard, ou prévenez l'assistance."
  }
  return "L'opération n'a pas abouti. Vérifiez votre connexion, puis réessayez."
}
