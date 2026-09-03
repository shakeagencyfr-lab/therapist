import { describe, expect, it } from 'vitest'
import { apercu, mois } from './Journal'

/**
 * Retrouver une page parmi soixante.
 *
 * Le journal se remplit : au bout de six mois, une liste à plat de titres ne
 * se parcourt plus. Deux repères la rendent lisible — le mois en
 * intercalaire, et les premiers mots de chaque page.
 */
describe('apercu', () => {
  it('rend les premiers mots, sur une seule ligne', () => {
    expect(apercu('Deux lignes.\n\nEt la suite.')).toBe('Deux lignes. Et la suite.')
  })

  it('coupe proprement, sans laisser d’espace avant les points', () => {
    const long = apercu('mot '.repeat(60))
    expect(long.endsWith('…')).toBe(true)
    expect(long).not.toContain(' …')
    expect(long.length).toBeLessThanOrEqual(91)
  })

  it('ne coupe pas ce qui tient déjà', () => {
    expect(apercu('Court.')).toBe('Court.')
  })
})

describe('mois', () => {
  /* Le titre ouvre un groupe : il commence par une majuscule, comme un
     intercalaire, là où toLocaleDateString rend « septembre 2026 ». */
  it('rend un intercalaire capitalisé', () => {
    expect(mois('2026-09-03T17:47:00Z')).toBe('Septembre 2026')
    expect(mois('2026-01-15T08:00:00Z')).toBe('Janvier 2026')
  })

  it('sépare deux années', () => {
    expect(mois('2025-12-31T12:00:00Z')).not.toBe(mois('2026-12-31T12:00:00Z'))
  })
})
