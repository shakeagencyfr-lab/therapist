/**
 * Ce que la page de vente ne dira jamais.
 *
 * Partagé par les épreuves du contenu (contenu.test.ts) et par le banc de
 * rendu, qui le cherche dans le balisage réellement produit : un mot peut
 * entrer par un composant sans passer par contenu.ts.
 *
 * - Aucun label revendiqué : ni hébergement certifié de données de santé, ni
 *   conformité affirmée comme un tampon. Dire qu'on NE l'a PAS reste permis.
 * - Aucun témoignage, aucun avis de clients, aucune note en étoiles : le
 *   produit n'en a pas encore, et en inventer serait mentir à des soignantes.
 */
/**
 * Une revendication se refuse ; une négation se laisse dire. « Klaro n'est
 * pas certifié HDS » est exactement ce qu'une acheteuse doit pouvoir lire —
 * le sigle seul n'est donc plus interdit, seule l'affirmation l'est. Deux mots
 * au plus peuvent séparer la négation du mot visé (« pas un hébergeur
 * certifié »).
 */
const SANS_NEGATION = String.raw`(?<!\b(?:pas|ni|non|ne|aucun|aucune|sans)\s(?:[\p{L}'’-]+\s){0,2})`
const revendication = (motif: string) => new RegExp(SANS_NEGATION + motif, 'iu')

export const MOTS_INTERDITS: RegExp[] = [
  revendication(String.raw`\b(?:certifi\p{L}*|agré\p{L}*|labellis\p{L}*|homologu\p{L}*)\s+(?:«\s*)?(?:HDS|hébergeur|RGPD)`),
  revendication(String.raw`\bhébergeur\s+(?:[\p{L}'’-]+\s+){0,5}(?:certifié|agréé)`),
  revendication(String.raw`\bHDS\s+(?:certifié|agréé|conforme|compatible|ready)`),
  revendication(String.raw`\b(?:conforme|conformité)\s+(?:au\s+|à\s+la\s+|aux\s+|avec\s+le\s+)?(?:RGPD|HDS)`),
  /t[ée]moignage/i,
  /avis (de )?clients?/i,
  /[★☆⭐]/u,
  /\b\d(?:[,.]\d)?\s*\/\s*5\b(?!\s*(?:jours|min))/,
  /étoiles?/i,
]

/** Les mots interdits trouvés dans un texte — vide quand il est propre. */
export function motsInterditsDans(texte: string): string[] {
  return MOTS_INTERDITS.filter((m) => m.test(texte)).map((m) => String(m))
}
