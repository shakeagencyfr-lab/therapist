/**
 * Ce que la page de vente ne dira jamais.
 *
 * Partagé par les épreuves du contenu (contenu.test.ts) et par le banc de
 * rendu, qui le cherche dans le balisage réellement produit : un mot peut
 * entrer par un composant sans passer par contenu.ts.
 *
 * - Aucun label revendiqué : ni hébergement certifié de données de santé, ni
 *   conformité affirmée comme un tampon.
 * - Aucun témoignage, aucun avis de clients, aucune note en étoiles : le
 *   produit n'en a pas encore, et en inventer serait mentir à des soignantes.
 */
export const MOTS_INTERDITS: RegExp[] = [
  /\bHDS\b/,
  /t[ée]moignage/i,
  /avis (de )?clients?/i,
  /[★☆⭐]/u,
  /\b\d(?:[,.]\d)?\s*\/\s*5\b(?!\s*(?:jours|min))/,
  /étoiles?/i,
  /conforme\s+(?:au\s+)?RGPD/i,
  /certifi(?:é|ée|cation)\s+(?:HDS|hébergeur)/i,
]

/** Les mots interdits trouvés dans un texte — vide quand il est propre. */
export function motsInterditsDans(texte: string): string[] {
  return MOTS_INTERDITS.filter((m) => m.test(texte)).map((m) => String(m))
}
