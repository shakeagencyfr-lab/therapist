/**
 * Ce qui est écrit avec l'IA le dit — à la personne qui le lit, et au
 * fichier qui le porte.
 *
 * DEUX EXIGENCES, UNE PHRASE. Le règlement européen sur l'intelligence
 * artificielle (UE 2024/1689, art. 50) veut que les contenus générés soient
 * signalés, et marqués d'une façon lisible par une machine ; la politique
 * d'usage du fournisseur du modèle, pour un usage qui touche à la santé, veut
 * qu'un professionnel relise avant diffusion et que l'usage de l'IA soit dit
 * à la personne. D'où la phrase de l'espace patient, et les propriétés des
 * documents exportés.
 *
 * SANS MARQUE, SANS MODÈLE. L'espace patient et les documents sont à la
 * marque du cabinet : ni Klaro, ni le nom d'un modèle n'y figurent.
 */

/** La ligne du pied de l'espace patient. */
export const MENTION_IA =
  'Certains contenus de cet espace sont préparés avec l’aide d’un outil d’intelligence artificielle, puis relus et validés par votre praticien.'

/**
 * Les propriétés d'un document rédigé avec l'IA (jsPDF `setProperties`) :
 * le « sujet » et les « mots-clés » du fichier, que les lecteurs de PDF et
 * les outils d'indexation lisent sans l'ouvrir.
 *
 * SANS APOSTROPHE COURBE. Les propriétés d'un PDF s'écrivent dans un jeu de
 * caractères où « ’ » n'existe pas : le texte est tourné pour s'en passer.
 */
export const PROPRIETES_IA = {
  subject:
    'Texte rédigé avec assistance par intelligence artificielle, puis relu et validé par le praticien.',
  keywords: 'intelligence artificielle, contenu généré par IA, relu et validé par le praticien',
} as const

/**
 * Le dossier exporté : une partie seulement vient de l'IA — les synthèses de
 * séance, validées à l'envoi de la note, et le profil. Le reste est écrit
 * par le cabinet et par la personne.
 */
export const PROPRIETES_IA_DOSSIER = {
  subject:
    'Dossier de suivi. Les synthèses de séance et le profil sont rédigés avec assistance par intelligence artificielle, puis relus par le praticien.',
  keywords: 'dossier de suivi, intelligence artificielle, contenu en partie généré par IA, relu par le praticien',
} as const
