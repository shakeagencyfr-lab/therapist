/**
 * Ce qu'affiche l'écran verrouillé quand la personne suivie a choisi la
 * discrétion — c'est-à-dire tant qu'elle n'a rien choisi (0055).
 *
 * UN TÉLÉPHONE POSÉ SUR UNE TABLE SE LIT PAR-DESSUS L'ÉPAULE. « Votre
 * exercice pour les crises du soir » sur un écran verrouillé dit à qui passe
 * qu'il y a un suivi, et pour quoi. Ces textes ne disent rien : ni le motif,
 * ni la thérapeute, ni même qu'il s'agit d'un soin. Le mot se lit en ouvrant
 * l'espace, derrière sa connexion.
 *
 * Ils sont écrits TROIS fois, et c'est voulu : en base (0055, qui les pose
 * elle-même pour que le contenu ne sorte pas), sur le serveur qui les
 * reprend si une base plus ancienne lui rendait autre chose, et à l'écran
 * de la personne, qui voit l'aperçu exact de ce qu'elle recevra. L'épreuve
 * src/lib/rappelsReguliers.test.ts vérifie que la base et ce fichier disent
 * mot pour mot la même chose.
 *
 * Aucun import : le serveur lit ce fichier tel quel.
 */

export interface TexteRappel {
  titre: string
  corps: string
}

/** Un mot du cabinet, masqué. */
export const MOT_MASQUE: TexteRappel = {
  titre: 'Un nouveau mot dans votre espace',
  corps: 'Il se lit en ouvrant votre espace.',
}

/** Le rappel du soir, masqué : il ne dit pas ce qu'il rappelle. */
export const SOIR_MASQUE: TexteRappel = {
  titre: 'Un rappel de votre espace',
  corps: "C'est l'heure que vous aviez choisie.",
}

/** Le titre du rappel du soir affiché en clair ; le corps est la question du soir. */
export const SOIR_EN_CLAIR_TITRE = 'Votre note du soir'

/** La question du soir quand la thérapeute n'en a réglé aucune. */
export const QUESTION_DU_SOIR_PAR_DEFAUT = 'Où en êtes-vous ce soir ?'

/**
 * Le texte qui part vers l'écran verrouillé.
 *
 * SEUL UN « NON » EXPLICITE MONTRE LE CONTENU. `masque` absent — une base où
 * 0055 n'est pas encore passée, une ligne mal lue — vaut masqué : c'est le
 * défaut que la personne n'a pas eu à choisir, et une erreur dans ce sens-là
 * ne coûte qu'un geste d'ouverture.
 */
export function texteAAfficher(
  rappel: TexteRappel & { masque?: boolean | null },
  neutre: TexteRappel = MOT_MASQUE,
): TexteRappel {
  if (rappel.masque !== false) return { titre: neutre.titre, corps: neutre.corps }
  return { titre: rappel.titre, corps: rappel.corps }
}
