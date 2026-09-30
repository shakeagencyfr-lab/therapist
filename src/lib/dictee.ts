/**
 * Dicter dans un champ de texte : ce qui s'écrit, où, et comment.
 *
 * Le moteur (src/services/speech.ts) rend des segments ; ce module décide de
 * ce qu'ils deviennent dans le texte. Il ne touche ni au DOM ni à React :
 * tout ce qui peut se tromper sur une virgule se teste ici, sans navigateur.
 *
 * Deux usages, un seul cœur :
 *   — l'espace patient ajoute à la fin (ajouterDicte, inchangé depuis
 *     l'incident des phrases répétées huit fois) ;
 *   — les champs de la praticienne insèrent là où est le curseur, posent la
 *     majuscule en début de phrase et respectent la longueur maximale du
 *     champ (insererDicte).
 */

/** Un segment tel que le navigateur le rend, blancs resserrés. */
function nettoyer(segment: string): string {
  return segment.replace(/\s+/g, ' ').trim()
}

/**
 * Verser un segment dicté dans un texte en prose.
 *
 * `appendSegment`, côté séance, met chaque segment sur SA LIGNE, et compare
 * le nouveau segment à cette dernière ligne pour savoir s'il la prolonge.
 * En passant à la prose — une espace au lieu d'un retour à la ligne — j'ai
 * supprimé l'ancre : la « dernière ligne » devenait tout le texte accumulé,
 * plus rien ne correspondait, et CHAQUE REPUBLICATION S'AJOUTAIT. Le
 * navigateur renvoyant la même phrase de plus en plus complète, on relisait
 * « bonjour je ne me sens pas bien » huit fois de suite.
 *
 * On garde donc explicitement le DERNIER SEGMENT reçu, et c'est à lui qu'on
 * compare. Il ne dépend plus de la forme du texte, ni du drapeau `suite` du
 * navigateur — que trois moteurs interprètent de trois façons.
 *
 * Quatre cas, dans cet ordre :
 *   — le segment répète mot pour mot le précédent : on ne fait rien ;
 *   — il le prolonge : il prend sa place, à la fin du texte ;
 *   — il est plus court que lui : c'est une republication tronquée, rien ;
 *   — sinon c'est une phrase neuve : elle s'ajoute derrière une espace.
 */
export function ajouterDicte(
  courant: string,
  segment: string,
  precedent: string,
): { texte: string; segment: string } {
  const propre = nettoyer(segment)
  if (!propre) return { texte: courant, segment: precedent }
  if (!courant) return { texte: propre, segment: propre }

  if (precedent) {
    // Répétition à l'identique, ou republication plus courte : rien à écrire.
    if (propre === precedent || precedent.startsWith(propre)) {
      return { texte: courant, segment: precedent }
    }
    /* La même phrase, plus complète : elle remplace la précédente là où elle
       se trouve — à la fin. On ne cherche qu'à la fin, pour ne pas réécrire
       une phrase identique prononcée plus tôt dans le texte. */
    if (propre.startsWith(precedent) && courant.endsWith(precedent)) {
      return { texte: courant.slice(0, courant.length - precedent.length) + propre, segment: propre }
    }
  }

  // Déjà écrit à la fin : le navigateur republie après une coupure.
  if (courant.endsWith(propre)) return { texte: courant, segment: propre }

  const texte = /\s$/.test(courant) ? courant + propre : `${courant} ${propre}`
  return { texte, segment: propre }
}

/**
 * Ce qui précède ouvre-t-il une phrase ?
 *
 * Un champ vide, une fin de phrase (point, point d'exclamation ou
 * d'interrogation, points de suspension) ou un retour à la ligne. Les
 * espaces qui traînent derrière ne comptent pas : « Fini. » et « Fini. »
 * suivi d'une espace ouvrent tous deux une phrase.
 */
export function debutDePhrase(avant: string): boolean {
  if (/\n[ \t ]*$/.test(avant)) return true
  const t = avant.replace(/[ \t ]+$/, '')
  return t === '' || /[.!?…]$/.test(t)
}

/**
 * La majuscule de début de phrase, et elle seule.
 *
 * Chrome rend souvent la parole en minuscules, sans ponctuation : une note
 * qui commence par « patiente reçue ce matin » se relit mal. On ne fait que
 * relever la première lettre quand une phrase commence ; on ne baisse jamais
 * rien — une majuscule au milieu d'une phrase est un nom propre que le
 * navigateur a reconnu.
 */
export function capitaliser(avant: string, segment: string): string {
  if (!segment || !debutDePhrase(avant)) return segment
  return segment.charAt(0).toLocaleUpperCase('fr-FR') + segment.slice(1)
}

/**
 * La clé de comparaison de deux segments : la première lettre sans casse.
 *
 * La même phrase republiée doit être reconnue même quand l'une des deux
 * copies a reçu la majuscule de début de phrase et pas l'autre.
 */
function cle(segment: string): string {
  return segment.charAt(0).toLocaleLowerCase('fr-FR') + segment.slice(1)
}

