import { describe, expect, it } from 'vitest'
import { FACE, inclinaisonPourDefilement, inclinaisonPourPointeur, REPOS } from './relief'

describe('le relief du haut de page', () => {
  it('reste à la pose de repos quand le pointeur est au centre de la scène', () => {
    expect(inclinaisonPourPointeur(500, 300, 500, 300, 1000, 800)).toEqual(REPOS)
  })

  it('suit le pointeur sans jamais dépasser son amplitude', () => {
    const loin = inclinaisonPourPointeur(10_000, -10_000, 500, 300, 1000, 800)
    const bord = inclinaisonPourPointeur(1000, -100, 500, 300, 1000, 800)
    expect(loin).toEqual(bord)
    expect(Math.abs(loin.ry - REPOS.ry)).toBeLessThanOrEqual(11)
    expect(Math.abs(loin.rx - REPOS.rx)).toBeLessThanOrEqual(7)
  })

  it('se redresse au milieu de l’écran, au défilement', () => {
    const milieu = inclinaisonPourDefilement(400, 800)
    const bas = inclinaisonPourDefilement(800, 800)
    expect(Math.abs(milieu.ry)).toBeLessThan(Math.abs(bas.ry))
    expect(milieu.rx).toBeLessThan(bas.rx)
  })

  it('se tourne presque de face quand on s’en sert', () => {
    expect(Math.abs(FACE.rx)).toBeLessThanOrEqual(1)
    expect(Math.abs(FACE.ry)).toBeLessThanOrEqual(4)
  })
})
