/**
 * Captation de séance : points de consentement, transcriptions d'exemple et
 * raccourcis de prise de notes.
 *
 * Données de démonstration reprises du prototype. Dans le produit réel elles
 * viennent de l'API : données de santé, chiffrées en transit et au repos, chez
 * un hébergeur certifié HDS.
 */

/**
 * Points lus au patient avant d'enregistrer. Le consentement est bloquant.
 *
 * Ils se lisent à voix haute devant la personne : le troisième la nomme, il
 * prend donc son prénom plutôt qu'un exemple.
 */
export function consentPoints(prenom: string): string[] {
  return [
    "La séance est transcrite en texte. L'enregistrement sonore est détruit dès la transcription terminée, il n'est stocké nulle part.",
    "La note produite est un brouillon. Elle n'entre au dossier qu'après relecture et validation de la thérapeute.",
    `${prenom} peut demander la suppression de la transcription à tout moment, sans justification, depuis son espace.`,
    'Les données sont hébergées en France chez un hébergeur agréé données de santé. Aucun transfert hors Union européenne.',
  ]
}

/** Boutons d'horodatage sous la zone de notes (libellé du bouton). */
export const NOTE_TAGS: string[] = ['Horodater', 'Mot du patient', 'À reprendre', 'Vigilance', 'Module à donner']

/** Préfixe inséré dans la note après l'horodatage, par libellé de bouton. */
export const NOTE_TAG_PREFIXES: Record<string, string> = {
  Horodater: '',
  'Mot du patient': 'mot du patient : ',
  'À reprendre': 'à reprendre : ',
  Vigilance: 'vigilance : ',
  'Module à donner': 'module à donner : ',
}
