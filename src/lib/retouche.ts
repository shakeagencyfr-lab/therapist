/**
 * Les retouches par l'IA — pur, lu par l'écran ET par le serveur.
 *
 * Sous chaque texte que l'IA écrit, deux pouces. Le pouce baissé ouvre une
 * fenêtre : ce que l'IA a mal fait, ce qu'elle aurait dû faire. L'IA réécrit
 * alors ce texte-là, et lui seul (route `revision`, server/ai.ts), et la
 * praticienne peut retenir ce qu'elle attendait pour les générations
 * suivantes (0066, `preferences_ia`).
 *
 * Les deux côtés lisent les mêmes listes et les mêmes bornes ici : la base
 * les répète dans ses contraintes, et server/retouche.test.ts vérifie que
 * les trois disent la même chose.
 */
import type { ActionJetons } from '../types/jetons.js'

/**
 * Ce qui se retouche : chaque texte que l'IA rédige.
 *
 * « consigne » et « module » sont le même objet écrit par la même route,
 * mais pas au même moment : la consigne est celle d'un exercice déjà chez le
 * patient, le module sort de l'atelier. Leurs préférences se distinguent.
 */
export const CIBLES_RETOUCHE = [
  'hypnose',
  'module',
  'consigne',
  'synthese',
  'message',
  'proposition',
  'profil',
  'affirmations',
] as const
export type CibleRetouche = (typeof CIBLES_RETOUCHE)[number]

/**
 * Ce qui se note sans se retoucher. Les mots, les points de vigilance et les
 * questions du brouillon sont RELEVÉS dans la séance, pas rédigés : un avis y
 * dit quelque chose de l'analyse, une réécriture n'y aurait pas de sens.
 */
export const CIBLES_VOTE_SEUL = ['mots', 'vigilance', 'questions'] as const
export type CibleVote = CibleRetouche | (typeof CIBLES_VOTE_SEUL)[number]
export const CIBLES_DE_VOTE: readonly CibleVote[] = [...CIBLES_RETOUCHE, ...CIBLES_VOTE_SEUL]

export type Vote = 'haut' | 'bas'

/** Chacun des deux champs de la fenêtre : de quoi dire, pas de quoi recopier un dossier. */
export const BORNE_RETOUR = 2000
/** Une préférence retenue : une consigne de style, pas un paragraphe (0066). */
export const BORNE_PREFERENCE = 400
/** Actives au plus, par cabinet et par type — la base retire les plus anciennes (0066). */
export const PREFERENCES_ACTIVES = 20
/** Relues à chaque génération : les plus récentes, pour ne pas noyer la demande. */
export const PREFERENCES_LUES = 10

export function estCibleRetouche(x: unknown): x is CibleRetouche {
  return typeof x === 'string' && (CIBLES_RETOUCHE as readonly string[]).includes(x)
}

export function estCibleDeVote(x: unknown): x is CibleVote {
  return typeof x === 'string' && (CIBLES_DE_VOTE as readonly string[]).includes(x)
}

/** Le nom de chaque type, au pluriel : la liste des préférences et la demande au modèle. */
export const LIBELLE_CIBLE: Record<CibleRetouche, string> = {
  hypnose: "Mouvements d'hypnose",
  module: "Modules de l'atelier",
  consigne: 'Consignes des exercices',
  synthese: 'Synthèses de séance',
  message: 'Messages au patient',
  proposition: 'Modules proposés après la séance',
  profil: 'Profils psychologiques',
  affirmations: 'Affirmations',
}

/**
 * Un exemple pour chaque champ, dans les termes du texte retouché.
 *
 * « Le rythme est trop rapide » sous une synthèse ne voudrait rien dire :
 * l'exemple montre le GENRE de remarque qui aide l'IA — un constat précis,
 * puis ce qu'il aurait fallu —, et il doit parler du texte qu'on a sous
 * les yeux.
 */
