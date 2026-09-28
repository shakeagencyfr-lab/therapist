/**
 * Le texte tel que les polices de base d'un PDF savent l'écrire.
 *
 * jsPDF écrit avec les polices standard (Helvetica, Times) en WinAnsi : les
 * accents, les guillemets français, l'apostrophe typographique, « € » et
 * « œ » passent. Mais UN SEUL caractère hors de ce jeu — une émoji dans le
 * journal d'un patient, l'espace fine insécable que `toLocaleString('fr-FR')`
 * glisse dans « 1 200 » — fait basculer TOUTE la chaîne dans un autre
 * encodage, et la ligne sort en caractères illisibles. Constaté : une page
 * de journal terminée par un smiley devenait une suite de symboles.
 *
 * On ne supprime donc pas « au cas où » : on remplace ce qui a un équivalent
 * (espaces, flèches, tirets) et l'on retire le reste, plutôt que de laisser
 * un caractère ruiner le paragraphe entier.
 */

/** Les 27 caractères que WinAnsi place entre 0x80 et 0x9F. */
const WINANSI_ETENDU = new Set(
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split('').map((c) => c.codePointAt(0) as number),
)

/** Ce qui a un équivalent lisible. */
const EQUIVALENTS: Record<string, string> = {
  ' ': ' ', // espace fine insécable (nombres et ponctuation en fr-FR)
  ' ': ' ', // espace fine
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '\t': ' ',
  '‐': '-',
  '‑': '-',
  '‒': '–',
  '−': '-',
  '→': '->',
  '←': '<-',
  '≤': '<=',
  '≥': '>=',
  '′': "'",
  '″': '"',
  '­': '',
}

/** Un caractère que la police de base sait écrire tel quel. */
function ecrivable(cp: number): boolean {
  return cp === 0x0a || (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WINANSI_ETENDU.has(cp)
}

/**
 * Le texte prêt pour jsPDF : accents recomposés, espaces exotiques rendues
 * ordinaires, tout le reste retiré. Les retours à la ligne sont gardés — le
 * découpage en paragraphes se fait après.
 */
export function pourPdf(texte: string | null | undefined): string {
  if (!texte) return ''
  let sortie = ''
  for (const c of texte.normalize('NFC').replace(/\r\n?/g, '\n')) {
    const equivalent = EQUIVALENTS[c]
    if (equivalent !== undefined) {
      sortie += equivalent
      continue
    }
    const cp = c.codePointAt(0) as number
    if (ecrivable(cp)) sortie += c
  }
  // Un caractère retiré laisse parfois deux espaces : on n'en garde qu'une.
  return sortie.replace(/ {2,}/g, ' ')
}

/**
 * Un nom de fichier lisible dans un dossier de téléchargements : sans accent,
 * sans espace, sans caractère qu'un système de fichiers refuserait.
 */
export function segmentDeFichier(texte: string, longueur = 40): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, longueur)
}
