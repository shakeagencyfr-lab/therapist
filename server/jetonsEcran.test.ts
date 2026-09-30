import { describe, expect, it } from 'vitest'
import { ACTIONS_DU_BAREME, BAREME_PAR_DEFAUT_ECRAN, jetonsDits as jetonsDitsEcran } from '../src/lib/jetonsIA.js'
import { ACTIONS_JETONS, BAREME_PAR_DEFAUT, jetonsDits } from './jetons.js'

/*
 * L'écran recopie deux choses du serveur, sans pouvoir l'importer (il tire
 * Stripe et la clé de service) : le barème par défaut, pour la
 * démonstration, et la façon de dire un nombre de jetons. Si l'un bouge sans
 * l'autre, l'écran annonce un prix que le serveur ne prend pas.
 */
describe("ce que l'écran recopie du serveur", () => {
  it('le même barème par défaut, dans le même ordre', () => {
    expect(BAREME_PAR_DEFAUT_ECRAN).toEqual(BAREME_PAR_DEFAUT)
    expect([...ACTIONS_DU_BAREME]).toEqual([...ACTIONS_JETONS])
  })

  it('les jetons dits de la même façon', () => {
    for (const n of [0, 1, 2, 12, 312, 1000, 25_000]) expect(jetonsDitsEcran(n)).toBe(jetonsDits(n))
  })
})
