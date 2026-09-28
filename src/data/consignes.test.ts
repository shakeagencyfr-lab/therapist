import { describe, expect, it } from 'vitest'
import type { CustomModule, PatientModule } from '@/types/domain'
import { CONSIGNES, CONSIGNE_PAR_TYPE, consigneFor } from './consignes'

const base: PatientModule = { title: 'Lettre à la cigarette', meta: '', kind: 'Écriture', done: false }

const atelier: Record<string, CustomModule[]> = {
  Exercice: [
    {
      titre: 'Lettre à la cigarette',
      duree: '5 min',
      quand: 'Le soir',
      steps: ['Version atelier'],
      pourquoi: 'Atelier',
      quiz: [],
      type: 'Exercice',
    },
  ],
}

describe('la consigne montrée par l’aperçu', () => {
  /* Le défaut : l'aperçu cherchait par titre dans l'atelier, et la
     thérapeute relisait autre chose que ce que son patient lit. */
  it('est celle du module quand il en porte une', () => {
    const module: PatientModule = {
      ...base,
      id: 'm1',
      consigne: { duree: '2 min', quand: 'Au réveil', steps: ['Corrigée'], why: 'Relue par la thérapeute.' },
    }
    expect(consigneFor(module, atelier)).toMatchObject({ steps: ['Corrigée'], why: 'Relue par la thérapeute.' })
  })

  it('complète une consigne de séance qui n’a que son « pourquoi »', () => {
    const module = { ...base, id: 'm1', consigne: { why: 'Dit en séance.' } as PatientModule['consigne'] }
    expect(consigneFor(module, {})).toEqual({ duree: '', quand: '', steps: [], why: 'Dit en séance.' })
  })

  it('garde le quiz du module', () => {
    const quiz = [{ question: 'Q', options: ['a', 'b'], correct: 1, feedback: 'f' }]
    const module = { ...base, id: 'm1', consigne: { duree: '', quand: '', steps: [], quiz } }
    expect(consigneFor(module, {})?.quiz).toEqual(quiz)
  })

  /* Sur un dossier réel, rien d'inventé : l'espace patient dit qu'il n'y a
     pas de consigne, l'aperçu aussi. */
  it('n’invente rien pour un module réel sans consigne', () => {
    expect(consigneFor({ ...base, id: 'm1' }, atelier)).toBeNull()
  })

  it('sert encore les modèles à la démonstration', () => {
    expect(consigneFor(base, atelier)?.steps).toEqual(['Version atelier'])
    expect(consigneFor(base, {})).toBe(CONSIGNES['Lettre à la cigarette'])
    expect(consigneFor({ ...base, title: 'Inconnu' }, {})).toBe(CONSIGNE_PAR_TYPE['Écriture'])
  })
})
