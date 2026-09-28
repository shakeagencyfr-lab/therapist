import { describe, expect, it } from 'vitest'
import {
  COULEURS_ORIGINE,
  couleurSure,
  couleurValide,
  couleursInvalides,
  nuance,
  variablesDeMarque,
} from './couleurs'

/**
 * Une couleur de marque mal formée ne lève rien : elle rend les boutons
 * transparents, sur des écrans que personne ne regarde au moment de publier.
 * Ces épreuves fixent la règle unique qui l'arrête.
 */
describe('couleurValide — ce qui se publie', () => {
  it('accepte #RRGGBB, en majuscules comme en minuscules', () => {
    expect(couleurValide('#A17A45')).toBe(true)
    expect(couleurValide('#a17a45')).toBe(true)
  })

  it('refuse un code incomplet, vide ou sans dièse', () => {
    expect(couleurValide('#A17A4')).toBe(false)
    expect(couleurValide('#33291')).toBe(false)
    expect(couleurValide('')).toBe(false)
    expect(couleurValide('A17A45')).toBe(false)
    expect(couleurValide(undefined)).toBe(false)
  })

  it('refuse les formes courtes : la base et les nuances ne connaissent que six chiffres', () => {
    expect(couleurValide('#fff')).toBe(false)
    expect(couleurValide('#A17A45FF')).toBe(false)
  })
})

describe('couleurSure — ce qui devient variable CSS', () => {
  it('laisse passer toute couleur hexadécimale que le CSS comprend', () => {
    expect(couleurSure('#fff')).toBe('#fff')
    expect(couleurSure('#ffff')).toBe('#ffff')
    expect(couleurSure(' #A17A45 ')).toBe('#A17A45')
    expect(couleurSure('#A17A45CC')).toBe('#A17A45CC')
  })

  it('arrête cinq et sept chiffres, que le CSS refuse — le cas qui rendait les boutons transparents', () => {
    expect(couleurSure('#A17A4')).toBeUndefined()
    expect(couleurSure('#A17A451')).toBeUndefined()
  })

  it("n'écrit jamais de CSS étranger dans la page", () => {
    expect(couleurSure('red; background-image: url(https://tiers.example/x)')).toBeUndefined()
    expect(couleurSure('var(--autre)')).toBeUndefined()
    expect(couleurSure(42)).toBeUndefined()
  })
})

describe('couleursInvalides', () => {
  it('rend une liste vide pour une marque publiable', () => {
    expect(couleursInvalides(COULEURS_ORIGINE)).toEqual([])
  })

  it('nomme chaque couleur qui ne se publie pas', () => {
    expect(couleursInvalides({ ...COULEURS_ORIGINE, accent: '#A17A4', dark: '' })).toEqual(['accent', 'dark'])
  })

  it('traite une marque absente comme entièrement à régler', () => {
    expect(couleursInvalides(null)).toHaveLength(4)
  })
})

describe('variablesDeMarque', () => {
  it('pose les quatre variables quand tout est lisible', () => {
    expect(variablesDeMarque(COULEURS_ORIGINE)).toEqual({
      '--c-accent': '#A17A45',
      '--c-accent-hover': '#856239',
      '--c-accent-deep': '#6E5230',
      '--c-dark': '#33291C',
    })
  })

  it("laisse la couleur du produit là où la marque est illisible, plutôt qu'une variable vide", () => {
    const vars = variablesDeMarque({ ...COULEURS_ORIGINE, dark: '#33291' }) as Record<string, unknown>
    expect(vars['--c-dark']).toBeUndefined()
    expect(vars['--c-accent']).toBe('#A17A45')
  })

  it('ne pose rien sans marque', () => {
    expect(variablesDeMarque(null)).toBeUndefined()
  })
})

describe('nuance', () => {
  it("assombrit l'accent pour donner ses variantes", () => {
    expect(nuance('#A17A45', 0.84)).toBe('#87663A')
    expect(nuance('#ffffff', 1)).toBe('#FFFFFF')
  })

  it('rend telle quelle une couleur hors format, sans inventer de valeur', () => {
    expect(nuance('#A17A4', 0.84)).toBe('#A17A4')
  })
})
