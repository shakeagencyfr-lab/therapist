import { describe, expect, it } from 'vitest'
import {
  appendSegment,
  reconnaissanceCumulative,
  segmentsInedits,
  type MemoireCumulative,
  type ResultatBrut,
} from './speech'

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
describe('appendSegment — une phrase qui s’allonge remplace la précédente', () => {
  it('remplace la dernière ligne quand le segment la prolonge', () => {
    const suite = [
      "c'est quelqu'un",
      "c'est quelqu'un",
      "c'est quelqu'un de",
      "c'est quelqu'un de",
      "c'est quelqu'un de très",
      "c'est quelqu'un de très dépressif",
      "c'est quelqu'un de très dépressif et ben",
    ]
    const t = suite.reduce((acc, s) => appendSegment(acc, s, true), '')
    expect(t).toBe("c'est quelqu'un de très dépressif et ben")
    expect(t.split('\n')).toHaveLength(1)
  })

  it("n'ajoute pas de ligne pour une republication identique", () => {
    expect(appendSegment('bonjour', 'bonjour', true)).toBe('bonjour')
    // La republication l'emporte sur la casse : c'est en finalisant que le
    // navigateur pose les majuscules et la ponctuation.
    expect(appendSegment('bonjour', 'Bonjour.  ', true)).toBe('Bonjour.')
  })

  it('ignore une republication plus courte de la ligne en cours', () => {
    expect(appendSegment('je me sens mieux', 'je me sens', true)).toBe('je me sens mieux')
  })

  it('garde une ligne à part pour une vraie reprise de parole', () => {
    const t = appendSegment("c'est quelqu'un de très dépressif", 'et vous, comment allez-vous', true)
    expect(t.split('\n')).toHaveLength(2)
  })

  it('ne fusionne pas sur une coupure au milieu d’un mot', () => {
    // « il a dit » n'est pas le début de « il a dites » : deux phrases.
    expect(appendSegment('il a dit', 'il a dites des choses', true).split('\n')).toHaveLength(2)
  })

  it("n'écrase que la dernière ligne, jamais les précédentes", () => {
    let t = appendSegment('', 'bonjour')
    t = appendSegment(t, 'je me sens')
    t = appendSegment(t, 'je me sens mieux', true)
    expect(t).toBe('bonjour\nje me sens mieux')
  })

  it('sans « suite », un segment prend sa ligne même s’il commence pareil', () => {
    // Deux tours de parole : « oui », puis « oui bien sûr ». Les fondre
    // effacerait une réponse.
    expect(appendSegment('oui', 'oui bien sûr').split('\n')).toHaveLength(2)
  })
})

/**
 * Le flux d'un événement complet, tel que Chrome sur Android le sert : la
 * liste entière est republiée à chaque fois, les préfixes arrivent marqués
 * définitifs, et `resultIndex` ne bouge pas. C'est le scénario qui a produit
 * les six cents mots — et celui qui, mal corrigé, faisait fondre la séance
 * entière sur une seule ligne.
 */
function rejouer(evenements: ResultatBrut[][], cumulatif = false, depart = ''): string {
  const transmis: string[] = []
  const cumul: MemoireCumulative | undefined = cumulatif ? { ligne: '' } : undefined
  let transcript = depart
  for (const resultats of evenements) {
    const { finals } = segmentsInedits(resultats, transmis, cumul)
    for (const s of finals) transcript = appendSegment(transcript, s.texte, s.suite)
  }
  return transcript
}

const F = (texte: string): ResultatBrut => ({ texte, definitif: true })
const P = (texte: string): ResultatBrut => ({ texte, definitif: false })

describe('segmentsInedits — la liste republiée ne se retranscrit pas', () => {
  it('ne transmet un résultat inchangé qu’une seule fois', () => {
    const transmis: string[] = []
    expect(segmentsInedits([F('bonjour')], transmis).finals).toEqual([
      { texte: 'bonjour', suite: false },
    ])
    expect(segmentsInedits([F('bonjour')], transmis).finals).toEqual([])
  })

  it('transmet un résultat qui grandit, pour que la ligne se corrige', () => {
    const transmis: string[] = []
    segmentsInedits([F("c'est")], transmis)
    // « suite » vrai : c'est le MÊME résultat, plus complet.
    expect(segmentsInedits([F("c'est quelqu'un")], transmis).finals).toEqual([
      { texte: "c'est quelqu'un", suite: true },
    ])
  })

  it('rend le texte en cours à part, sans le mémoriser', () => {
    const transmis: string[] = []
    const r = segmentsInedits([F('bonjour'), P(' comment')], transmis)
    expect(r.finals).toEqual([{ texte: 'bonjour', suite: false }])
    expect(r.interim).toBe(' comment')
    expect(transmis).toHaveLength(1)
  })
})

