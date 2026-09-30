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
    expect(adresseCabinet(' helene ')).toBe(`${DOMAINE_CABINETS}/helene`)
  })
  it('le lien est la même adresse, en https', () => {
    expect(lienCabinet('helene')).toBe(`https://${DOMAINE_CABINETS}/helene`)
  })

  /* Le chemin sans domaine : c'est lui qui garde une patiente sur le domaine
     par lequel elle est arrivée, celui de sa thérapeute comme le nôtre. */
  it("le chemin de l'espace patient porte l'identifiant du cabinet", () => {
    expect(cheminEspacePatient('helene')).toBe('/helene/mon')
    expect(cheminEspacePatient(' helene ')).toBe('/helene/mon')
  })
  it("retombe sur /mon quand aucun cabinet n'est désigné", () => {
    expect(cheminEspacePatient('')).toBe('/mon')
    expect(cheminEspacePatient('   ')).toBe('/mon')
  })
  it('ne porte jamais de domaine en dur', () => {
    expect(cheminEspacePatient('helene')).not.toContain(DOMAINE_CABINETS)
    expect(cheminEspacePatient('helene').startsWith('/')).toBe(true)
  })

  it("le widget d'intégration pointe sur /e/<identifiant>", () => {
    expect(lienEmbed('helene')).toBe(`https://${DOMAINE_CABINETS}/e/helene`)
  })
  it("le code d'intégration est un iframe, sans script à charger", () => {
    const code = codeEmbed('helene')
    expect(code).toContain(`<iframe src="https://${DOMAINE_CABINETS}/e/helene"`)
    expect(code).not.toContain('<script')
  })

  /* Le widget renvoie ses patients sur l'adresse qui l'a servi : servi par la
     nôtre, il les faisait arriver chez nous malgré le domaine du cabinet. */
  it('le widget vit sur le domaine du cabinet quand il en a un', () => {
    expect(lienEmbed('helene', 'Espace.Cabinet-Marchal.fr')).toBe('https://espace.cabinet-marchal.fr/e/helene')
    expect(codeEmbed('helene', 'espace.cabinet-marchal.fr')).toContain(
      '<iframe src="https://espace.cabinet-marchal.fr/e/helene"',
    )
    expect(lienEmbed('helene', null)).toBe(`https://${DOMAINE_CABINETS}/e/helene`)
  })

  it('le code collé chez la thérapeute ne nomme pas le fournisseur', () => {
    expect(codeEmbed('helene', 'espace.cabinet-marchal.fr').toLowerCase()).not.toContain('klaro')
  })
})
