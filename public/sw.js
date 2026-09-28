/*
 * Service worker de l'espace patient — les rappels, et rien d'autre.
 *
 * Il n'intercepte AUCUNE requête : pas de cache, pas de mode hors ligne. Un
 * service worker qui garde des pages en réserve sert un jour une version
 * périmée de l'application, et personne ne comprend pourquoi. Celui-ci
 * affiche un rappel, et rouvre l'espace quand on le touche.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (evenement) => evenement.waitUntil(self.clients.claim()))

/** Un chemin de cette origine, et de l'espace patient — rien d'autre. */
function cheminSur(brut) {
  try {
    const url = new URL(typeof brut === 'string' ? brut : '/mon', self.location.origin)
    if (url.origin !== self.location.origin) return '/mon'
    return /^\/([a-z0-9][a-z0-9-]{0,62}\/)?mon\/?$/.test(url.pathname) ? url.pathname : '/mon'
  } catch {
    return '/mon'
  }
}

self.addEventListener('push', (evenement) => {
  let donnees = {}
  try {
    donnees = evenement.data ? evenement.data.json() : {}
  } catch {
    donnees = { corps: evenement.data ? evenement.data.text() : '' }
  }
  const titre = typeof donnees.titre === 'string' && donnees.titre ? donnees.titre : 'Un mot de votre thérapeute'
  evenement.waitUntil(
    self.registration.showNotification(titre, {
      body: typeof donnees.corps === 'string' ? donnees.corps : '',
      icon: '/icones/rappel-192.png',
      badge: '/icones/badge-96.png',
      // Le même rappel, reçu deux fois, remplace le premier au lieu de s'empiler.
      tag: typeof donnees.etiquette === 'string' ? donnees.etiquette : undefined,
      data: { url: cheminSur(donnees.url) },
      lang: 'fr',
    }),
  )
})

self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close()
  const chemin = cheminSur(evenement.notification.data && evenement.notification.data.url)
  evenement.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // L'espace est déjà ouvert : on le ramène devant, sans en ouvrir un second.
      for (const fenetre of fenetres) {
        const ouvert = new URL(fenetre.url)
        if (ouvert.pathname.replace(/\/$/, '') === chemin.replace(/\/$/, '') && 'focus' in fenetre) {
          return fenetre.focus()
        }
      }
      return self.clients.openWindow(chemin)
    })(),
  )
})
