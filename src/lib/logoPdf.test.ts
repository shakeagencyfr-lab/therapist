import { describe, expect, it } from 'vitest'
import { cadreDuLogo, logoPourPdf } from './logoPdf'

describe('le logo d’une pièce', () => {
  it('garde ses proportions dans le cadre donné', () => {
    expect(cadreDuLogo({ largeur: 400, hauteur: 100 }, 150, 48)).toEqual({ largeur: 150, hauteur: 37.5 })
    expect(cadreDuLogo({ largeur: 100, hauteur: 100 }, 150, 48)).toEqual({ largeur: 48, hauteur: 48 })
  })

  it('ne va rien chercher hors de notre stockage', async () => {
    expect(await logoPourPdf(null)).toBeNull()
    expect(await logoPourPdf('https://traceur.exemple/pixel.png')).toBeNull()
  })
})
