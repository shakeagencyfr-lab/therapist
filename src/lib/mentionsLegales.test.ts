import { describe, expect, it } from 'vitest'
import { HEBERGEUR, lignesMentions, mentionsManquantes } from './mentionsLegales'

describe('lignesMentions', () => {
  it('dit qui publie, où, sous quel numéro, et chez quel hébergeur', () => {
    const lignes = lignesMentions({
      name: 'Cabinet Fontaine',
      responsable: 'Laetitia Ollivier',
      numero_pro: 'SIRET 123 456 789 00012',
      adresse: '3 rue des Lilas, 44000 Nantes',
      telephone: '02 40 00 00 00',
    })
    expect(lignes.map((l) => l.libelle)).toEqual([
      'Responsable de la publication',
      'Adresse',
      'Téléphone',
      'Numéro professionnel',
      'Hébergement',
    ])
    expect(lignes[0]?.valeur).toBe('Laetitia Ollivier')
    expect(lignes.at(-1)?.valeur).toBe(HEBERGEUR)
  })

  it('retombe sur le nom du cabinet quand aucun responsable n’est saisi', () => {
    expect(lignesMentions({ name: 'Cabinet Fontaine', responsable: '  ' })[0]?.valeur).toBe('Cabinet Fontaine')
  })

  it("n'affiche pas une ligne vide, mais toujours l'hébergeur", () => {
    const lignes = lignesMentions({ name: 'Cabinet Fontaine', numero_pro: null, adresse: '' })
    expect(lignes.map((l) => l.libelle)).toEqual(['Responsable de la publication', 'Hébergement'])
  })
})

describe('mentionsManquantes', () => {
  it('ne signale rien quand tout est saisi', () => {
    expect(
      mentionsManquantes({ responsable: 'L. Ollivier', numeroPro: '12345678900012', adresse: 'Nantes' }),
    ).toEqual([])
  })

  it('nomme ce qui manque, dans les mots de l’écran', () => {
    expect(mentionsManquantes({ responsable: '', numeroPro: ' ', adresse: 'Nantes' })).toEqual([
      'le nom du responsable',
      'votre numéro professionnel',
    ])
  })
})
