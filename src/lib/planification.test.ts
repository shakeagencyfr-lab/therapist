import { describe, expect, it } from 'vitest'
import { libelleDuMoment, momentDuRaccourci, momentSaisi, valeurChamp } from './planification'

describe('momentDuRaccourci', () => {
  it('« maintenant » est maintenant', () => {
    const t = new Date('2026-09-02T10:00:00')
    expect(momentDuRaccourci('Maintenant', t).getTime()).toBe(t.getTime())
  })

  it('« ce soir » vise 20 h le jour même quand il est encore temps', () => {
    const soir = momentDuRaccourci('Ce soir, 20 h', new Date('2026-09-02T10:00:00'))
    expect(soir.getDate()).toBe(2)
    expect(soir.getHours()).toBe(20)
  })

  it('passé 20 h, « ce soir » bascule au lendemain plutôt que dans le passé', () => {
    // Le piège : une notification programmée dans le passé ne part jamais, et
    // personne ne s'en aperçoit.
    const soir = momentDuRaccourci('Ce soir, 20 h', new Date('2026-09-02T22:30:00'))
    expect(soir.getDate()).toBe(3)
    expect(soir.getHours()).toBe(20)
  })

  it('« demain, 8 h » est bien le lendemain matin', () => {
    const matin = momentDuRaccourci('Demain, 8 h', new Date('2026-09-02T22:30:00'))
    expect(matin.getDate()).toBe(3)
    expect(matin.getHours()).toBe(8)
  })
})

describe('libelleDuMoment', () => {
  it('écrit l’heure comme on la dit', () => {
    expect(libelleDuMoment(new Date('2026-09-09T14:00:00'))).toContain('14 h')
    expect(libelleDuMoment(new Date('2026-09-09T14:00:00'))).not.toContain('14 h 00')
    expect(libelleDuMoment(new Date('2026-09-09T14:30:00'))).toContain('14 h 30')
  })

  it('nomme le jour', () => {
    expect(libelleDuMoment(new Date('2026-09-09T14:00:00'))).toContain('9 septembre')
  })
})

describe('momentSaisi', () => {
  it('refuse le vide et l’incomplet plutôt que de rendre une date invalide', () => {
    expect(momentSaisi('')).toBeNull()
    expect(momentSaisi('pas une date')).toBeNull()
  })

  it('lit une saisie complète', () => {
    expect(momentSaisi('2026-09-09T14:30')?.getHours()).toBe(14)
  })

  it('fait l’aller-retour avec le champ du navigateur', () => {
    const d = new Date('2026-09-09T14:30:00')
    expect(momentSaisi(valeurChamp(d))?.getTime()).toBe(d.getTime())
  })
})
