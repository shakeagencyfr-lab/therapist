import { describe, expect, it } from 'vitest'
import { CHEMINS_RESERVES, slugDeLEspacePatient, slugDuChemin } from './vitrine'

/**
 * L'adresse de l'espace patient d'un cabinet.
 *
 * `/cabinet-fontaine/mon` ouvre le même espace que `/mon` — la session dit
 * qui entre, pas l'adresse. Ce qui change, c'est la porte : le nom et les
 * couleurs du cabinet avant la connexion, sans domaine à acheter.
 */
describe('slugDeLEspacePatient', () => {
  it('reconnaît l’identifiant d’un cabinet, avec ou sans barre finale', () => {
    expect(slugDeLEspacePatient('/cabinet-fontaine/mon')).toBe('cabinet-fontaine')
    expect(slugDeLEspacePatient('/cabinet-fontaine/mon/')).toBe('cabinet-fontaine')
  })

  it('met l’identifiant en minuscules', () => {
    expect(slugDeLEspacePatient('/Cabinet-Fontaine/MON')).toBe('cabinet-fontaine')
  })

  it('ignore ce qui n’est pas cette forme', () => {
    expect(slugDeLEspacePatient('/mon')).toBeNull()
    expect(slugDeLEspacePatient('/')).toBeNull()
    expect(slugDeLEspacePatient('/c/cabinet-fontaine')).toBeNull()
    expect(slugDeLEspacePatient('/cabinet/mon/journal')).toBeNull()
    expect(slugDeLEspacePatient('/-tiret-devant/mon')).toBeNull()
  })

  /* Un cabinet nommé « api » capturerait une route du produit. La liste sert
     ici, et devra servir à la validation des identifiants à l'ouverture. */
  it('refuse les chemins que le produit s’est réservés', () => {
    for (const reserve of CHEMINS_RESERVES) {
      expect(slugDeLEspacePatient(`/${reserve}/mon`)).toBeNull()
    }
  })

  /* Les deux lectures d'adresse partagent maintenant la racine : la vitrine
     est /<slug>, l'espace patient /<slug>/mon. Elles ne doivent pas se
     marcher dessus — c'est le nombre de segments qui les sépare. */
  it('ne se confond pas avec l’adresse de la vitrine', () => {
    expect(slugDuChemin('/cabinet-fontaine/mon')).toBeNull()
    expect(slugDeLEspacePatient('/cabinet-fontaine')).toBeNull()
    expect(slugDuChemin('/cabinet-fontaine')).toBe('cabinet-fontaine')
    expect(slugDeLEspacePatient('/cabinet-fontaine/mon')).toBe('cabinet-fontaine')
  })
})