describe('la séance rejouée telle qu’Android la sert', () => {
  it('rend une ligne par prise de parole, ni plus ni moins', () => {
    // Trois tours. Chaque événement republie tout depuis le début, et les
    // préfixes du tour en cours arrivent marqués définitifs.
    const transcript = rejouer([
      [F("c'est")],
      [F("c'est quelqu'un")],
      [F("c'est quelqu'un de très dépressif")],
      [F("c'est quelqu'un de très dépressif"), F('et vous en pensez quoi')],
      [F("c'est quelqu'un de très dépressif"), F('et vous en pensez quoi'), F('je ne sais pas encore')],
      // Une republication à l'identique ne doit rien ajouter.
      [F("c'est quelqu'un de très dépressif"), F('et vous en pensez quoi'), F('je ne sais pas encore')],
    ])
    expect(transcript.split('\n')).toEqual([
      "c'est quelqu'un de très dépressif",
      'et vous en pensez quoi',
      'je ne sais pas encore',
    ])
  })

  it('ne fond pas les tours en une seule ligne', () => {
    const transcript = rejouer([[F('oui')], [F('oui'), F('oui bien sûr')]])
    // « oui bien sûr » prolonge « oui », mais c'est un AUTRE résultat : il a
    // sa ligne. C'est ce que la concaténation faisait disparaître.
    expect(transcript.split('\n')).toHaveLength(2)
  })
})

/**
 * Le travers observé sur un téléphone Android : chaque version de la phrase
 * en cours arrive sous un NOUVEL index, marquée définitive, et certaines se
 * répètent à l'identique. L'écran affichait onze lignes pour une phrase.
 */
describe('Android : chaque version de la phrase sous un nouvel index', () => {
  const versions = [
    'bonjour',
    'bonjour',
    'bonjour je',
    'bonjour je viens',
    'bonjour je viens',
    'bonjour je viens de',
    'bonjour je viens de parler',
    'bonjour je viens de parler',
    "bonjour je viens de parler d'un",
    "bonjour je viens de parler d'un",
    "bonjour je viens de parler d'un problème",
    "bonjour je viens de parler d'un problème",
  ]
  /** La liste s'allonge d'un résultat définitif à chaque événement. */
  const evenements = versions.map((_, n) => versions.slice(0, n + 1).map(F))

  it('rend une seule ligne, la plus complète', () => {
    expect(rejouer(evenements, true)).toBe("bonjour je viens de parler d'un problème")
  })

  it('sans ce mode, la même séance s’empilait sur onze lignes', () => {
    // Le symptôme d'origine, gardé pour qu'on voie ce que le mode corrige.
    expect(rejouer(evenements, false).split('\n').length).toBeGreaterThan(5)
  })

  it('ne touche pas aux lignes écrites avant cette écoute', () => {
    const t = rejouer(evenements, true, 'avant la coupure')
    expect(t.split('\n')).toEqual(['avant la coupure', "bonjour je viens de parler d'un problème"])
  })

  it('garde une ligne à part pour la prise de parole suivante', () => {
    const t = rejouer(
      [
        [F('je me sens')],
        [F('je me sens'), F('je me sens mieux')],
        [F('je me sens'), F('je me sens mieux'), F('et vous')],
        [F('je me sens'), F('je me sens mieux'), F('et vous'), F('et vous comment allez-vous')],
      ],
      true,
    )
    expect(t.split('\n')).toEqual(['je me sens mieux', 'et vous comment allez-vous'])
  })

  it('reconnaît la même phrase malgré la majuscule et la ponctuation finales', () => {
    const t = rejouer([[F('bonjour je viens')], [F('bonjour je viens'), F('Bonjour, je viens de parler.')]], true)
    expect(t).toBe('Bonjour, je viens de parler.')
  })

  it('ignore une version plus courte arrivée après la longue', () => {
    const t = rejouer([[F('je me sens mieux')], [F('je me sens mieux'), F('je me sens')]], true)
    expect(t).toBe('je me sens mieux')
  })

  it('sans ce mode, les tours de parole restent séparés comme avant', () => {
    expect(rejouer([[F('oui')], [F('oui'), F('oui bien sûr')]], false).split('\n')).toHaveLength(2)
  })
})

describe('reconnaissanceCumulative', () => {
  it('vaut pour Android, quel que soit le navigateur', () => {
    expect(
      reconnaissanceCumulative(
        'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
      ),
    ).toBe(true)
    expect(
      reconnaissanceCumulative(
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
      ),
    ).toBe(true)
  })

  it('ne vaut ni pour un ordinateur ni pour un iPhone', () => {
    expect(
      reconnaissanceCumulative(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
      ),
    ).toBe(false)
    expect(
      reconnaissanceCumulative(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false)
  })
})
