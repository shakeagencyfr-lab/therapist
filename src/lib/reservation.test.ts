import { describe, expect, it } from 'vitest'
import { adresseSansPage } from './reservation'

/**
 * Le cadre montrait tout le site de l'agenda au lieu du formulaire.
 *
 * `data-url` de BookRDV vaut « https://mon-cabinet.bookrdv.com » : un domaine
 * nu. L'adresse qu'on en tire mène donc à la page d'accueil de l'agenda, et
 * c'est elle que la patiente voit sous « Prendre rendez-vous » — logo, titre
 * du cabinet, et un bouton qui renvoie là où elle croyait être.
 */
describe('adresseSansPage', () => {
  it('reconnaît un domaine nu, avec ou sans barre finale, avec ou sans paramètres', () => {
    for (const url of [
      'https://lohypnose.bookrdv.com',
      'https://lohypnose.bookrdv.com/',
      'https://lohypnose.bookrdv.com/?t=s&uuid=0d0395e4-79a1-4bb0-a754-42efe15fe0dd',
      'https://lohypnose.bookrdv.com/#reserver',
    ]) {
      expect({ [url]: adresseSansPage(url) }).toEqual({ [url]: true })
    }
  })

  it('laisse passer une adresse qui désigne une page', () => {
    for (const url of [
      'https://lohypnose.bookrdv.com/booking',
      'https://lohypnose.bookrdv.com/embed?t=s&uuid=abc',
      'https://agenda.exemple.fr/widget',
      'https://agenda.exemple.fr/fr/reserver/',
    ]) {
      expect({ [url]: adresseSansPage(url) }).toEqual({ [url]: false })
    }
  })

  it('ne dit rien de ce qui n’est pas une adresse', () => {
    for (const brut of ['', '   ', null, undefined, 'pas une adresse']) {
      expect({ [String(brut)]: adresseSansPage(brut) }).toEqual({ [String(brut)]: false })
    }
  })
})
