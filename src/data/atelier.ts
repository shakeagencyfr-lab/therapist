/**
 * Atelier de modules : amorces d'intention, types proposés et bibliothèque des
 * modules du cabinet.
 *
 * Données de démonstration reprises du prototype. Dans le produit réel elles
 * viennent de l'API : données de santé, chiffrées en transit et au repos, chez
 * un hébergeur certifié HDS.
 */
import type { ModuleKind, PatientModule } from '@/types/domain'

/** Amorces proposées sous le champ d'intention (libellé du bouton). */
export const ATELIER_SEEDS: string[] = [
  'Gérer les vingt minutes après une contrariété',
  'Couper la liste de quatre heures du matin',
  'Préparer une prise de parole courte',
]

/** Le brief complet écrit dans le champ quand on clique sur une amorce. */
export const ATELIER_SEED_BRIEFS: Record<string, string> = {
  'Gérer les vingt minutes après une contrariété': "Donner à Camille quelque chose de précis à faire dans les vingt minutes qui suivent une contrariété, sans chercher à empêcher l'envie de fumer.",
  'Couper la liste de quatre heures du matin': "Aider Nadia quand elle se réveille à quatre heures du matin et que la liste de tout ce qui l'attend se met à défiler.",
  'Préparer une prise de parole courte': "Préparer Sofia à une intervention de quelques phrases en réunion, en s'appuyant sur la sensation du sol sous les pieds qui fonctionne déjà.",
}

/** Types de module que l'atelier sait rédiger. */
export const ATELIER_TYPES: ModuleKind[] = ['Exercice', 'Journal', 'Écriture', 'Visualisation']

/** Modules déjà écrits par le cabinet, réutilisables tels quels. */
export const ATELIER_LIBRARY: PatientModule[] = [
  {
    title: 'Respiration en cohérence cardiaque',
    meta: 'Matin et soir · 5 min',
    kind: 'Exercice',
    done: false,
  },
  {
    title: "Écoute de l'induction « Retour au calme »",
    meta: 'Au moment du besoin · 6 min',
    kind: 'Audio',
    done: false,
  },
  {
    title: 'Noter les trois moments les plus calmes de la journée',
    meta: 'Chaque soir',
    kind: 'Journal',
    done: false,
  },
  {
    title: 'Auto-évaluation hebdomadaire',
    meta: 'Chaque dimanche',
    kind: 'Échelle',
    done: false,
  },
  {
    title: 'Lettre à soi-même dans six mois',
    meta: 'Avant la prochaine séance',
    kind: 'Écriture',
    done: false,
  },
]
