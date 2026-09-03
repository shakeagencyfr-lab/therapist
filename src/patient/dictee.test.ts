import { describe, expect, it } from 'vitest'
import { ajouterDicte } from './useDictee'

/**
 * Ce qui est dicté ne doit ni se perdre ni se répéter.
 *
 * Le navigateur renvoie la même phrase plusieurs fois, de plus en plus
 * complète, puis passe à la suivante — et après une coupure, il republie ce
 * qu'il vient de rendre. Sans la comparaison au dernier segment, une
 * personne qui dicte une phrase la relit huit fois : c'est exactement ce qui
 * s'est produit en production.
 */

/** Rejoue une suite de segments comme le navigateur les envoie. */
function dicter(segments: string[], depart = ''): string {
  let texte = depart
  let precedent = ''
  for (const brut of segments) {
    const suite = ajouterDicte(texte, brut, precedent)
    texte = suite.texte
    precedent = suite.segment
  }
  return texte
}

describe('ajouterDicte', () => {
  it('pose le premier segment tel quel', () => {
    expect(dicter(['bonjour'])).toBe('bonjour')
  })

  /* LA RÉGRESSION. Le navigateur complète sa phrase mot à mot ; chaque envoi
     doit remplacer le précédent, pas s'ajouter derrière. */
  it("ne répète pas une phrase que le navigateur complète", () => {
    expect(
      dicter([
        'bonjour je',
        'bonjour je ne',
        'bonjour je ne me sens',
        'bonjour je ne me sens pas bien',
      ]),
    ).toBe('bonjour je ne me sens pas bien')
  })

  it('ignore une republication à l’identique, même répétée', () => {
    expect(dicter(['je suis fatiguée', 'je suis fatiguée', 'je suis fatiguée'])).toBe(
      'je suis fatiguée',
    )
  })

  it('ignore une republication tronquée', () => {
    expect(dicter(['j’ai mal dormi cette nuit', 'j’ai mal dormi'])).toBe('j’ai mal dormi cette nuit')
  })

  /* La séance met chaque segment sur sa ligne — c'est son seul indice de tour
     de parole. Un journal, lui, s'écrit en paragraphes. */
  it('enchaîne les phrases neuves en prose, séparées d’une espace', () => {
    expect(dicter(['J’ai mal dormi.', 'Je me suis levée à quatre heures.'])).toBe(
      'J’ai mal dormi. Je me suis levée à quatre heures.',
    )
  })

  it('reprend après ce que la personne avait déjà tapé', () => {
    expect(dicter(['la nuit a été longue'], 'Déjà écrit à la main.')).toBe(
      'Déjà écrit à la main. la nuit a été longue',
    )
  })

  /* Après une coupure du navigateur, la même phrase revient alors que le
     dernier segment a été oublié : la fin du texte sert de second garde-fou. */
  it('ne réécrit pas une phrase déjà posée à la fin', () => {
    expect(ajouterDicte('bonjour je suis là', 'je suis là', '').texte).toBe('bonjour je suis là')
  })

  it('répète une phrase que la personne redit vraiment, ailleurs', () => {
    // « oui » deux fois de suite est une répétition volontaire quand une
    // autre phrase les sépare : on ne la mange pas.
    expect(dicter(['oui', 'je crois', 'oui'])).toBe('oui je crois oui')
  })

  it('ne double pas les espaces et ignore un segment vide', () => {
    expect(dicter(['   '], 'Bonjour')).toBe('Bonjour')
    expect(dicter(['madame'], 'Bonjour ')).toBe('Bonjour madame')
  })
})

/**
 * Le cas signalé en production, rejoué tel quel.
 *
 * Capture du 3 septembre : « 1 2 1 2 bonjour je ne me sens mal non » écrit
 * huit fois d'affilée dans le mot pour la thérapeute. Le navigateur avait
 * envoyé la phrase par morceaux croissants, puis l'avait republiée après ses
 * coupures — et chaque envoi s'ajoutait.
 */
describe('la duplication constatée en production', () => {
  it('rend une seule fois la phrase, quels que soient les renvois', () => {
    const commeLeNavigateur = [
      '1 2',
      '1 2 1 2',
      '1 2 1 2 bonjour',
      '1 2 1 2 bonjour je ne',
      '1 2 1 2 bonjour je ne me sens mal',
      '1 2 1 2 bonjour je ne me sens mal non',
      // Republications après coupure de la reconnaissance.
      '1 2 1 2 bonjour je ne me sens mal non',
      '1 2 1 2 bonjour je ne me sens mal non',
    ]
    const ecrit = dicter(commeLeNavigateur)
    expect(ecrit).toBe('1 2 1 2 bonjour je ne me sens mal non')
    expect(ecrit.match(/bonjour/g)).toHaveLength(1)
  })
})
