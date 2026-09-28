import { describe, expect, it } from 'vitest'
import type { CustomModule } from '@/types/domain'
import { preparerModule } from './moduleAtelier'

const module = (patch: Partial<CustomModule> = {}): CustomModule => ({
  titre: 'Le délai de vingt minutes',
  duree: '3 minutes',
  quand: 'Après une contrariété',
  steps: ['Posez la main sur le sternum.', 'Comptez dix respirations.'],
  pourquoi: 'Pour laisser passer la vague.',
  quiz: [],
  type: 'Exercice',
  ...patch,
})

/**
 * L'atelier se présente comme un brouillon modifiable : ce que la
 * thérapeute laisse en chantier ne doit pas arriver tel quel chez le patient.
 */
describe('preparerModule', () => {
  it('laisse passer un module relu tel quel', () => {
    const r = preparerModule(module())
    expect(r).toEqual({ ok: true, module: module() })
  })

  /* Une étape vide s'afficherait comme une puce numérotée sans rien à côté. */
  it('écarte les étapes vidées et rogne les autres', () => {
    const r = preparerModule(module({ steps: ['  Posez la main.  ', '', '   ', 'Respirez.'] }))
    expect(r.ok && r.module.steps).toEqual(['Posez la main.', 'Respirez.'])
  })

  it('refuse une consigne sans aucune étape', () => {
    const r = preparerModule(module({ steps: ['', '  '] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/aucune étape/)
  })

  it('redonne une valeur neutre aux champs de contexte effacés', () => {
    const r = preparerModule(module({ titre: ' ', duree: '', quand: '  ' }))
    expect(r.ok && [r.module.titre, r.module.duree, r.module.quand]).toEqual([
      'Module sur mesure',
      'Quelques minutes',
      'Comme indiqué sur le module',
    ])
  })
})
