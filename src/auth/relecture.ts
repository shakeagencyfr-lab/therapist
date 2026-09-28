/**
 * Quand relire le rôle du compte, et que faire quand la lecture échoue.
 *
 * À part de session.tsx pour être éprouvé : ce sont trois petites décisions,
 * et chacune, prise de travers, démontait toute l'application.
 *
 * LE DÉFAUT D'ORIGINE. Chaque événement de session porteur d'une session
 * relançait `claim_access` puis `my_context`. Or @supabase/auth-js émet
 * SIGNED_IN à chaque retour sur l'onglet (sa reprise de session, au
 * `visibilitychange`), et TOKEN_REFRESHED toutes les heures. Une lecture sur
 * cent qui échouait — un réseau de téléphone qui se réveille — effaçait le
 * contexte : la praticienne perdait son cabinet au milieu d'une séance
 * (« Vos accès n'ont pas pu être lus »), la patiente lisait « Aucun suivi en
 * cours à cette adresse ». Pour un rôle qui n'avait pas changé.
 */

/** Ce qu'un événement de session demande au rôle déjà lu. */
export type DecisionRelecture =
  /** Un autre compte, ou le même dont l'adresse vient de changer : on relit. */
  | 'relire'
  /** Le même compte, sa session seulement rafraîchie : rien à relire. */
  | 'garder'
  /** Plus de session : le rôle part avec elle. */
  | 'oublier'

/**
 * La décision, d'après l'événement et les deux identifiants de compte.
 *
 * `utilisateur` est le compte que porte la session reçue (null sans
 * session) ; `dejaLu` celui dont le rôle est lu, ou en cours de lecture.
 *
 * Ni SIGNED_IN ni TOKEN_REFRESHED ne disent à eux seuls que quelque chose a
 * changé : le premier arrive à chaque retour sur l'onglet. Seul un
 * changement de COMPTE le dit — ou USER_UPDATED, qui suit un changement
 * d'adresse, dont dépendent les invitations que `claim_access` rattache.
 */
export function decisionRelecture(
  evenement: string,
  utilisateur: string | null,
  dejaLu: string | null,
): DecisionRelecture {
  if (!utilisateur) return 'oublier'
  if (utilisateur !== dejaLu) return 'relire'
  if (evenement === 'USER_UPDATED') return 'relire'
  return 'garder'
}

/**
 * Après une lecture qui n'a pas abouti : le rôle à garder, ou null.
 *
 * Un rôle déjà lu POUR CE MÊME COMPTE reste valable : une relecture qui
 * échoue ne prouve pas qu'il a changé, seulement que la base n'a pas
 * répondu. Le jeter démontait l'espace entier pour une panne d'une seconde.
 *
 * Celui d'un AUTRE compte, jamais : l'afficher ouvrirait à quelqu'un
 * l'espace de la personne qui s'est connectée avant lui sur cet appareil.
 */
export function roleAGarder<T extends { user_id: string | null }>(
  connu: T | null,
  utilisateur: string | null,
): T | null {
  if (!connu || !utilisateur) return null
  return connu.user_id === utilisateur ? connu : null
}

/** Une attente bornée : la valeur si elle arrive à temps, sinon rien. */
export type Issue<T> = { aTemps: true; valeur: T } | { aTemps: false }

/**
 * Attend une promesse, pas plus de `ms` millisecondes.
 *
 * La promesse n'est pas annulée : elle continue derrière, et l'appelant peut
 * encore en recueillir le résultat. On cesse seulement de RETENIR L'ÉCRAN
 * pour elle — c'est la même règle que le délai de vérification de session.
 * Une promesse rejetée se propage telle quelle.
 */
export async function avantDelai<T>(promesse: Promise<T>, ms: number): Promise<Issue<T>> {
  let minuteur: ReturnType<typeof setTimeout> | undefined
  const delai = new Promise<Issue<T>>((resoudre) => {
    minuteur = setTimeout(() => resoudre({ aTemps: false }), ms)
  })
  try {
    return await Promise.race([promesse.then((valeur): Issue<T> => ({ aTemps: true, valeur })), delai])
  } finally {
    clearTimeout(minuteur)
  }
}
