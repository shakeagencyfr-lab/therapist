/**
 * L'import de la fiche Google, versé dans le BROUILLON de l'éditeur.
 *
 * L'import écrivait directement en base, et fusionnait à sa manière : les
 * horaires et les avis de Google remplaçaient ceux du cabinet dès que la
 * fiche en avait, une page déjà publiée partait en ligne sans relecture, et
 * l'écran rechargeait tout depuis la base — ce qui avait été tapé sans être
 * enregistré disparaissait. Tout cela sous une phrase qui promettait le
 * contraire : « l'import remplit ce qui est vide et ne remplace jamais ce que
 * vous avez écrit ».
 *
 * Désormais le serveur LIT la fiche (et recopie les photos, qui doivent vivre
 * chez nous), puis rend ce qu'il a lu. C'est ici, dans le navigateur, que la
 * fiche rejoint le brouillon — avec la saisie en cours, pas avec l'état
 * enregistré — et c'est « Enregistrer » qui décide de ce qui part en ligne.
 *
 * LA RÈGLE, champ par champ : ce qui est vide se remplit, ce qui est écrit
 * reste. Les avis sont le seul cas où l'import AJOUTE à ce qui existe —
 * c'est pour eux qu'on réimporte — mais jamais un avis que la thérapeute a
 * retiré : elle l'a retiré, il ne revient pas à chaque rafraîchissement.
 */
import { plural } from './format'

export interface AvisFiche {
  auteur: string
  note: number
  texte: string
  date: string
}

export interface PhotoFiche {
  url: string
  alt: string
  attribution: string
}

/** Ce que le serveur rend d'une fiche lue, photos déjà recopiées chez nous. */
export interface FicheImportee {
  nom: string
  presentation: string
  adresse: string
  telephone: string
  siteWeb: string
  horaires: Array<{ jour: string; heures: string }>
  avis: AvisFiche[]
  photos: PhotoFiche[]
}

/** Ce que la fusion lit et écrit du brouillon. */
export interface BrouillonFusionnable {
  titre: string
  presentation: string
  adresse: string
  telephone: string
  siteWeb: string
  horaires: Array<{ jour: string; heures: string }>
  avis: AvisFiche[]
  photos: PhotoFiche[]
  /** Les avis retirés, par leur clé : ils ne reviennent pas. */
  avisRetires: string[]
}

/** Les avis gardés sur la page, au plus — la même borne que le serveur. */
export const AVIS_MAX = 8

/** Les clés d'avis retirés qu'on retient, au plus — la même borne que la base. */
export const RETIRES_MAX = 100

/**
 * La clé d'un avis : son auteur et le début de son texte, sans casse ni
 * espaces en trop.
 *
 * Google ne rend pas d'identifiant d'avis stable par les deux sources, et la
 * date y est relative (« il y a 3 mois ») : elle change d'un import à
 * l'autre, elle ne peut donc pas en faire partie.
 */
export function cleAvis(avis: Pick<AvisFiche, 'auteur' | 'texte'>): string {
  const propre = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${propre(avis.auteur)}|${propre(avis.texte).slice(0, 80)}`
}

/** Retirer un avis du brouillon, et s'en souvenir. */
export function retirerAvis<T extends BrouillonFusionnable>(brouillon: T, rang: number): T {
  const avis = brouillon.avis[rang]
  if (!avis) return brouillon
  const cle = cleAvis(avis)
  const retires = brouillon.avisRetires.includes(cle)
    ? brouillon.avisRetires
    : [...brouillon.avisRetires, cle].slice(-RETIRES_MAX)
  return { ...brouillon, avis: brouillon.avis.filter((_, i) => i !== rang), avisRetires: retires }
}

const vide = (s: string) => !s.trim()

/**
 * Verse la fiche dans le brouillon.
 *
 * Rend le brouillon complété et, pour le message, la liste de ce qui a été
 * ajouté — dite comme l'écran la dira. Une liste vide veut dire que la fiche
 * n'apportait rien que le brouillon n'ait déjà.
 */
export function fusionnerFiche<T extends BrouillonFusionnable>(
  brouillon: T,
  fiche: FicheImportee,
): { site: T; ajouts: string[] } {
  const ajouts: string[] = []
  const suite: T = { ...brouillon }

  const remplir = (champ: 'titre' | 'presentation' | 'adresse' | 'telephone' | 'siteWeb', valeur: string, nom: string) => {
    if (vide(suite[champ]) && !vide(valeur)) {
      suite[champ] = valeur.trim()
      ajouts.push(nom)
    }
  }
  remplir('titre', fiche.nom, 'le titre')
  remplir('presentation', fiche.presentation, 'la présentation')
  remplir('adresse', fiche.adresse, "l'adresse")
  remplir('telephone', fiche.telephone, 'le téléphone')
  remplir('siteWeb', fiche.siteWeb, 'votre site')

  /* Des horaires dont aucun jour n'est rempli sont des horaires vides : la
     grille de sept jours que l'éditeur montre d'office ne compte pas comme
     une saisie. Un seul jour écrit, et la grille est à elle. */
  const horairesEcrits = brouillon.horaires.some((h) => !vide(h.heures))
  if (!horairesEcrits && fiche.horaires.some((h) => !vide(h.heures))) {
    suite.horaires = fiche.horaires
    ajouts.push('les horaires')
  }

  const connus = new Set([...brouillon.avis.map(cleAvis), ...brouillon.avisRetires])
  const nouveaux = fiche.avis.filter((a) => !connus.has(cleAvis(a)))
  const places = Math.max(0, AVIS_MAX - brouillon.avis.length)
  const ajoutes = nouveaux.slice(0, places)
  if (ajoutes.length) {
    suite.avis = [...brouillon.avis, ...ajoutes]
    ajouts.push(plural(ajoutes.length, 'avis', 'avis'))
  }

  if (!brouillon.photos.length && fiche.photos.length) {
    suite.photos = fiche.photos
    ajouts.push(plural(fiche.photos.length, 'photo', 'photos'))
  }

  return { site: suite, ajouts }
}
