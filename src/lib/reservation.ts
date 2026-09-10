/**
 * L'adresse d'un widget de réservation, relue avant de la montrer.
 *
 * Le code d'intégration d'un agenda tiers n'est pas une adresse : c'est du
 * HTML et un script. Le serveur en tire la seule chose dont l'espace patient a
 * besoin — l'adresse à encadrer — et n'exécute jamais le script (server/
 * integrations.ts). Reste une question que le code collé ne répond pas :
 * cette adresse mène-t-elle au FORMULAIRE de réservation, ou à la page
 * d'accueil de l'agenda ?
 */

/**
 * L'adresse ne désigne-t-elle que le domaine, sans page ?
 *
 * Un formulaire de réservation vit sur une page ; la racine d'un domaine sert
 * un site. Le code de BookRDV porte `data-url="https://mon-cabinet.bookrdv.com"`
 * — un domaine nu — et le cadre affiche donc le site entier : logo, titre du
 * cabinet, et un bouton « Prendre rendez-vous » qui renvoie là où la patiente
 * croyait déjà être. Ce n'est pas une panne, et rien ne le signalait.
 *
 * Un signal, pas un refus : on ne connaît pas le chemin qu'attend chaque
 * agenda, et se tromper de verdict coûterait plus qu'un avertissement de trop.
 */
export function adresseSansPage(brut: string | null | undefined): boolean {
  const propre = (brut ?? '').trim()
  if (!propre) return false
  try {
    const url = new URL(propre)
    return url.pathname === '/' || url.pathname === ''
  } catch {
    return false
  }
}
