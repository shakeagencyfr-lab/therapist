import { describe, expect, it } from 'vitest'
import { suiteDe, tendance } from './PsychProfile'
import type { PsychProfile } from '@/types/domain'

const profil = (historique: PsychProfile['historique']): PsychProfile => ({
  updated: '',
  portrait: '',
  axes: [],
  levers: [],
  care: [],
  historique,
})

describe('suiteDe — l’histoire d’un axe', () => {
  it('suit un axe à travers les versions, dans le sens du temps', () => {
    const p = profil([
      { version: 1, sessions: 1, axes: [{ label: 'Élan', value: 30, note: '' }] },
      { version: 2, sessions: 2, axes: [{ label: 'Élan', value: 45, note: '' }] },
      { version: 3, sessions: 4, axes: [{ label: 'Élan', value: 52, note: '' }] },
    ])
    expect(suiteDe(p, 'Élan')).toEqual([30, 45, 52])
  })

  /* Le modèle peut remplacer un axe quand la séance en révèle un plus juste.
     L'axe renommé repart alors d'une courbe vide, et c'est honnête : ce n'est
     plus la même mesure, la rattacher à l'ancienne inventerait une continuité. */
  it('ne raccroche pas un axe renommé à l’ancien', () => {
    const p = profil([
      { version: 1, sessions: 1, axes: [{ label: 'Élan', value: 30, note: '' }] },
      { version: 2, sessions: 2, axes: [{ label: 'Mise en mouvement', value: 45, note: '' }] },
    ])
    expect(suiteDe(p, 'Mise en mouvement')).toEqual([45])
  })

  it('rend une suite vide sans historique', () => {
    expect(suiteDe(profil(undefined), 'Élan')).toEqual([])
  })
})

describe('tendance — un écart sous la marge n’est pas un mouvement', () => {
  /* La marge d'incertitude existe pour dire ce qu'on ne sait pas encore.
     Annoncer « + 3 » sur un axe mesuré à ± 12 près la rendrait décorative,
     et ferait lire un mouvement là où il n'y a que du bruit. */
  it('dit « stable » quand l’écart tient dans la marge', () => {
    expect(tendance([40, 43], 12).sens).toBe('stable')
    expect(tendance([40, 29], 12).sens).toBe('stable')
  })

  it('nomme le sens quand l’écart dépasse la marge', () => {
    expect(tendance([30, 52], 12)).toEqual({ sens: 'hausse', ecart: 22 })
    expect(tendance([60, 40], 12)).toEqual({ sens: 'baisse', ecart: -20 })
  })

  it('mesure du premier au dernier, pas du dernier saut', () => {
    // Une remontée finale ne doit pas masquer une baisse d'ensemble.
    expect(tendance([70, 30, 45], 10)).toEqual({ sens: 'baisse', ecart: -25 })
  })

  it('une seule version n’est pas une tendance', () => {
    expect(tendance([50], 12)).toEqual({ sens: 'stable', ecart: 0 })
    expect(tendance([], 12)).toEqual({ sens: 'stable', ecart: 0 })
  })
})
