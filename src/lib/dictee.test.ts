import { describe, expect, it } from 'vitest'
import {
  ajouterDicte,
  capitaliser,
  debutDePhrase,
  insererDicte,
  messageDictee,
  type PositionDictee,
} from './dictee'

/**
 * La dictée dans les champs de la praticienne.
 *
 * Mêmes garde-fous que l'espace patient — une phrase que le navigateur
 * complète ne se répète pas — plus trois choses que la fin du texte ne
 * connaissait pas : le curseur, la majuscule et la longueur du champ.
 */

/** Rejoue une suite de segments comme le navigateur les envoie, depuis une ancre. */
function dicter(
  segments: string[],
  depart = '',
  ancre = depart.length,
  longueurMax?: number,
): { valeur: string; position: PositionDictee; tronque: boolean } {
  let valeur = depart
  let position: PositionDictee = { ancre, precedent: '' }
  let tronque = false
  for (const brut of segments) {
    const r = insererDicte(valeur, position, brut, longueurMax)
    valeur = r.valeur
    position = { ancre: r.ancre, precedent: r.precedent }
    tronque = tronque || r.tronque
  }
  return { valeur, position, tronque }
}

describe('debutDePhrase et capitaliser', () => {
  it('ouvre une phrase sur un champ vide, un point ou un retour à la ligne', () => {
    expect(debutDePhrase('')).toBe(true)
    expect(debutDePhrase('Fini.')).toBe(true)
    expect(debutDePhrase('Fini. ')).toBe(true)
    expect(debutDePhrase('Vraiment ?')).toBe(true)
    expect(debutDePhrase('Et alors…')).toBe(true)
    expect(debutDePhrase('Première ligne\n')).toBe(true)
    expect(debutDePhrase('Première ligne\n  ')).toBe(true)
  })

  it('ne l’ouvre pas au milieu d’une phrase', () => {
    expect(debutDePhrase('La patiente dit')).toBe(false)
    expect(debutDePhrase('La patiente dit, ')).toBe(false)
  })

  it('relève la première lettre, et ne baisse jamais rien', () => {
    expect(capitaliser('', 'état stable')).toBe('État stable')
    expect(capitaliser('Vu hier.', 'sommeil meilleur')).toBe('Sommeil meilleur')
    expect(capitaliser('Elle parle de', 'Marseille')).toBe('Marseille')
    expect(capitaliser('Elle parle de', 'son travail')).toBe('son travail')
    expect(capitaliser('', '3 cigarettes')).toBe('3 cigarettes')
  })
})

describe('insererDicte — à la fin du champ', () => {
  it('pose la première phrase avec sa majuscule', () => {
    expect(dicter(['patiente reçue ce matin']).valeur).toBe('Patiente reçue ce matin')
  })

  /* LA RÉGRESSION DE L'ESPACE PATIENT, rejouée ici : le navigateur complète
     sa phrase mot à mot ; chaque envoi remplace le précédent. La majuscule
     posée sur la première version ne doit pas empêcher de la reconnaître. */
  it('ne répète pas une phrase que le navigateur complète', () => {
    expect(
      dicter(['bonjour je', 'bonjour je ne', 'bonjour je ne me sens', 'bonjour je ne me sens pas bien'])
        .valeur,
    ).toBe('Bonjour je ne me sens pas bien')
  })

  it('ignore une republication à l’identique ou tronquée', () => {
    expect(dicter(['je suis fatiguée', 'je suis fatiguée', 'je suis']).valeur).toBe('Je suis fatiguée')
    // Le navigateur a lui-même mis la majuscule à la seconde copie.
    expect(dicter(['je suis fatiguée', 'Je suis fatiguée']).valeur).toBe('Je suis fatiguée')
  })

  it('enchaîne en prose derrière une espace, sans majuscule au milieu d’une phrase', () => {
    expect(dicter(['la nuit a été longue'], 'Selon elle').valeur).toBe('Selon elle la nuit a été longue')
  })

  it('met la majuscule après un point déjà tapé', () => {
    expect(dicter(['la nuit a été longue'], 'Déjà écrit à la main.').valeur).toBe(
      'Déjà écrit à la main. La nuit a été longue',
    )
  })

  it('ne double pas l’espace et suit un retour à la ligne sans espace', () => {
    expect(dicter(['madame'], 'Bonjour ').valeur).toBe('Bonjour madame')
    expect(dicter(['deuxième point'], 'Premier point\n').valeur).toBe('Premier point\nDeuxième point')
  })

  it('ne réécrit pas une phrase déjà posée juste avant', () => {
    expect(insererDicte('bonjour je suis là', { ancre: 18, precedent: '' }, 'je suis là').valeur).toBe(
      'bonjour je suis là',
    )
  })

  it('rend une seule fois la phrase de l’incident de production', () => {
    const r = dicter([
      '1 2',
      '1 2 1 2',
      '1 2 1 2 bonjour',
      '1 2 1 2 bonjour je ne me sens mal non',
      '1 2 1 2 bonjour je ne me sens mal non',
    ])
    expect(r.valeur).toBe('1 2 1 2 bonjour je ne me sens mal non')
  })

  it('ignore un segment vide', () => {
    const r = insererDicte('Texte', { ancre: 5, precedent: '' }, '   ')
    expect(r).toEqual({ valeur: 'Texte', ancre: 5, precedent: '', tronque: false })
  })
})

