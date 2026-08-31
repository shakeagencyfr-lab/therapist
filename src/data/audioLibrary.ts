/**
 * Bibliothèque audio du cabinet.
 *
 * Données de démonstration reprises du prototype. Dans le produit réel elles
 * viennent de l'API : données de santé, chiffrées en transit et au repos, chez
 * un hébergeur certifié HDS.
 */
import type { LibraryAudio } from '@/types/domain'

/** Rayons de la bibliothèque. La thérapeute peut en créer d'autres à la volée. */
export const AUDIO_CATEGORIES: string[] = ['Détente', 'Sommeil', 'Ancrage', 'Confiance', 'Dépendance', 'Émotions']

export const AUDIO_LIBRARY: LibraryAudio[] = [
  {
    id: 'a1',
    title: 'Ancrage du souffle',
    cat: 'Ancrage',
    duration: '14:00',
    meta: 'Enregistré le 12 juin',
  },
  {
    id: 'a2',
    title: 'Le lieu sûr',
    cat: 'Détente',
    duration: '18:20',
    meta: 'Enregistré le 3 mai',
  },
  {
    id: 'a3',
    title: 'Retour au calme, version courte',
    cat: 'Détente',
    duration: '05:50',
    meta: 'Version raccourcie du lieu sûr',
  },
  {
    id: 'a4',
    title: 'Descente vers le sommeil',
    cat: 'Sommeil',
    duration: '22:40',
    meta: 'Enregistré le 21 août',
  },
  {
    id: 'a5',
    title: 'Le compte à rebours inversé',
    cat: 'Sommeil',
    duration: '11:15',
    meta: 'Pour les réveils de la nuit',
  },
  {
    id: 'a6',
    title: 'Ancrage de la voix',
    cat: 'Confiance',
    duration: '08:15',
    meta: 'Avant une prise de parole',
  },
  {
    id: 'a7',
    title: 'La scène réussie',
    cat: 'Confiance',
    duration: '12:05',
    meta: 'Visualisation guidée',
  },
  {
    id: 'a8',
    title: 'La dernière cigarette',
    cat: 'Dépendance',
    duration: '16:30',
    meta: 'Programme Liberté, séance 3',
  },
  {
    id: 'a9',
    title: 'Laisser passer la vague',
    cat: 'Émotions',
    duration: '09:45',
    meta: 'Envie forte, colère, agitation',
  },
]
