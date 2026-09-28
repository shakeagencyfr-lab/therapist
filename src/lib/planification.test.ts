import { describe, expect, it } from 'vitest'
import { libelleDuMoment, momentDEnvoi, momentDuRaccourci, momentSaisi, valeurChamp } from './planification'

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

describe('momentDEnvoi — rien ne part sur une date qui n’en est pas une', () => {
  const maintenant = new Date('2026-09-02T10:00:00')

  it('une date précise effacée bloque l’envoi au lieu de partir « maintenant »', () => {
    // Le défaut : champ vidé → libellé « Date incomplète » → retombait sur
    // « maintenant », et le mot du soir partait à 10 h.
    const r = momentDEnvoi('', 'Date incomplète', true, maintenant)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.raison).toContain('Date incomplète')
  })

  it('un libellé inconnu sans date ne vaut pas « maintenant » non plus', () => {
    expect(momentDEnvoi('', 'Date incomplète', false, maintenant).ok).toBe(false)
  })

  it('refuse une date déjà passée', () => {
    const r = momentDEnvoi('2026-09-02T09:00', 'mercredi 2 septembre, 9 h', true, maintenant)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.raison).toContain('déjà passée')
  })

  it('accepte une date à venir, telle quelle', () => {
    const r = momentDEnvoi('2026-09-03T09:00', 'jeudi 3 septembre, 9 h', true, maintenant)
    expect(r.ok && r.moment.getTime()).toBe(new Date('2026-09-03T09:00').getTime())
  })

  it('laisse les trois raccourcis calculer leur moment', () => {
    const soir = momentDEnvoi('', 'Ce soir, 20 h', false, maintenant)
    expect(soir.ok && soir.moment.getHours()).toBe(20)
    const tout = momentDEnvoi('', 'Maintenant', false, maintenant)
    expect(tout.ok && tout.moment.getTime()).toBe(maintenant.getTime())
  })
})
