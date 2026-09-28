import { describe, expect, it } from 'vitest'
import {
  cleDeBrouillon,
  garderBrouillon,
  lireBrouillon,
  oublierBrouillon,
  oublierLesBrouillons,
  type Stockage,
} from './brouillon'

/** Un stockage d'onglet en mémoire, comme sessionStorage. */
function onglet(depart: Record<string, string> = {}): Stockage & { tout: Map<string, string> } {
  const tout = new Map(Object.entries(depart))
  return {
    tout,
    getItem: (c) => tout.get(c) ?? null,
    setItem: (c, v) => void tout.set(c, v),
    removeItem: (c) => void tout.delete(c),
    get length() {
      return tout.size
    },
    key: (i) => [...tout.keys()][i] ?? null,
  }
}

/** Un stockage qui refuse tout, comme certains modes privés. */
const refuse: Stockage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
  get length(): number {
    throw new Error('SecurityError')
  },
  key: () => null,
}

describe('les brouillons', () => {
  const cle = cleDeBrouillon('p1', 'journal.texte')

  it('rangent le texte sous le patient, pour que deux comptes ne se lisent pas', () => {
    expect(cle).not.toBe(cleDeBrouillon('p2', 'journal.texte'))
    expect(cle).toContain('p1')
  })

  it('gardent ce qui est écrit, et le rendent au retour', () => {
    const s = onglet()
    garderBrouillon(s, cle, 'Dix lignes au pouce')
    expect(lireBrouillon(s, cle)).toBe('Dix lignes au pouce')
  })

  /* Un champ vidé exprès ne doit pas resurgir au passage suivant. */
  it('oublient un champ vidé, ou revenu à ce qui est déjà enregistré', () => {
    const s = onglet()
    garderBrouillon(s, cle, 'quelque chose')
    garderBrouillon(s, cle, '   ')
    expect(lireBrouillon(s, cle)).toBeNull()

    garderBrouillon(s, cle, 'la note enregistrée', 'la note enregistrée')
    expect(lireBrouillon(s, cle)).toBeNull()
  })

  it('s’effacent à l’envoi', () => {
    const s = onglet({ [cle]: 'envoyé' })
    oublierBrouillon(s, cle)
    expect(lireBrouillon(s, cle)).toBeNull()
  })

  it('partent tous à la déconnexion, et seulement eux', () => {
    const s = onglet({
      [cleDeBrouillon('p1', 'mot')]: 'a',
      [cleDeBrouillon('p1', 'journal.texte')]: 'b',
      [cleDeBrouillon('p2', 'note.m1')]: 'c',
      'klaro.installation.plusTard': '123',
    })
    oublierLesBrouillons(s)
    expect([...s.tout.keys()]).toEqual(['klaro.installation.plusTard'])
  })

  it('ne cassent rien quand le stockage est refusé ou absent', () => {
    expect(() => garderBrouillon(refuse, cle, 'x')).not.toThrow()
    expect(lireBrouillon(refuse, cle)).toBeNull()
    expect(() => oublierBrouillon(refuse, cle)).not.toThrow()
    expect(() => oublierLesBrouillons(refuse)).not.toThrow()
    expect(lireBrouillon(null, cle)).toBeNull()
    expect(() => oublierLesBrouillons(null)).not.toThrow()
  })
})
