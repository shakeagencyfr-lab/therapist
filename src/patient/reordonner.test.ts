import { describe, expect, it } from 'vitest'
import { deplacer, rangVise, type Boite } from './reordonner'

/** Quatre pages de 100 px, collées : 0-100, 100-200, 200-300, 300-400. */
const BOITES: Boite[] = [
  { haut: 0, hauteur: 100 },
  { haut: 100, hauteur: 100 },
  { haut: 200, hauteur: 100 },
  { haut: 300, hauteur: 100 },
]

describe('rangVise — où la page atterrit', () => {
  it('reste en place tant que le doigt ne dépasse pas le voisin', () => {
    // Page 0 déplacée de quarante pixels : le milieu de la page 1 (150) est
    // toujours sous le doigt (90), rien ne bouge.
    expect(rangVise(0, 90, BOITES)).toBe(0)
  })

  it('descend d’un rang une fois le milieu du voisin franchi', () => {
    expect(rangVise(0, 160, BOITES)).toBe(1)
    expect(rangVise(0, 260, BOITES)).toBe(2)
  })

  it('remonte de même', () => {
    expect(rangVise(3, 140, BOITES)).toBe(1)
    expect(rangVise(3, 40, BOITES)).toBe(0)
  })

  /* Un doigt qui sort de la liste par le haut ou par le bas ne doit pas
     produire un rang hors des pages : on se serre contre le bord. */
  it('ne sort jamais de la liste', () => {
    expect(rangVise(2, -500, BOITES)).toBe(0)
    expect(rangVise(1, 9000, BOITES)).toBe(3)
  })

  it('sur une liste d’une seule page, il n’y a qu’un rang', () => {
    expect(rangVise(0, 5000, [{ haut: 0, hauteur: 100 }])).toBe(0)
  })
})

describe('deplacer', () => {
  it('sort l’élément et le repose au bon rang', () => {
    expect(deplacer(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(deplacer(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('ne touche à rien quand le rang ne change pas', () => {
    const liste = ['a', 'b', 'c']
    expect(deplacer(liste, 1, 1)).toBe(liste)
  })

  it('tient un rang hors bornes sans perdre d’élément', () => {
    expect(deplacer(['a', 'b'], 0, 9)).toEqual(['b', 'a'])
    expect(deplacer(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
  })
})
