/**
 * Les images du cabinet dans NOTRE stockage : ordre des photos, et ménage.
 *
 * DEUX COMPARTIMENTS PUBLICS, `sites` et `logos`. Une image y est lisible par
 * quiconque connaît son adresse, et c'est voulu : la page publique et la
 * porte des patients s'affichent avant toute connexion. Mais « retirer » une
 * photo ne faisait que l'ôter de la liste — le fichier restait en ligne, à
 * une adresse qui a pu être publiée et mise en cache. Une photo déposée par
 * erreur, personnelle peut-être, ne disparaissait jamais.
 *
 * Ce module dit QUEL fichier effacer. Il ne rend un chemin que pour une image
 * de notre stockage, dans le bon compartiment, sous le dossier du cabinet :
 * une adresse d'ailleurs, ou celle d'un autre cabinet, ne donne rien — les
 * politiques du compartiment le refuseraient de toute façon, mais on ne leur
 * demande pas.
 *
 * Pur, sans client ni environnement : le serveur et le navigateur s'en
 * servent tous les deux, chacun avec l'adresse de la base qu'il connaît.
 */

export type Compartiment = 'sites' | 'logos'

/** Le chemin d'un fichier dans le compartiment, ou null s'il n'est pas à ce cabinet. */
export function cheminStockage(
  url: string | null | undefined,
  base: string,
  compartiment: Compartiment,
  cabinetId: string,
): string | null {
  const racine = base.trim().replace(/\/+$/, '')
  if (!url || !racine || !cabinetId) return null
  const prefixe = `${racine}/storage/v1/object/public/${compartiment}/`
  if (!url.startsWith(prefixe)) return null
  let chemin: string
  try {
    chemin = decodeURIComponent(url.slice(prefixe.length).split(/[?#]/)[0] ?? '')
  } catch {
    return null
  }
  if (!chemin.startsWith(`${cabinetId}/`) || chemin.split('/').some((p) => p === '..' || p === '')) {
    return null
  }
  return chemin
}

/**
 * Les fichiers à effacer après un enregistrement : ceux que la version
 * précédente montrait et que la nouvelle ne montre plus.
 *
 * Seulement ceux-là. Effacer tout ce que le dossier contient d'autre
 * emporterait une photo que la thérapeute vient de déposer dans un autre
 * onglet, pas encore enregistrée.
 */
export function photosRetirees(
  avant: Array<{ url: string }>,
  apres: Array<{ url: string }>,
  base: string,
  cabinetId: string,
): string[] {
  const gardees = new Set(apres.map((p) => p.url))
  const chemins = avant
    .filter((p) => !gardees.has(p.url))
    .map((p) => cheminStockage(p.url, base, 'sites', cabinetId))
    .filter((c): c is string => c !== null)
  return [...new Set(chemins)]
}

/**
 * Combien de temps une copie de photo Google attend d'être gardée.
 *
 * L'import recopie les photos de la fiche dans notre stockage, sous un nom
 * neuf, et les verse au BROUILLON. Un brouillon abandonné — onglet fermé,
 * import refait, photos écartées avant d'enregistrer — laissait ses copies
 * en ligne pour toujours, publiques à leur adresse. Passé ce délai, une
 * copie que la page enregistrée ne montre pas est effacée. Sept jours : un
 * brouillon qu'on reprend le lendemain garde les siennes.
 */
export const GARDE_DES_COPIES_GOOGLE_MS = 7 * 24 * 60 * 60 * 1000

/** Le nom que `recopierPhoto` (server/sites.ts) donne à une copie : rien d'autre ne s'efface ici. */
const COPIE_GOOGLE = /^google-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/

/**
 * Les copies Google du dossier du cabinet que plus rien ne montre.
 *
 * `fichiers` : le contenu de `<cabinet>/site`, tel que le stockage le liste.
 * Une copie sans date lisible est gardée : dans le doute, on n'efface pas.
 * Une photo déposée à la main n'a pas ce nom, et n'est jamais concernée.
 */
export function copiesGoogleOubliees(
  fichiers: Array<{ name: string; created_at?: string | null }>,
  gardees: Array<{ url: string }>,
  base: string,
  cabinetId: string,
  maintenant: number,
): string[] {
  const montrees = new Set(gardees.map((p) => cheminStockage(p.url, base, 'sites', cabinetId)))
  return fichiers
    .filter((f) => COPIE_GOOGLE.test(f.name))
    .filter((f) => {
      const creee = Date.parse(f.created_at ?? '')
      return Number.isFinite(creee) && maintenant - creee > GARDE_DES_COPIES_GOOGLE_MS
    })
    .map((f) => `${cabinetId}/site/${f.name}`)
    .filter((chemin) => !montrees.has(chemin))
}

/** Déplacer une photo d'un rang vers un autre. Hors bornes : rien ne bouge. */
export function deplacer<T>(photos: T[], de: number, vers: number): T[] {
  if (de === vers || de < 0 || vers < 0 || de >= photos.length || vers >= photos.length) return photos
  const suite = [...photos]
  const [photo] = suite.splice(de, 1)
  suite.splice(vers, 0, photo as T)
  return suite
}

/**
 * Mettre une photo en couverture.
 *
 * La couverture est la PREMIÈRE photo : c'est elle que la page met en grand
 * sous le titre. Les autres gardent leur ordre, décalées d'un rang.
 */
export function mettreEnCouverture<T>(photos: T[], rang: number): T[] {
  return deplacer(photos, rang, 0)
}
