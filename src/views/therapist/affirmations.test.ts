import { describe, expect, it } from 'vitest'
import { envoiDesAffirmations, etatDesAffirmations } from './Affirmations'

/**
 * « Envoyer au patient » s'arrêtait en silence sur une liste vide : la
 * thérapeute ne pouvait pas retirer toutes les affirmations, et le patient
 * gardait des phrases qu'elle avait effacées.
 */
describe('envoiDesAffirmations', () => {
  it('envoie les lignes remplies, rognées', () => {
    expect(envoiDesAffirmations(['  Je respire.  ', '', 'Je suis calme.'], 3, false)).toEqual({
      geste: 'envoyer',
      textes: ['Je respire.', 'Je suis calme.'],
    })
  })

  it('demande confirmation avant de tout retirer', () => {
    expect(envoiDesAffirmations(['', '  '], 2, false)).toEqual({ geste: 'confirmer' })
  })

  it('retire tout une fois confirmé', () => {
    expect(envoiDesAffirmations([], 2, true)).toEqual({ geste: 'envoyer', textes: [] })
  })

  it("ne fait rien quand il n'y a rien d'un côté ni de l'autre", () => {
    expect(envoiDesAffirmations([''], 0, true)).toEqual({ geste: 'rien' })
  })
})

describe('etatDesAffirmations', () => {
  it('accorde le compte au singulier', () => {
    expect(etatDesAffirmations('Marc', 1, false)).toBe('1 affirmation actuellement visible par Marc.')
    expect(etatDesAffirmations('Marc', 3, false)).toBe('3 affirmations actuellement visibles par Marc.')
  })

  it('dit ce que le patient lit encore quand des corrections attendent', () => {
    expect(etatDesAffirmations('Marc', 1, true)).toBe('Corrections non envoyées. Marc lit encore la phrase précédente.')
    expect(etatDesAffirmations('Marc', 4, true)).toBe(
      'Corrections non envoyées. Marc lit encore les 4 phrases précédentes.',
    )
    expect(etatDesAffirmations('Marc', 0, true)).toBe("Corrections non envoyées. Rien n'est encore visible chez Marc.")
  })

  it('dit quand rien n’est visible', () => {
    expect(etatDesAffirmations('Marc', 0, false)).toBe("Rien n'est visible chez Marc pour l'instant.")
  })
})
