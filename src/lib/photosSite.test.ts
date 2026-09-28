import { describe, expect, it } from 'vitest'
import { cheminStockage, deplacer, mettreEnCouverture, photosRetirees } from './photosSite'

const BASE = 'https://projet.supabase.co'
const CAB = '11111111-2222-3333-4444-555555555555'
const url = (compartiment: string, chemin: string) => `${BASE}/storage/v1/object/public/${compartiment}/${chemin}`

describe('cheminStockage', () => {
  it('rend le chemin d’une image du cabinet, dans son compartiment', () => {
    expect(cheminStockage(url('sites', `${CAB}/site/a.jpg`), BASE, 'sites', CAB)).toBe(`${CAB}/site/a.jpg`)
    expect(cheminStockage(url('logos', `${CAB}/b.png`), `${BASE}/`, 'logos', CAB)).toBe(`${CAB}/b.png`)
  })

  it("ne rend rien pour une adresse d'ailleurs, d'un autre compartiment ou d'un autre cabinet", () => {
    expect(cheminStockage('https://tiers.example/a.jpg', BASE, 'sites', CAB)).toBeNull()
    expect(cheminStockage(url('logos', `${CAB}/a.jpg`), BASE, 'sites', CAB)).toBeNull()
    expect(cheminStockage(url('sites', 'autre-cabinet/site/a.jpg'), BASE, 'sites', CAB)).toBeNull()
  })

  it('refuse une remontée de dossier', () => {
    expect(cheminStockage(url('sites', `${CAB}/../autre/a.jpg`), BASE, 'sites', CAB)).toBeNull()
  })

  it('ne rend rien sans base connue', () => {
    expect(cheminStockage(url('sites', `${CAB}/a.jpg`), '', 'sites', CAB)).toBeNull()
  })
})

describe('photosRetirees', () => {
  const a = { url: url('sites', `${CAB}/site/a.jpg`) }
  const b = { url: url('sites', `${CAB}/site/b.jpg`) }
  const ailleurs = { url: 'https://tiers.example/c.jpg' }

  it('rend ce que la version précédente montrait et que la nouvelle ne montre plus', () => {
    expect(photosRetirees([a, b], [b], BASE, CAB)).toEqual([`${CAB}/site/a.jpg`])
  })

  it('ne touche ni à ce qui reste, ni à ce qui n’est pas à nous', () => {
    expect(photosRetirees([a, ailleurs], [a], BASE, CAB)).toEqual([])
  })

  it("ne propose rien pour une photo simplement déplacée", () => {
    expect(photosRetirees([a, b], [b, a], BASE, CAB)).toEqual([])
  })
})

describe('ordre des photos', () => {
  it('met une photo en couverture sans mélanger les autres', () => {
    expect(mettreEnCouverture(['a', 'b', 'c', 'd'], 2)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('déplace d’un rang, et ne bouge rien hors des bornes', () => {
    expect(deplacer(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'c', 'b'])
    expect(deplacer(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(deplacer(['a', 'b', 'c'], 2, 3)).toEqual(['a', 'b', 'c'])
  })
})