describe('insererDicte — au curseur', () => {
  it('écrit là où était le curseur, et laisse la suite en place', () => {
    const r = dicter(['sommeil meilleur'], 'Vu hier. Revoir jeudi.', 8)
    expect(r.valeur).toBe('Vu hier. Sommeil meilleur Revoir jeudi.')
    // L'ancre suit ce qui vient d'être écrit, avant l'espace ajoutée.
    expect(r.position.ancre).toBe('Vu hier. Sommeil meilleur'.length)
  })

  it('complète la phrase au curseur sans la répéter', () => {
    const r = dicter(['il dort', 'il dort mieux', 'il dort mieux depuis lundi'], 'Début. Fin.', 6)
    expect(r.valeur).toBe('Début. Il dort mieux depuis lundi Fin.')
  })

  it('sépare d’une espace un mot collé au curseur, pas une ponctuation', () => {
    expect(dicter(['chère'], 'Bonjour madame', 8).valeur).toBe('Bonjour chère madame')
    expect(dicter(['très bien'], 'Elle va.', 7).valeur).toBe('Elle va très bien.')
  })

  it('enchaîne deux phrases au même endroit', () => {
    const r = dicter(['premier ajout.', 'second ajout'], 'Avant. Après.', 6)
    expect(r.valeur).toBe('Avant. Premier ajout. Second ajout Après.')
  })

  it('ramène une ancre hors du texte dans ses bornes', () => {
    expect(insererDicte('abc', { ancre: 99, precedent: '' }, 'd').valeur).toBe('abc d')
    expect(insererDicte('abc', { ancre: -4, precedent: '' }, 'd').valeur).toBe('D abc')
  })
})

describe('insererDicte — la longueur maximale du champ', () => {
  it('coupe ce qui dépasse, et le dit', () => {
    const r = dicter(['défghijklmnop'], 'abc', 3, 10)
    expect(r.valeur).toBe('abc défghi')
    expect(r.valeur).toHaveLength(10)
    expect(r.tronque).toBe(true)
  })

  it('n’écrit rien dans un champ plein', () => {
    const r = insererDicte('1234567890', { ancre: 10, precedent: '' }, 'encore', 10)
    expect(r.valeur).toBe('1234567890')
    expect(r.tronque).toBe(true)
  })

  it('garde la suite du texte entière et coupe l’ajout', () => {
    const r = insererDicte('Début fin', { ancre: 5, precedent: '' }, 'milieu', 14)
    expect(r.valeur).toBe('Début mili fin')
    expect(r.tronque).toBe(true)
  })

  it('reste sous la limite quand la phrase s’allonge', () => {
    const r = dicter(['un deux', 'un deux trois quatre'], '', 0, 12)
    expect(r.valeur).toBe('Un deux troi')
    expect(r.tronque).toBe(true)
  })

  it('ne dit rien quand tout tient', () => {
    expect(dicter(['court'], '', 0, 50).tronque).toBe(false)
  })
})

describe('ajouterDicte — l’espace patient, inchangé', () => {
  it('ajoute à la fin, sans majuscule ajoutée', () => {
    expect(ajouterDicte('', 'bonjour', '').texte).toBe('bonjour')
    expect(ajouterDicte('Déjà.', 'la suite', '').texte).toBe('Déjà. la suite')
  })

  it('reconnaît la même phrase quand le navigateur lui pose la majuscule en finalisant', () => {
    let r = ajouterDicte('', 'bonjour je viens', '')
    r = ajouterDicte(r.texte, 'Bonjour je viens de parler', r.segment)
    expect(r.texte).toBe('Bonjour je viens de parler')
    r = ajouterDicte(r.texte, 'bonjour je viens', r.segment)
    expect(r.texte).toBe('Bonjour je viens de parler')
  })
})

describe('messageDictee', () => {
  it('dit chaque refus en français, sans code brut', () => {
    const codes = ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'no-speech', 'bizarre']
    for (const code of codes) {
      const message = messageDictee(code)
      expect(message).not.toContain(code)
      expect(message.length).toBeGreaterThan(20)
    }
    expect(messageDictee('audio-capture')).toMatch(/micro/)
    expect(messageDictee('network')).toMatch(/internet/)
  })
})
