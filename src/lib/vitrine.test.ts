import { describe, expect, it } from 'vitest'
import { slugDuChemin } from './vitrine'

describe('adresse de cabinet', () => {
  it('reconnaît /c/<slug>, avec ou sans barre finale', () => {
    expect(slugDuChemin('/c/cabinet-fontaine')).toBe('cabinet-fontaine')
    expect(slugDuChemin('/c/cabinet-fontaine/')).toBe('cabinet-fontaine')
  })
  it('ramène le slug en minuscules', () => {
    expect(slugDuChemin('/c/Cabinet-Fontaine')).toBe('cabinet-fontaine')
  })
  it('ignore les chemins qui ne sont pas une vitrine', () => {
    expect(slugDuChemin('/')).toBeNull()
    expect(slugDuChemin('/mon')).toBeNull()
    expect(slugDuChemin('/c/')).toBeNull()
    expect(slugDuChemin('/c/cabinet/autre-chose')).toBeNull()
    expect(slugDuChemin('/c/-tiret-devant')).toBeNull()
    expect(slugDuChemin('/c/point.interdit')).toBeNull()
  })
})
