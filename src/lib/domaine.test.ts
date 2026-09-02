import { describe, expect, it } from 'vitest'
import { DOMAINE_CABINETS, adresseCabinet } from './domaine'

describe('adresse publique des cabinets', () => {
  it('compose le sous-domaine sur le domaine de la plateforme', () => {
    expect(adresseCabinet('cabinet-fontaine')).toBe(`cabinet-fontaine.${DOMAINE_CABINETS}`)
  })
  it('rend le domaine seul quand le slug manque', () => {
    expect(adresseCabinet('')).toBe(DOMAINE_CABINETS)
    expect(adresseCabinet('   ')).toBe(DOMAINE_CABINETS)
  })
  it('ne traîne pas les espaces de saisie', () => {
    expect(adresseCabinet(' laetitia ')).toBe(`laetitia.${DOMAINE_CABINETS}`)
  })
})
