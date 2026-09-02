import { describe, expect, it } from 'vitest'
import { appendSegment } from './speech'

describe('appendSegment — une ligne par prise de parole', () => {
  it('sépare deux segments par un retour à la ligne', () => {
    const t = appendSegment(appendSegment('', 'comment ça va '), '  mieux   mais jeudi ')
    expect(t).toBe('comment ça va\nmieux mais jeudi')
  })
  it('normalise les blancs du segment', () => {
    expect(appendSegment('a', '  b   c  ')).toBe('a\nb c')
  })
  it('ignore un segment vide', () => {
    expect(appendSegment('a', '   ')).toBe('a')
    expect(appendSegment('', '')).toBe('')
  })
})

/**
 * Chrome sur Android annonce comme définitif un segment qu'il rallonge
 * ensuite. Sans ces règles, une séance rendait six cents lignes de préfixes.
 */
describe('appendSegment — les préfixes qui grandissent ne s’empilent pas', () => {
  it("remplace la dernière ligne quand le segment la prolonge", () => {
    const suite = [
      "c'est quelqu'un",
      "c'est quelqu'un",
      "c'est quelqu'un de",
      "c'est quelqu'un de",
      "c'est quelqu'un de très",
      "c'est quelqu'un de très dépressif",
      "c'est quelqu'un de très dépressif et ben",
    ]
    const t = suite.reduce((acc, s) => appendSegment(acc, s), '')
    expect(t).toBe("c'est quelqu'un de très dépressif et ben")
    expect(t.split('\n')).toHaveLength(1)
  })

  it("n'ajoute pas de ligne pour une republication identique", () => {
    expect(appendSegment('bonjour', 'bonjour')).toBe('bonjour')
    // La republication l'emporte sur la casse : c'est en finalisant que le
    // navigateur pose les majuscules et la ponctuation.
    expect(appendSegment('bonjour', 'Bonjour.  ')).toBe('Bonjour.')
    expect(appendSegment('bonjour', 'Bonjour.').split('\n')).toHaveLength(1)
  })

  it('ignore une republication plus courte de la ligne en cours', () => {
    expect(appendSegment('je me sens mieux', 'je me sens')).toBe('je me sens mieux')
  })

  it('garde une ligne à part pour une vraie reprise de parole', () => {
    const t = appendSegment("c'est quelqu'un de très dépressif", 'et vous, comment allez-vous')
    expect(t.split('\n')).toHaveLength(2)
  })

  it('ne fusionne pas sur une coupure au milieu d’un mot', () => {
    // « il a dit » n'est pas le début de « il a dites » : deux phrases.
    const t = appendSegment('il a dit', 'il a dites des choses')
    expect(t.split('\n')).toHaveLength(2)
  })

  it("n'écrase que la dernière ligne, jamais les précédentes", () => {
    let t = appendSegment('', 'bonjour')
    t = appendSegment(t, 'je me sens')
    t = appendSegment(t, 'je me sens mieux')
    expect(t).toBe('bonjour\nje me sens mieux')
  })
})
