import { describe, expect, it } from 'vitest'
import { nomDuFichier } from './hypnosePdf'

/**
 * Le nom du fichier finit dans un dossier de téléchargements, à côté de
 * quarante autres. Il doit se lire d'un coup d'œil et survivre à tous les
 * systèmes de fichiers — pas d'accent, pas d'espace, pas de ponctuation.
 */
describe('nomDuFichier', () => {
  it('recompose un nom lisible : qui, quoi, quand', () => {
    expect(nomDuFichier('Eugénie', 'Retrouver le sommeil', '2026-09-03T17:37:35Z')).toBe(
      'Eugenie_Retrouver-le-sommeil_2026-09-03.pdf',
    )
  })

  it('retire les accents et la ponctuation', () => {
    expect(nomDuFichier('Chloé Béart', "L'élan, retrouvé", '2026-01-05T08:00:00Z')).toBe(
      'Chloe-Beart_L-elan-retrouve_2026-01-05.pdf',
    )
  })

  it('tient face à un titre à rallonge', () => {
    const nom = nomDuFichier('A', 'x'.repeat(200), '2026-01-05T08:00:00Z')
    expect(nom.length).toBeLessThan(70)
    expect(nom.endsWith('.pdf')).toBe(true)
  })

  /* Un titre vide ne doit pas produire « Eugenie__2026-09-03.pdf ». */
  it('ne laisse pas de séparateur orphelin', () => {
    expect(nomDuFichier('Eugénie', '', '2026-09-03T17:37:35Z')).toBe('Eugenie_2026-09-03.pdf')
  })
})
