/**
 * Un motif `ilike` qui ne vaut que pour cette adresse.
 *
 * `_` et `%` sont des jokers : « jean_dupont@… » aurait aussi désigné
 * « jeanXdupont@… ». L'adresse sert à retrouver une invitation ou une fiche ;
 * elle doit désigner celle-là et aucune autre.
 *
 * Seul dans son module, sans aucun import : le serveur le charge tel quel
 * (voir server/fonctions.test.ts, « les modules partagés »).
 */
export function motifExact(email: string): string {
  return email.replace(/[\\%_]/g, (c) => `\\${c}`)
}
