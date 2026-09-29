import { describe, expect, it } from 'vitest'
import { PLANS } from '@/data/reseller'
import { DESCRIPTION, donneesStructurees, TITRE, URL_CANONIQUE } from './seo'

describe('les données structurées de la page de vente', () => {
  const ld = donneesStructurees()
  const texte = JSON.stringify(ld)

  it('décrivent un logiciel, à son adresse canonique', () => {
    expect(ld['@type']).toBe('SoftwareApplication')
    expect(ld.url).toBe(URL_CANONIQUE)
    expect(URL_CANONIQUE).toBe('https://klaroweb.site/')
    expect(ld.inLanguage).toBe('fr')
  })

  /* Aucune note, aucun avis : le produit n'en a pas, et Google pénalise
     ceux qu'on s'attribue. */
  it('ne portent ni note ni avis', () => {
    expect(texte).not.toMatch(/aggregateRating|review|ratingValue/i)
  })

  it('portent les trois offres, aux prix du catalogue, en euros par mois', () => {
    const offres = ld.offers as Array<{ name: string; price: string; priceCurrency: string }>
    expect(offres.map((o) => o.name)).toEqual(PLANS.map((p) => p.label))
    expect(offres.map((o) => Number(o.price))).toEqual(PLANS.map((p) => p.priceCents / 100))
    for (const o of offres) expect(o.priceCurrency).toBe('EUR')
    expect(texte).toContain('"unitCode":"MON"')
  })

  it('ont un titre et une description de moteur de recherche', () => {
    expect(TITRE.length).toBeLessThanOrEqual(70)
    expect(DESCRIPTION.length).toBeGreaterThan(80)
    expect(DESCRIPTION.length).toBeLessThanOrEqual(220)
    expect(texte).not.toMatch(/\b(claude|opus|sonnet)\b/i)
  })
})
