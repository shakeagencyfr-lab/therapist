import { describe, expect, it } from 'vitest'
import { ajouterDicte } from './useDictee'

/**
 * Ce qui est dicté ne doit ni se perdre ni se répéter.
 *
 * Le navigateur renvoie la même phrase plusieurs fois, de plus en plus
 * complète, puis passe à la suivante. Sans la règle de remplacement, une
 * personne qui dicte trois phrases en relit sept.
 */
describe('ajouterDicte', () => {
  it('pose le premier segment tel quel', () => {
    expect(ajouterDicte('', 'j’ai mal dormi', false)).toBe('j’ai mal dormi')
  })

  /* La séance met chaque segment sur sa ligne — c'est son seul indice de tour
     de parole. Un journal, lui, s'écrit en paragraphes. */
  it('enchaîne en prose, pas une ligne par phrase', () => {
    expect(ajouterDicte('J’ai mal dormi.', 'Je me suis levée à quatre heures.', false)).toBe(
      'J’ai mal dormi. Je me suis levée à quatre heures.',
    )
  })

  it('remplace la phrase quand le navigateur la complète', () => {
    expect(ajouterDicte('j’ai mal', 'j’ai mal dormi cette nuit', true)).toBe(
      'j’ai mal dormi cette nuit',
    )
  })

  it('ignore une republication plus courte', () => {
    expect(ajouterDicte('j’ai mal dormi cette nuit', 'j’ai mal dormi', true)).toBe(
      'j’ai mal dormi cette nuit',
    )
  })

  /* Une correction n'est pas une continuation : si la phrase repart
     autrement, elle s'ajoute au lieu d'effacer ce qui précède. */
  it('ajoute quand la nouvelle phrase ne prolonge pas la précédente', () => {
    expect(ajouterDicte('j’ai mal dormi', 'la journée a été longue', true)).toBe(
      'j’ai mal dormi la journée a été longue',
    )
  })

  /* Les retours à la ligne tapés à la main sont à la personne : la dictée
     complète le dernier paragraphe sans les écraser. */
  it('préserve les retours à la ligne déjà écrits', () => {
    expect(ajouterDicte('Premier paragraphe.\n\nDeuxième', ' Deuxième paragraphe.', true)).toBe(
      'Premier paragraphe.\n\nDeuxième paragraphe.',
    )
    expect(ajouterDicte('Une ligne.\n', 'La suivante.', false)).toBe('Une ligne.\nLa suivante.')
  })

  it('ne double pas les espaces et ignore un segment vide', () => {
    expect(ajouterDicte('Bonjour', '   ', false)).toBe('Bonjour')
    expect(ajouterDicte('Bonjour ', 'madame', false)).toBe('Bonjour madame')
  })
})
