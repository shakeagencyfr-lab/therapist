/**
 * Le logo du cabinet, prêt à poser dans un PDF.
 *
 * Seule une image de NOTRE stockage est chargée (imageDeNous) : une note
 * d'honoraires ne va rien chercher chez un tiers. L'image est lue en
 * mémoire (fetch, puis createImageBitmap), redessinée sur un canevas et
 * rendue en PNG : jsPDF ne lit ni le WebP de tous les navigateurs, ni une
 * adresse `blob:` que la politique de contenu refuse.
 *
 * Tout échec rend null, et la pièce s'imprime sans logo : un logo absent ne
 * doit jamais empêcher de remettre une note à un patient.
 */
import { imageDeNous } from '@/lib/vitrine'

export interface LogoPdf {
  dataUrl: string
  largeur: number
  hauteur: number
}

/** Le côté le plus long, en pixels : assez net à l'impression, assez léger pour le fichier. */
const COTE_MAX = 400

export async function logoPourPdf(url: string | null | undefined): Promise<LogoPdf | null> {
  if (!url || !imageDeNous(url)) return null
  try {
    const reponse = await fetch(url, { signal: AbortSignal.timeout(6_000) })
    if (!reponse.ok) return null
    const image = await createImageBitmap(await reponse.blob())
    const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height))
    const largeur = Math.max(1, Math.round(image.width * echelle))
    const hauteur = Math.max(1, Math.round(image.height * echelle))
    const canevas = document.createElement('canvas')
    canevas.width = largeur
    canevas.height = hauteur
    const ctx = canevas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(image, 0, 0, largeur, hauteur)
    image.close()
    return { dataUrl: canevas.toDataURL('image/png'), largeur, hauteur }
  } catch {
    return null
  }
}

/**
 * La place du logo sur la page : au plus `hauteurMax` de haut et
 * `largeurMax` de large, proportions gardées.
 */
export function cadreDuLogo(logo: Pick<LogoPdf, 'largeur' | 'hauteur'>, largeurMax: number, hauteurMax: number) {
  const echelle = Math.min(largeurMax / logo.largeur, hauteurMax / logo.hauteur)
  return { largeur: logo.largeur * echelle, hauteur: logo.hauteur * echelle }
}
