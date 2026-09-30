/**
 * Qui édite Klaro, et comment la joindre — écrit ici, et nulle part ailleurs.
 *
 * UNE ENTREPRENEUSE INDIVIDUELLE, PAS UNE SOCIÉTÉ. Depuis le 15 mai 2022, une
 * entreprise individuelle se désigne par le nom de la personne, immédiatement
 * précédé ou suivi de « entrepreneur individuel » ou « EI » (code de
 * commerce, art. R526-26 et suivants) — sur les factures, les conditions de
 * vente, les contrats et le site. « LO HYPNOSE » seul, qui n'est qu'un nom
 * commercial, ne suffit pas : c'est pourquoi `EDITRICE` porte les deux.
 *
 * Les pages légales (./contenu) et la page de vente (src/vente/contenu.ts,
 * pour l'adresse de contact) lisent ce module ; il n'importe rien, pour que la
 * page de vente ne télécharge pas le texte des pages légales avec lui.
 */

/** Le nom commercial, tel que l'exploitante l'a choisi. */
export const NOM_COMMERCIAL = 'LO HYPNOSE'

/** La personne qui exploite l'entreprise, et en répond. */
export const EXPLOITANTE = 'Laetitia OLLIVIER'

/** La dénomination complète, avec la mention que la loi impose à une EI. */
export const EDITRICE = `${NOM_COMMERCIAL} — ${EXPLOITANTE}, entrepreneur individuel (EI)`

/** L'adresse de l'établissement, qui est aussi le siège. */
export const ADRESSE = 'Cabinet médical, 2 avenue Saint-Augustin, 06200 Nice, France'

export const SIREN = '532 308 228'
export const SIRET = '532 308 228 00024'
export const CODE_APE = '86.90F'
export const TVA_INTRACOMMUNAUTAIRE = 'FR19532308228'
export const DATE_DE_CREATION = '11 mai 2011'
export const TELEPHONE = '+33 6 20 71 96 30'

/**
 * L'adresse de contact publique : questions, données personnelles,
 * signalements de contenus. Une seule, pour qu'aucune demande ne se perde
 * entre deux boîtes.
 */
export const COURRIEL = 'contact@klaroweb.site'
