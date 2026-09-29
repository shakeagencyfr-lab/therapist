/**
 * Le titre et la description du document, réglés depuis la page.
 *
 * POURQUOI CE N'EST PAS DANS LE HTML. Les trois documents du produit sont
 * servis identiques à tout le monde : le même index.html rend l'application
 * ET la page publique de n'importe quel cabinet. Un titre écrit en dur y
 * affiche « Klaro » dans l'onglet d'une thérapeute qui a payé pour que son
 * fournisseur ne se voie nulle part — la marque blanche fuyait par le seul
 * endroit qu'on ne pense pas à regarder.
 *
 * CE QUE ÇA VAUT POUR LES MOTEURS. Le titre et la description posés ici sont
 * lus par les robots qui exécutent le script — c'est le cas de Google. Un
 * rendu côté serveur les servirait à tous ; en attendant, mieux vaut un titre
 * juste pour la plupart qu'un titre faux pour tout le monde.
 */
import { useEffect } from 'react'
import { KLARO } from '@/theme/klaro'

function poser(nom: string, contenu: string) {
  if (!contenu) return
  let balise = document.head.querySelector<HTMLMetaElement>(`meta[name="${nom}"]`)
  if (!balise) {
    balise = document.createElement('meta')
    balise.setAttribute('name', nom)
    document.head.appendChild(balise)
  }
  balise.setAttribute('content', contenu)
}

/**
 * Pose le titre de l'onglet, et la description quand il y en a une.
 *
 * Passer une chaîne vide ne fait rien : on ne remplace pas un titre juste par
 * un titre vide le temps qu'une requête revienne.
 */
export function useEnTete(titre: string, description?: string) {
  useEffect(() => {
    if (!titre) return
    const avant = document.title
    document.title = titre
    if (description) poser('description', description)
    return () => {
      document.title = avant
    }
  }, [titre, description])
}

/** Le titre d'une page de cabinet : son nom d'abord, ce qu'il fait ensuite. */
export function titreDuCabinet(nom: string, surTitre?: string | null): string {
  const propre = nom.trim()
  if (!propre) return ''
  const suite = (surTitre ?? '').trim()
  return suite ? `${propre} — ${suite}` : propre
}

/**
 * Pose l'icône d'onglet de Klaro, et rend de quoi la retirer.
 *
 * Seulement sur les pages de Klaro : index.html, servi identique au domaine
 * de chaque cabinet, n'en déclare aucune — sinon l'onglet de la page publique
 * d'un cabinet porterait le K de son fournisseur. Le SVG d'abord, le PNG pour
 * les navigateurs qui ne le lisent pas, l'icône d'écran d'accueil d'iOS.
 */
export function poserIconesKlaro(doc: Document = document): () => void {
  const liens: Array<[string, Record<string, string>]> = [
    ['icon', { type: 'image/svg+xml', href: KLARO.icone }],
    ['icon', { type: 'image/png', sizes: '48x48', href: KLARO.iconePng }],
    ['apple-touch-icon', { href: KLARO.iconeEcranAccueil }],
  ]
  const poses = liens.map(([rel, attributs]) => {
    const lien = doc.createElement('link')
    lien.setAttribute('rel', rel)
    for (const [nom, valeur] of Object.entries(attributs)) lien.setAttribute(nom, valeur)
    lien.setAttribute('data-marque', 'klaro')
    doc.head.appendChild(lien)
    return lien
  })
  return () => {
    for (const lien of poses) lien.remove()
  }
}

/** L'icône de Klaro dans l'onglet, le temps que la page est montée. */
export function useIconeKlaro() {
  useEffect(() => poserIconesKlaro(), [])
}
