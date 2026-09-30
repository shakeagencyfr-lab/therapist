import { describe, expect, it } from 'vitest'
import {
  BORNE_PREFERENCE,
  BORNE_RETOUR,
  CIBLES_DE_VOTE,
  CIBLES_RETOUCHE,
  EXEMPLES_RETOUR,
  LIBELLE_CIBLE,
  actionDeLaRetouche,
  consigneLue,
  estCibleDeVote,
  estCibleRetouche,
  nomDansLaConsigne,
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

/* Une consigne retenue part chez TOUS les patients du cabinet : elle se relit
   avant l'envoi, rien ne s'y coupe, et le nom du patient la fait refuser. */
describe('consigneLue — ce qui se retient', () => {
  it('la consigne relue, sans ses blancs', () => {
    expect(consigneLue('  Des pauses  ')).toEqual({ ok: true, consigne: 'Des pauses' })
    expect(consigneLue('x'.repeat(BORNE_PREFERENCE))).toEqual({ ok: true, consigne: 'x'.repeat(BORNE_PREFERENCE) })
  })

  it('vide : refusée, avec de quoi s’en sortir', () => {
    for (const vide of ['', '   ', undefined, 42]) {
      const lu = consigneLue(vide)
      expect(lu.ok).toBe(false)
      if (!lu.ok) expect(lu.message).toContain('décochez')
    }
  })

  it('trop longue : refusée avec son compte, JAMAIS coupée', () => {
    const lu = consigneLue('Des phrases lentes. '.repeat(30) + 'Et surtout aucune image d’eau.')
    expect(lu.ok).toBe(false)
    if (!lu.ok) {
      expect(lu.message).toContain(`${BORNE_PREFERENCE} caractères au plus`)
      expect(lu.message).toMatch(/\(\d+ \/ 400\)/)
      expect(lu.message).toContain('raccourcissez-la')
    }
  })

  it('porte le prénom ou le nom du patient : refusée, en disant lequel', () => {
    const prenom = consigneLue('Reprendre le jardin de la grand-mère de Marie, à Quimper', 'Marie Dupont')
    expect(prenom.ok).toBe(false)
    if (!prenom.ok) {
      expect(prenom.message).toContain('« Marie »')
      expect(prenom.message).toContain('tous vos patients')
    }
    const nom = consigneLue('Comme pour M. dupont : des pauses', 'Marie Dupont')
    expect(nom).toMatchObject({ ok: false })
    if (!nom.ok) expect(nom.message).toContain('« Dupont »')
    // Sans patient connu, la même consigne passe : le contrôle ne se fait que là où le nom est su.
    expect(consigneLue('Reprendre le jardin de Marie', undefined).ok).toBe(true)
    expect(consigneLue('Des pauses marquées', 'Marie Dupont')).toEqual({ ok: true, consigne: 'Des pauses marquées' })
  })
})

describe('nomDansLaConsigne — le nom, mot à mot', () => {
  it('sans majuscules ni accents', () => {
    expect(nomDansLaConsigne('penser à helene', 'Hélène Martin')).toBe('Hélène')
    expect(nomDansLaConsigne('Pour ÉLODIE, plus lent', 'Elodie Roy')).toBe('Elodie')
  })

  it('un mot entier, pas un morceau de mot', () => {
    expect(nomDansLaConsigne('Une voix mariée au silence', 'Marie Dupont')).toBeNull()
    expect(nomDansLaConsigne('Des années lentes', 'Anne Roy')).toBeNull()
  })

  it('chaque partie d’un nom composé, mais ni les particules ni les initiales', () => {
    expect(nomDansLaConsigne('Pour Jean, plus lent', 'Jean-Pierre Martin')).toBe('Jean')
    expect(nomDansLaConsigne('Un rythme de la mer, plus lent', 'Marie de la Tour')).toBeNull()
    expect(nomDansLaConsigne('Des pauses, et un souffle', 'Camille L.')).toBeNull()
    expect(nomDansLaConsigne('La tour du souffle', 'Marie de la Tour')).toBe('Tour')
  })

  it('rien à comparer : rien de trouvé', () => {
    expect(nomDansLaConsigne('Marie', '')).toBeNull()
    expect(nomDansLaConsigne('Marie', null)).toBeNull()
    expect(nomDansLaConsigne('', 'Marie')).toBeNull()
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
