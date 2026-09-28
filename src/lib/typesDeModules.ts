/**
 * Ce qu'un module demande au patient — et ce que l'assiduité peut en dire.
 *
 * DEUX TYPES N'ONT JAMAIS ÉTÉ DES TÂCHES. L'espace du patient donne aux
 * audios et à l'échelle du soir leur propre place — sa liste d'écoutes, la
 * carte de la note du soir — et ne montre donc jamais un module « Audio » ou
 * « Échelle » parmi ce qu'il a à faire (src/patient/PatientSpace.tsx). Un tel
 * module ne peut pas être coché : écouter un audio ne coche rien, noter sa
 * soirée non plus.
 *
 * Le brouillon de séance en proposait pourtant, et l'envoi les versait au
 * parcours. Constaté en production : deux « Audio » et deux « Échelle », tous
 * non faits, dont deux payés d'une consigne que personne ne lirait — et tous
 * comptés dans l'assiduité, qui baissait d'autant, jusqu'à signaler un
 * décrochage pour des exercices que le patient n'a jamais vus.
 *
 * La règle vit ici, une seule fois : le serveur y lit ce que l'IA a le droit
 * de proposer, le cabinet ce qu'il compte. Aucun import de l'application :
 * le serveur charge ce fichier tel quel.
 */
import type { ModuleKind } from '../types/domain'

/**
 * Tous les types de module, pour reconnaître une valeur reçue de l'extérieur.
 *
 * Un enregistrement plutôt qu'une liste : la compilation refuse qu'il en
 * manque un, et un type ajouté à ModuleKind sans passer ici casserait le
 * build au lieu d'être refusé en silence par le serveur.
 */
const TOUS_LES_TYPES: Record<ModuleKind, true> = {
  Audio: true,
  Exercice: true,
  Journal: true,
  Échelle: true,
  Écriture: true,
  Séance: true,
  Formulaire: true,
  Visualisation: true,
  Module: true,
}

/** La valeur reçue est-elle un type de module ? Sinon, `null`. */
export function typeDeModule(valeur: unknown): ModuleKind | null {
  return typeof valeur === 'string' && Object.hasOwn(TOUS_LES_TYPES, valeur) ? (valeur as ModuleKind) : null
}

/** Les types que l'espace du patient ne présente jamais comme une tâche. */
const HORS_DES_TACHES: readonly ModuleKind[] = ['Audio', 'Échelle']

/**
 * Ce module est-il une tâche que le patient voit, fait et coche ?
 *
 * C'est la seule question que l'assiduité a le droit de poser : un module
 * qui ne se fait pas ne peut ni compter comme fait, ni comme manqué.
 */
export function seFaitParLePatient(kind: ModuleKind): boolean {
  return !HORS_DES_TACHES.includes(kind)
}

/**
 * Les types qu'un brouillon de séance peut proposer.
 *
 * Ni « Audio » ni « Échelle » : l'audio se propose déjà par les rayons de la
 * bibliothèque (`categories_audio`), qui envoient de vrais enregistrements ;
 * la note du soir existe déjà pour chaque patient. Un module de plus pour
 * l'un ou l'autre n'ajoutait qu'une case impossible à cocher.
 */
export const TYPES_PROPOSABLES = ['Exercice', 'Journal', 'Écriture'] as const satisfies readonly ModuleKind[]
