/**
 * Notifications ciblées : filtres, modèles de message et moments d'envoi.
 *
 * Données de démonstration reprises du prototype. Dans le produit réel elles
 * viennent de l'API : données de santé, chiffrées en transit et au repos, chez
 * un hébergeur certifié HDS.
 */
import type { AdherenceFilter } from '@/state/state'

/** Programmes servant de filtre de ciblage. */

/** Une tranche d'assiduité du ciblage. */
export interface NotifAdherenceOption {
  value: AdherenceFilter
  label: string
}

export const NOTIF_ADHERENCE_OPTIONS: NotifAdherenceOption[] = [
  { value: 'all', label: 'Tous' },
  { value: 'low', label: 'Moins de 50 %' },
  { value: 'mid', label: '50 à 75 %' },
  { value: 'high', label: 'Plus de 75 %' },
]

/** Un modèle de notification, qui remplit le titre et le message. */
export interface NotifTemplate {
  label: string
  title: string
  message: string
}

export const NOTIF_TEMPLATES: NotifTemplate[] = [
  {
    label: 'Relance douce',
    title: 'Un mot de Laetitia',
    message: "Rien d'urgent. Si la semaine a été dense, prenez seulement l'audio de dix minutes, le reste attendra la séance.",
  },
  {
    label: "Rappel d'écoute",
    title: 'Votre audio vous attend',
    message: "L'induction enregistrée pour vous n'a pas encore été écoutée. Elle fonctionne mieux le soir, au calme, casque sur les oreilles.",
  },
  {
    label: 'Reprise de rendez-vous',
    title: 'On reprend ?',
    message: "Il reste une séance à votre programme. Un créneau vous attend dans l'agenda, choisissez celui qui vous arrange.",
  },
]

/** Moments d'envoi proposés. */
