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
