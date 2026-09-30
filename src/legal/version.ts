/**
 * La version des documents légaux de la plateforme — et rien d'autre.
 *
 * C'EST UNE DATE, ET C'EST AUSSI CE QU'ON ACCEPTE. Elle s'affiche en tête des
 * quatre pages (src/legal/PageLegale.tsx) ; c'est elle que la case « J'ai lu
 * et j'accepte » enregistre, à la demande d'essai (server/demandes.ts) comme
 * à l'entrée dans l'espace (src/auth/GardeConditions.tsx, 0067). La changer,
 * c'est redemander l'accord de chaque compte à sa prochaine entrée : on ne la
 * change que pour une révision réelle des documents, pas pour une virgule.
 *
 * CE MODULE N'IMPORTE RIEN. Le serveur le lit tel quel (Node, sans alias), et
 * l'application le tire sans télécharger le texte des pages.
 */

/** La date de la dernière révision des documents, telle qu'elle s'affiche. */
export const MISE_A_JOUR = '30 septembre 2026'

/**
 * La forme d'une version : une date écrite en toutes lettres, « 1er » compris.
 *
 * La base refuse toute autre forme (0067, `accepter_conditions`, même motif) :
 * un compte ne peut pas remplir sa table d'acceptations de versions
 * inventées. Une date qui changerait de forme ici sans la migration ferait
 * refuser chaque acceptation — legal.test.ts relit les deux.
 */
export const FORME_DE_VERSION =
  /^(1er|[1-9]|[12][0-9]|3[01]) (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) 20[0-9]{2}$/
