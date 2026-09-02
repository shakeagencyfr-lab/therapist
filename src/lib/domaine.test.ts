import { describe, expect, it } from 'vitest'
import { DOMAINE_CABINETS, adresseCabinet, lienCabinet } from './domaine'

describe('adresse publique des cabinets', () => {
  it('compose un chemin, pas un sous-domaine', () => {
    expect(adresseCabinet('cabinet-fontaine')).toBe(`${DOMAINE_CABINETS}/c/cabinet-fontaine`)
  })
  it('rend le domaine seul quand le slug manque', () => {
    expect(adresseCabinet('')).toBe(DOMAINE_CABINETS)
    expect(adresseCabinet('   ')).toBe(DOMAINE_CABINETS)
  })
  it('ne traîne pas les espaces de saisie', () => {
    expect(adresseCabinet(' laetitia ')).toBe(`${DOMAINE_CABINETS}/c/laetitia`)
  })
  it('le lien est la même adresse, en https', () => {
    expect(lienCabinet('laetitia')).toBe(`https://${DOMAINE_CABINETS}/c/laetitia`)
  })
})
