/**
 * Les trois principes de l'application patient, affichés à côté de la maquette
 * téléphone.
 *
 * Données de démonstration reprises du prototype. Dans le produit réel elles
 * viennent de l'API : données de santé, chiffrées en transit et au repos, chez
 * un hébergeur certifié HDS.
 */

/** Un principe de conception de l'espace patient. */
export interface Principle {
  title: string
  body: string
}

export const PRINCIPLES: Principle[] = [
  {
    title: 'Une tâche, pas un tableau de bord',
    body: "Le patient n'a jamais plus de trois actions devant lui. Le reste est masqué.",
  },
  {
    title: 'La voix de sa thérapeute',
    body: 'Les audios sont enregistrés pour lui, nommés par elle, et restent disponibles hors connexion.',
  },
  {
    title: "Il choisit ce qu'il partage",
    body: 'Chaque note de journal peut rester privée. Les échelles, elles, sont toujours visibles côté cabinet.',
  },
]