export const EXEMPLES_RETOUR: Record<CibleRetouche, { probleme: string; attendu: string }> = {
  hypnose: {
    probleme: "Le rythme de l'induction est trop rapide",
    attendu: 'Des phrases plus longues, plus lentes, avec davantage de pauses',
  },
  module: {
    probleme: 'Les étapes restent abstraites',
    attendu: 'Des gestes concrets, rattachés à un moment précis de sa journée',
  },
  consigne: {
    probleme: 'La consigne est trop longue pour un soir de fatigue',
    attendu: 'Trois étapes courtes, faisables en deux minutes',
  },
  synthese: {
    probleme: 'La synthèse interprète au lieu de rapporter',
    attendu: 'Des faits, avec les mots exacts du patient',
  },
  message: {
    probleme: 'Le ton est trop formel',
    attendu: 'Un message plus chaleureux et plus court, qui rappelle un seul exercice',
  },
  proposition: {
    probleme: "L'exercice proposé est trop générique",
    attendu: "Un exercice rattaché à ce qui s'est dit en séance",
  },
  profil: {
    probleme: "Le portrait généralise à partir d'une seule séance",
    attendu: 'Distinguer ce qui est observé de ce qui reste une hypothèse',
  },
  affirmations: {
    probleme: 'Les phrases sont trop longues à dire',
    attendu: 'Des affirmations plus courtes, ancrées dans une sensation du corps',
  },
}

/** L'action du barème qu'une retouche paie : un mouvement d'hypnose coûte plus (server/jetons.ts). */
export function actionDeLaRetouche(cible: CibleRetouche): ActionJetons {
  return cible === 'hypnose' ? 'retouche_hypnose' : 'retouche'
}

/**
 * Les deux réponses de la praticienne, relues avant l'envoi.
 *
 * Le bouton « Optimiser » reste fermé tant qu'un champ est vide ; le serveur
 * refait la même lecture et dit la même chose — un onglet ancien, ou un
 * appel qui ne passe pas par l'écran, n'obtient pas mieux.
 */
export function retourLu(
  probleme: unknown,
  attendu: unknown,
): { ok: true; probleme: string; attendu: string } | { ok: false; message: string } {
  const p = typeof probleme === 'string' ? probleme.trim() : ''
  const a = typeof attendu === 'string' ? attendu.trim() : ''
  if (!p || !a) {
    return {
      ok: false,
      message: "Dites ce que l'IA a mal fait, et ce qui se serait dû passer : les deux réponses guident la retouche.",
    }
  }
  if (p.length > BORNE_RETOUR || a.length > BORNE_RETOUR) {
    return {
      ok: false,
      message: `Chaque réponse tient en ${BORNE_RETOUR.toLocaleString('fr-FR')} caractères au plus : gardez l'essentiel.`,
    }
  }
  return { ok: true, probleme: p, attendu: a }
}

/**
 * Ce qui se retient d'une retouche réussie : la réponse à « Que se serait-il
 * dû passer ? ». C'est une consigne pour la suite ; le constat, lui, portait
 * sur un texte précis et ne vaut que pour lui.
 */
export function preferenceRetenue(attendu: string): string {
  return attendu.trim().slice(0, BORNE_PREFERENCE)
}

/**
 * Ce qui identifie une version d'un texte, pour savoir s'il a changé depuis
 * la retouche : le texte lui-même, ou — pour un module, un profil, une
 * liste — ses champs dans un ordre fixe. La base range les clés d'un objet
 * à sa façon (jsonb) : un brouillon relu n'a pas l'ordre de celui écrit, et
 * ce n'est pas un changement.
 */
export function versionDe(valeur: unknown): string {
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
      )
    }
    return v
  }
  return typeof valeur === 'string' ? valeur : JSON.stringify(stable(valeur)) ?? ''
}

/** Ce que la praticienne répond dans la fenêtre. */
export interface RetourDeLaPraticienne {
  probleme: string
  attendu: string
}

/**
 * Ce qu'une retouche a donné, pour la ligne posée sous le texte.
 *
 * Réussie, elle peut se défaire — la version d'avant est gardée en mémoire
 * par l'écran qui l'a remplacée, et `annuler` la réenregistre. `version`
 * désigne le texte retouché : dès que la praticienne le corrige à la main,
 * « Annuler la retouche » écraserait sa correction, et le lien disparaît.
 */
export type IssueRetouche =
  | {
      ok: true
      annuler?: () => Promise<{ ok: boolean; message: string }>
      version?: string
      /** Ce que la ligne dit, quand « Version retouchée par l'IA » ne suffit pas. */
      libelle?: string
    }
  | {
      ok: false
      message: string
      /** Le statut HTTP, quand le serveur a répondu : 402, ce sont les jetons qui manquent. */
      statut?: number | null
    }
