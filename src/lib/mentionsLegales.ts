/**
 * Les mentions légales de la page publique d'un cabinet.
 *
 * Le site d'une professionnelle doit dire qui le publie. La loi pour la
 * confiance dans l'économie numérique (article 6-III) demande : son identité,
 * son adresse, un moyen de la joindre, son numéro d'immatriculation (SIRET,
 * ou ADELI / RPPS pour une profession de santé réglementée) et l'identité de
 * l'hébergeur. La page publique n'en disait rien : une thérapeute qui la
 * publiait se mettait en défaut sans le savoir.
 *
 * L'identité et le numéro, c'est elle qui les saisit — nous ne les
 * connaissons pas. L'adresse et le téléphone sont ceux de « Vous joindre ».
 * L'HÉBERGEUR, en revanche, est le nôtre, et il est écrit ICI : c'est un fait
 * de l'infrastructure, pas un réglage du cabinet. Le nommer ne trahit pas le
 * fournisseur d'une marque blanche — c'est l'hébergeur de l'application, pas
 * elle.
 */

/**
 * L'hébergeur de l'application. À changer ici, et seulement ici, s'il change.
 *
 * Son nom, son adresse ET son téléphone : c'est ce que la loi demande de
 * l'hébergeur (LCEN, article 1-1, anciennement 6-III). Les mentions légales
 * de la plateforme (src/legal/contenu.ts) le citent tel quel.
 */
export const HEBERGEUR = 'Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis, tél. +1 951 383 6898'

/** Ce que les mentions lisent de la page. */
export interface SourceMentions {
  name: string
  responsable?: string | null
  numero_pro?: string | null
  adresse?: string | null
  telephone?: string | null
}

export interface LigneMention {
  libelle: string
  valeur: string
}

/**
 * Les lignes des mentions, dans l'ordre où on les lit.
 *
 * Sans nom de responsable saisi, c'est le nom du cabinet qui répond : une
 * page publiée dit toujours qui la publie. Une ligne vide, en revanche, ne
 * s'affiche pas — « Numéro : » suivi de rien ferait plus douter qu'une ligne
 * absente.
 */
export function lignesMentions(site: SourceMentions): LigneMention[] {
  const lignes: LigneMention[] = [
    { libelle: 'Responsable de la publication', valeur: (site.responsable ?? '').trim() || site.name },
  ]
  const adresse = (site.adresse ?? '').trim()
  if (adresse) lignes.push({ libelle: 'Adresse', valeur: adresse })
  const telephone = (site.telephone ?? '').trim()
  if (telephone) lignes.push({ libelle: 'Téléphone', valeur: telephone })
  const numero = (site.numero_pro ?? '').trim()
  if (numero) lignes.push({ libelle: 'Numéro professionnel', valeur: numero })
  lignes.push({ libelle: 'Hébergement', valeur: HEBERGEUR })
  return lignes
}

/**
 * Ce qui manque aux mentions, dit comme l'écran le dira.
 *
 * Rien n'empêche de publier sans : ce n'est pas à nous de bloquer une page
 * qu'elle a décidé de mettre en ligne. Mais elle doit le savoir AVANT, pas
 * l'apprendre d'un courrier.
 */
export function mentionsManquantes(site: {
  responsable?: string | null
  numeroPro?: string | null
  adresse?: string | null
}): string[] {
  const manque: string[] = []
  if (!(site.responsable ?? '').trim()) manque.push('le nom du responsable')
  if (!(site.adresse ?? '').trim()) manque.push("l'adresse du cabinet")
  if (!(site.numeroPro ?? '').trim()) manque.push('votre numéro professionnel')
  return manque
}