/** Où la dictée écrit, et ce qu'elle vient d'écrire. */
export interface PositionDictee {
  /** Position dans le texte où le prochain segment s'insère. */
  ancre: number
  /** Le dernier segment écrit, tel qu'il figure juste avant l'ancre. */
  precedent: string
}

export interface InsertionDictee extends PositionDictee {
  valeur: string
  /** Vrai quand la longueur maximale du champ a coupé ce qui était dit. */
  tronque: boolean
}

/**
 * Insérer un segment dicté à l'ancre, dans un champ de la praticienne.
 *
 * C'est la règle d'ajouterDicte — même comparaison au dernier segment, même
 * garde contre les republications — appliquée au texte qui PRÉCÈDE l'ancre :
 * la dictée écrit là où était le curseur quand le micro s'est ouvert, pas
 * forcément à la fin. Ce qui suit l'ancre ne bouge pas ; une espace le
 * sépare de ce qui vient d'être dit quand il commence par un mot.
 *
 * `longueurMax` est celle du champ. Une valeur posée par programme passe
 * outre l'attribut maxlength : c'est donc ici qu'on coupe, et on le dit.
 */
export function insererDicte(
  valeur: string,
  position: PositionDictee,
  segment: string,
  longueurMax?: number,
): InsertionDictee {
  const ancre = Math.max(0, Math.min(position.ancre, valeur.length))
  const precedent = position.precedent
  const inchange = (p: string): InsertionDictee => ({ valeur, ancre, precedent: p, tronque: false })

  const propre = nettoyer(segment)
  if (!propre) return inchange(precedent)

  const tete = valeur.slice(0, ancre)
  const queue = valeur.slice(ancre)

  /** Ce qui reste tel quel devant l'ajout. */
  let base: string
  /** L'espace qui sépare l'ajout de ce qui le précède. */
  let joint = ''
  let ecrit: string

  if (precedent && (cle(propre) === cle(precedent) || cle(precedent).startsWith(cle(propre)))) {
    // Répétition à l'identique, ou republication plus courte : rien à écrire.
    return inchange(precedent)
  }

  if (precedent && cle(propre).startsWith(cle(precedent)) && tete.endsWith(precedent)) {
    /* La même phrase, plus complète : elle reprend la place de la précédente.
       La majuscule se décide sur ce qui précédait la première version, pour
       que les deux copies se comparent encore à l'envoi suivant. */
    base = tete.slice(0, tete.length - precedent.length)
    ecrit = capitaliser(base, propre)
  } else {
    ecrit = capitaliser(tete, propre)
    // Déjà écrit juste avant : le navigateur republie après une coupure.
    if (tete.endsWith(ecrit)) return inchange(ecrit)
    if (tete.endsWith(propre)) return inchange(propre)
    base = tete
    joint = tete === '' || /\s$/.test(tete) ? '' : ' '
  }

  // La suite commence par un mot collé à l'ancre : une espace l'en sépare.
  const separateur = queue && !/^[\s.,;:!?…)\]»]/.test(queue) ? ' ' : ''

  let ajout = joint + ecrit
  let apres = separateur
  let tronque = false
  if (longueurMax !== undefined && longueurMax >= 0) {
    const place = longueurMax - base.length - queue.length
    if (ajout.length + apres.length > place) {
      tronque = true
      ajout = ajout.slice(0, Math.max(0, place))
      apres = ''
    }
  }

  // Rien n'a tenu : le texte reste tel qu'il était.
  if (!ajout.slice(joint.length)) {
    return { ...inchange(precedent), tronque }
  }

  const nouvelleTete = base + ajout
  return {
    valeur: nouvelleTete + apres + queue,
    ancre: nouvelleTete.length,
    precedent: ajout.slice(joint.length),
    tronque,
  }
}

/**
 * Les codes d'erreur de l'API, dits en français.
 *
 * `aborted` n'arrive jamais ici : le moteur le tait, c'est un arrêt voulu
 * (par nous, ou par une autre dictée qui a pris le micro). `no-speech` a
 * son texte pour l'espace patient ; les champs de la praticienne le taisent,
 * l'écoute reprend d'elle-même.
 */
export function messageDictee(code: string): string {
  switch (code) {
    case 'not-allowed':
      return "Le micro n'est pas autorisé. Autorisez-le pour ce site, puis réessayez."
    case 'service-not-allowed':
      return "Le navigateur refuse la dictée ici (réglage de l'appareil, ou application ouverte depuis l'écran d'accueil). Vous pouvez écrire à la main."
    case 'audio-capture':
      return "Aucun micro n'est disponible. Branchez-en un, ou vérifiez qu'une autre application ne l'occupe pas."
    case 'network':
      return "La dictée a besoin d'internet, et la connexion ne répond pas. Réessayez dans un instant."
    case 'no-speech':
      return "Je n'ai rien entendu. Réessayez en parlant un peu plus près."
    default:
      return "La dictée s'est interrompue. Réessayez, ou écrivez à la main."
  }
}

/** Le navigateur ne sait pas transcrire : ce qu'on dit, et où aller. */
export const DICTEE_IMPOSSIBLE =
  'Ce navigateur ne sait pas écrire sous la dictée. Chrome, Edge et Safari le font, sur téléphone comme sur ordinateur.'
