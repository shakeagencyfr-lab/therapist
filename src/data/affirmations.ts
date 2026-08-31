/**
 * Affirmations de la semaine, par patient, et mode de publication.
 *
 * Données de démonstration reprises du prototype. Dans le produit réel elles
 * viennent de l'API : données de santé, chiffrées en transit et au repos, chez
 * un hébergeur certifié HDS.
 */
import type { PatientId } from '@/types/domain'

export const INITIAL_AFFIRMATIONS: Record<PatientId, string[]> = {
  camille: [
    'Je respire librement, et mon air est à moi.',
    'Je suis libre, et mon corps connaît cette liberté.',
    'Je choisis, calmement, et mon choix tient.',
  ],
  marc: [
    "Je suis calme, et ce calme m'appartient.",
    "Mon corps sait revenir au calme, il l'a appris.",
  ],
}

/** true = génération automatique le lundi, false = édition manuelle. */
export const INITIAL_AFF_AUTO: Record<PatientId, boolean> = { camille: true, marc: true }
