/**
 * Atelier de modules : les amorces d'intention proposées sous le champ, et les
 * quatre types qu'un module peut prendre.
 *
 * Ce sont des suggestions d'écran, pas des données : le module lui-même est
 * écrit par l'IA à partir de l'intention, puis relu et corrigé.
 */
import type { ModuleKind } from '@/types/domain'

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

/* `ATELIER_LIBRARY` vivait ici : trente lignes de modules d'exemple,
   exportées et importées par personne depuis que l'atelier écrit ses modules
   avec l'IA. Un jeu de données mortes finit par être relu comme un jeu de
   données vivantes. */
