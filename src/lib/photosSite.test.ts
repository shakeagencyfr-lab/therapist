import { describe, expect, it } from 'vitest'
import {
  cheminStockage,
  copiesGoogleOubliees,
  deplacer,
  GARDE_DES_COPIES_GOOGLE_MS,
  mettreEnCouverture,
  photosRetirees,
} from './photosSite'

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

describe('copiesGoogleOubliees', () => {
  const MAINTENANT = Date.UTC(2026, 8, 29, 12)
  const VIEILLE = new Date(MAINTENANT - GARDE_DES_COPIES_GOOGLE_MS - 60_000).toISOString()
  const RECENTE = new Date(MAINTENANT - 60_000).toISOString()
  const copie = (n: number) => `google-0000000${n}-aaaa-bbbb-cccc-dddddddddddd.jpg`
  const url = (nom: string) => `${BASE}/storage/v1/object/public/sites/${CAB}/site/${nom}`

  it('efface la copie ancienne que la page ne montre pas, et elle seule', () => {
    const fichiers = [
      { name: copie(1), created_at: VIEILLE },
      { name: copie(2), created_at: VIEILLE },
      { name: copie(3), created_at: RECENTE },
      { name: 'photo-deposee.jpg', created_at: VIEILLE },
      { name: copie(4), created_at: null },
    ]
    expect(copiesGoogleOubliees(fichiers, [{ url: url(copie(2)) }], BASE, CAB, MAINTENANT)).toEqual([
      `${CAB}/site/${copie(1)}`,
    ])
  })

  it('ne touche à rien sans copie ancienne', () => {
    expect(copiesGoogleOubliees([], [], BASE, CAB, MAINTENANT)).toEqual([])
    expect(copiesGoogleOubliees([{ name: 'google-1.jpg', created_at: VIEILLE }], [], BASE, CAB, MAINTENANT)).toEqual([])
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
