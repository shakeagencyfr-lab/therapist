import { describe, expect, it } from 'vitest'
import { cheminSousIdentifiant, identifiantEnSaisie, problemeIdentifiant } from './identifiant'

describe('l’identifiant pendant la frappe', () => {
  /* `slugify` à chaque frappe retirait le tiret final : impossible d'écrire
     « cabinet-fontaine », le tiret disparaissait avant la suite. */
  it('garde le tiret qu’on vient de taper', () => {
    expect(identifiantEnSaisie('cabinet-')).toBe('cabinet-')
    expect(identifiantEnSaisie('cabinet-f')).toBe('cabinet-f')
  })

  it('met en minuscules, retire les accents et les caractères qu’une adresse refuse', () => {
    expect(identifiantEnSaisie('Cabinet Hélène Côté')).toBe('cabinet-helene-cote')
    expect(identifiantEnSaisie('--à  la--ligne')).toBe('a-la-ligne')
  })
})

describe('ce qui empêche un identifiant de servir d’adresse', () => {
  it('laisse passer un identifiant valable', () => {
    expect(problemeIdentifiant('cabinet-fontaine')).toBeNull()
  })

  it('refuse trop court, réservé, ou tiret en bord', () => {
    expect(problemeIdentifiant('ab')).toMatch(/trois caractères/)
    expect(problemeIdentifiant('cabinet')).toMatch(/réservé/)
    expect(problemeIdentifiant('espace')).toMatch(/réservé/)
    expect(problemeIdentifiant('fontaine-')).toMatch(/tiret/)
  })
})

describe('l’adresse sous l’identifiant actuel', () => {
  it('réécrit les trois portes du cabinet', () => {
    expect(cheminSousIdentifiant('/ancien', 'ancien', 'nouveau')).toBe('/nouveau')
    expect(cheminSousIdentifiant('/ancien/', 'ancien', 'nouveau')).toBe('/nouveau')
    expect(cheminSousIdentifiant('/c/ancien', 'ancien', 'nouveau')).toBe('/nouveau')
    expect(cheminSousIdentifiant('/ancien/mon', 'ancien', 'nouveau')).toBe('/nouveau/mon')
    expect(cheminSousIdentifiant('/Ancien/MON/', 'ancien', 'nouveau')).toBe('/nouveau/mon')
    expect(cheminSousIdentifiant('/e/ancien', 'ancien', 'nouveau')).toBe('/e/nouveau')
  })

  it('ne touche à rien quand l’identifiant n’a pas changé, ou n’est pas celui de l’adresse', () => {
    expect(cheminSousIdentifiant('/ancien', 'ancien', 'ancien')).toBeNull()
    expect(cheminSousIdentifiant('/autre', 'ancien', 'nouveau')).toBeNull()
    expect(cheminSousIdentifiant('/ancien/mon/journal', 'ancien', 'nouveau')).toBeNull()
    expect(cheminSousIdentifiant('/ancien', 'ancien', '')).toBeNull()
  })
})
