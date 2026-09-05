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
 * Ils se lisent à voix haute devant la personne : l'un d'eux la nomme, il
 * prend donc son prénom plutôt qu'un exemple.
 *
 * TROIS D'ENTRE EUX ÉTAIENT FAUX, et c'est le pire endroit du produit pour
 * l'être — on les prononce avant d'enregistrer une séance d'hypnothérapie.
 *
 * 1. « … depuis son espace » : aucun écran de l'espace patient ne permettait
 *    de révoquer quoi que ce soit. La révocation passe par la thérapeute, et
 *    c'est ce que la phrase dit maintenant.
 * 2. « Aucun transfert hors Union européenne » : la transcription part chez
 *    Anthropic pour être analysée. C'est le cœur du produit ; le taire dans
 *    le consentement revenait à obtenir un accord sur autre chose.
 * 3. « hébergeur agréé données de santé » : le dossier est bien en France
 *    (région Paris), mais l'agrément HDS est un contrat que le produit ne
 *    peut pas affirmer à la place de qui l'a signé. On dit le vérifiable.
 *
 * CES PHRASES ENGAGENT LE CABINET. Elles décrivent ce que le code fait
 * aujourd'hui ; leur formulation juridique reste à valider par qui exploite
 * le produit.
 */
export function consentPoints(prenom: string): string[] {
  return [
    "La séance est transcrite en texte. L'enregistrement sonore est détruit dès la transcription terminée, il n'est stocké nulle part.",
    "La transcription est envoyée à un service d'analyse (Anthropic), dont les serveurs sont hors de l'Union européenne. Elle y transite le temps d'écrire la note, et rien du dossier ne l'accompagne.",
    "La note produite est un brouillon : elle n'entre au dossier qu'après relecture et validation de la thérapeute. La transcription brute est supprimée à ce moment-là.",
    `${prenom} peut demander l'arrêt de l'enregistrement, ou la suppression de ce qui a déjà été pris, à tout moment et sans justification, en le disant à sa thérapeute.`,
    'Le dossier est hébergé en France, en région parisienne, et seules les personnes du cabinet y ont accès.',
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
