import { describe, expect, it } from 'vitest'
import {
  DOMAINE_CABINETS,
  adresseCabinet,
  cheminEspacePatient,
  codeEmbed,
  lienCabinet,
  lienEmbed,
} from './domaine'

describe('adresse publique des cabinets', () => {
  it('compose un chemin, pas un sous-domaine', () => {
    expect(adresseCabinet('cabinet-fontaine')).toBe(`${DOMAINE_CABINETS}/cabinet-fontaine`)
  })
  it('rend le domaine seul quand le slug manque', () => {
    expect(adresseCabinet('')).toBe(DOMAINE_CABINETS)
    expect(adresseCabinet('   ')).toBe(DOMAINE_CABINETS)
  })
  it('ne traîne pas les espaces de saisie', () => {
    expect(adresseCabinet(' laetitia ')).toBe(`${DOMAINE_CABINETS}/laetitia`)
  })
  it('le lien est la même adresse, en https', () => {
    expect(lienCabinet('laetitia')).toBe(`https://${DOMAINE_CABINETS}/laetitia`)
  })

  /* Le chemin sans domaine : c'est lui qui garde une patiente sur le domaine
     par lequel elle est arrivée, celui de sa thérapeute comme le nôtre. */
  it("le chemin de l'espace patient porte l'identifiant du cabinet", () => {
    expect(cheminEspacePatient('laetitia')).toBe('/laetitia/mon')
    expect(cheminEspacePatient(' laetitia ')).toBe('/laetitia/mon')
  })
  it("retombe sur /mon quand aucun cabinet n'est désigné", () => {
    expect(cheminEspacePatient('')).toBe('/mon')
    expect(cheminEspacePatient('   ')).toBe('/mon')
  })
  it('ne porte jamais de domaine en dur', () => {
    expect(cheminEspacePatient('laetitia')).not.toContain(DOMAINE_CABINETS)
    expect(cheminEspacePatient('laetitia').startsWith('/')).toBe(true)
  })

  it("le widget d'intégration pointe sur /e/<identifiant>", () => {
    expect(lienEmbed('laetitia')).toBe(`https://${DOMAINE_CABINETS}/e/laetitia`)
  })
  it("le code d'intégration est un iframe, sans script à charger", () => {
    const code = codeEmbed('laetitia')
    expect(code).toContain(`<iframe src="https://${DOMAINE_CABINETS}/e/laetitia"`)
    expect(code).not.toContain('<script')
  })
})
