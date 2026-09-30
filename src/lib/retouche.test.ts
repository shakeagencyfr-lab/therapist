import { describe, expect, it } from 'vitest'
import {
  BORNE_PREFERENCE,
  BORNE_RETOUR,
  CIBLES_DE_VOTE,
  CIBLES_RETOUCHE,
  EXEMPLES_RETOUR,
  LIBELLE_CIBLE,
  actionDeLaRetouche,
  estCibleDeVote,
  estCibleRetouche,
  preferenceRetenue,
  retourLu,
  versionDe,
} from './retouche'

describe('retourLu — les deux réponses de la fenêtre', () => {
  it('les deux, sans leurs blancs', () => {
    expect(retourLu('  Trop rapide ', ' Plus lent  ')).toEqual({ ok: true, probleme: 'Trop rapide', attendu: 'Plus lent' })
  })

  it('« Optimiser » reste fermé tant qu’un champ est vide', () => {
    for (const [p, a] of [['', 'x'], ['x', '   '], [undefined, 'x'], ['x', 42]] as const) {
      const lu = retourLu(p, a)
      expect(lu.ok).toBe(false)
    }
  })

  it('refuse une réponse de plus de 2 000 caractères, en le disant', () => {
    const lu = retourLu('x'.repeat(BORNE_RETOUR + 1), 'y')
    expect(lu).toMatchObject({ ok: false })
    if (!lu.ok) expect(lu.message).toMatch(/2\s000 caractères/u)
    expect(retourLu('x'.repeat(BORNE_RETOUR), 'y').ok).toBe(true)
  })
})

describe('ce qui se retient', () => {
  it('la réponse à « que se serait-il dû passer ? », 400 caractères au plus', () => {
    expect(preferenceRetenue('  Des pauses  ')).toBe('Des pauses')
    expect(preferenceRetenue('x'.repeat(900))).toHaveLength(BORNE_PREFERENCE)
  })
})

describe('les types de texte', () => {
  it('huit se retouchent ; trois de plus se notent seulement', () => {
    expect(CIBLES_RETOUCHE).toHaveLength(8)
    expect(CIBLES_DE_VOTE).toEqual([...CIBLES_RETOUCHE, 'mots', 'vigilance', 'questions'])
    expect(estCibleRetouche('hypnose')).toBe(true)
    expect(estCibleRetouche('mots')).toBe(false)
    expect(estCibleDeVote('mots')).toBe(true)
    expect(estCibleDeVote('patient')).toBe(false)
  })

  it('chacun a son nom et ses exemples, dans les termes du texte', () => {
    for (const cible of CIBLES_RETOUCHE) {
      expect(LIBELLE_CIBLE[cible], cible).toBeTruthy()
      expect(EXEMPLES_RETOUR[cible].probleme, cible).toBeTruthy()
      expect(EXEMPLES_RETOUR[cible].attendu, cible).toBeTruthy()
    }
    expect(EXEMPLES_RETOUR.hypnose).toEqual({
      probleme: "Le rythme de l'induction est trop rapide",
      attendu: 'Des phrases plus longues, plus lentes, avec davantage de pauses',
    })
  })

  it('un mouvement d’hypnose se paie comme une retouche d’hypnose, le reste comme une retouche', () => {
    expect(actionDeLaRetouche('hypnose')).toBe('retouche_hypnose')
    for (const cible of CIBLES_RETOUCHE.filter((c) => c !== 'hypnose')) {
      expect(actionDeLaRetouche(cible), cible).toBe('retouche')
    }
  })
})

/* « Annuler la retouche » disparaît dès que le texte a été corrigé à la main :
   la version le dit. Une base qui relit un objet dans un autre ordre de clés
   ne doit pas le faire disparaître. */
describe('versionDe — le texte a-t-il changé depuis la retouche ?', () => {
  it('un texte est sa propre version', () => {
    expect(versionDe('La séance revient sur la semaine.')).toBe('La séance revient sur la semaine.')
  })

  it('l’ordre des clés ne compte pas, le contenu si', () => {
    const a = { titre: 'Repérer le seuil', pourquoi: 'p', type: 'Journal' }
    const b = { type: 'Journal', titre: 'Repérer le seuil', pourquoi: 'p' }
    expect(versionDe(a)).toBe(versionDe(b))
    expect(versionDe({ ...a, pourquoi: 'autre' })).not.toBe(versionDe(a))
    expect(versionDe({ steps: [{ b: 1, a: 2 }] })).toBe(versionDe({ steps: [{ a: 2, b: 1 }] }))
  })

  it('l’ordre d’une liste compte', () => {
    expect(versionDe(['a', 'b'])).not.toBe(versionDe(['b', 'a']))
  })
})
