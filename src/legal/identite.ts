/**
 * Qui édite Klaro, et comment la joindre — écrit ici, et nulle part ailleurs.
 *
 * UNE ENTREPRISE INDIVIDUELLE, NOMMÉE PAR SON NOM COMMERCIAL. Le code de
 * commerce (art. R526-26 et suivants) demande qu'une EI se désigne par le nom
 * de la personne suivi de « EI » ; l'exploitante a choisi, le 30 septembre
 * 2026, que son nom n'apparaisse nulle part sur le site : `EDITRICE` porte
 * donc le nom commercial et la mention EI, et rien d'autre. Le SIREN, lui,
 * reste publié — la loi l'exige, et il suffit à identifier l'entreprise.
 *
 * Les pages légales (./contenu) et la page de vente (src/vente/contenu.ts,
 * pour l'adresse de contact) lisent ce module ; il n'importe rien, pour que la
 * page de vente ne télécharge pas le texte des pages légales avec lui.
 */

/** Le nom commercial, tel que l'exploitante l'a choisi. */
export const NOM_COMMERCIAL = 'LO HYPNOSE'

/** Qui exploite l'entreprise, dit sans son nom (choix de l'exploitante). */
export const EXPLOITANTE = `l’exploitante de ${NOM_COMMERCIAL}`

/** La dénomination, avec la mention EI. */
export const EDITRICE = `${NOM_COMMERCIAL}, entrepreneur individuel (EI)`

/** L'adresse de l'établissement, qui est aussi le siège. */
export const ADRESSE = '2 avenue Saint-Augustin, 06200 Nice, France'

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
