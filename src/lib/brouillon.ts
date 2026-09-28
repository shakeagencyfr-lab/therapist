/**
 * Les brouillons de l'espace patient — ce qui se garde, et où.
 *
 * UN TEXTE NE DOIT PAS MOURIR AVEC SON ÉCRAN. La page de journal, le mot pour
 * sa thérapeute et la note d'un exercice vivaient dans l'état de composants
 * qui se démontent : un tap sur un onglet, ou sur « ‹ Ma journée », et dix
 * lignes écrites au pouce disparaissaient sans un mot.
 *
 * POURQUOI sessionStorage, ET PAS localStorage. Le brouillon doit survivre à
 * un changement d'onglet, à un rechargement, à l'application mise en arrière-
 * plan — pas à la fermeture de l'onglet. Ce sont des écrits intimes : sur un
 * ordinateur partagé, ils ne doivent pas attendre la personne suivante des
 * semaines durant. Pour la même raison, se déconnecter les efface tous.
 *
 * Une clé par patient : deux comptes ouverts tour à tour dans le même onglet
 * ne se lisent pas l'un l'autre.
 */

/** Ce qu'on attend d'un stockage : le sous-ensemble de `Storage` qui sert ici. */
export interface Stockage {
  getItem(cle: string): string | null
  setItem(cle: string, valeur: string): void
  removeItem(cle: string): void
  readonly length: number
  key(index: number): string | null
}

const PREFIXE = 'klaro.brouillon.'

/** La clé d'un brouillon : le patient, puis ce qu'il écrit. */
export function cleDeBrouillon(patientId: string, nom: string): string {
  return `${PREFIXE}${patientId}.${nom}`
}

/**
 * Le stockage de l'onglet, ou null.
 *
 * Le lire peut lever — navigation privée de certains navigateurs, stockage
 * bloqué par un réglage — et il n'existe pas hors du navigateur (banc de
 * rendu, épreuves). Sans lui, rien n'est gardé, et tout le reste marche.
 */
export function stockageDeLOnglet(): Stockage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Le brouillon gardé sous cette clé, ou null s'il n'y en a pas. */
export function lireBrouillon(stockage: Stockage | null, cle: string): string | null {
  if (!stockage) return null
  try {
    return stockage.getItem(cle)
  } catch {
    return null
  }
}

/**
 * Garde le texte — ou l'oublie, quand il n'y a plus rien à garder.
 *
 * Un champ vidé, ou revenu exactement à ce qui est déjà enregistré (`depart`),
 * n'est plus un brouillon : le garder le ferait resurgir au prochain passage,
 * par-dessus ce que la personne a choisi d'effacer.
 */
export function garderBrouillon(stockage: Stockage | null, cle: string, texte: string, depart = ''): void {
  if (!stockage) return
  try {
    if (!texte.trim() || texte === depart) stockage.removeItem(cle)
    else stockage.setItem(cle, texte)
  } catch {
    // Stockage plein ou refusé : le texte reste à l'écran, il ne survivra
    // simplement pas à un rechargement.
  }
}

export function oublierBrouillon(stockage: Stockage | null, cle: string): void {
  if (!stockage) return
  try {
    stockage.removeItem(cle)
  } catch {
    // Rien à faire : il partira avec l'onglet.
  }
}

/**
 * Efface tous les brouillons de l'onglet, de tous les comptes.
 *
 * À la déconnexion et à la suppression du compte : un appareil prêté ne doit
 * pas garder une page de journal inachevée pour la personne suivante.
 */
export function oublierLesBrouillons(stockage: Stockage | null = stockageDeLOnglet()): void {
  if (!stockage) return
  try {
    const cles: string[] = []
    for (let i = 0; i < stockage.length; i += 1) {
      const cle = stockage.key(i)
      if (cle?.startsWith(PREFIXE)) cles.push(cle)
    }
    // Relevées d'abord, retirées ensuite : retirer pendant le parcours
    // décale les index et en laisse une sur deux.
    cles.forEach((cle) => stockage.removeItem(cle))
  } catch {
    // Stockage refusé : il n'y avait rien de gardé.
  }
}
