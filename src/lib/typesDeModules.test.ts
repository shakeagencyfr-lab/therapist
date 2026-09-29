import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ATELIER_TYPES } from '@/data/atelier'
import { DEFINITION_DU_TYPE, TYPES_PROPOSABLES, seFaitParLePatient, typeDeModule } from './typesDeModules'

/**
 * Ce qu'un module demande au patient.
 *
 * Constaté en production : deux modules « Audio » et deux « Échelle », issus
 * de séances, jamais faits — ils ne pouvaient pas l'être, l'espace du patient
 * ne les montre pas comme des tâches. Ils étaient pourtant proposés par
 * l'IA, payés d'une consigne, et comptés dans l'assiduité.
 */
describe('seFaitParLePatient — ce que l’assiduité a le droit de compter', () => {
  it('ni un audio ni l’échelle du soir ne sont des tâches', () => {
    expect(seFaitParLePatient('Audio')).toBe(false)
    expect(seFaitParLePatient('Échelle')).toBe(false)
  })

  it('tout le reste se fait, et se coche', () => {
    for (const kind of ['Exercice', 'Journal', 'Écriture', 'Visualisation', 'Séance', 'Formulaire', 'Module'] as const) {
      expect(seFaitParLePatient(kind), kind).toBe(true)
    }
  })
})

describe('TYPES_PROPOSABLES — ce que le brouillon de séance peut proposer', () => {
  it('ne propose que des tâches', () => {
    expect(TYPES_PROPOSABLES.length).toBeGreaterThan(0)
    for (const type of TYPES_PROPOSABLES) expect(seFaitParLePatient(type), type).toBe(true)
  })

  it('ni « Audio » ni « Échelle »', () => {
    expect(TYPES_PROPOSABLES).not.toContain('Audio')
    expect(TYPES_PROPOSABLES).not.toContain('Échelle')
  })

  /* L'espace du patient filtre ces deux types en dur. Si l'un des deux
     fichiers change sans l'autre, un module redeviendrait invisible et
     compté — ou visible et ignoré. La garde porte sur le texte du source. */
  it('suit le filtre de l’espace du patient', () => {
    const espace = readFileSync(new URL('../patient/PatientSpace.tsx', import.meta.url), 'utf8')
    expect(espace).toContain("m.kind !== 'Audio'")
    expect(espace).toContain("m.kind !== 'Échelle'")
  })
})

describe('typeDeModule — une valeur reçue de l’extérieur', () => {
  it('reconnaît un type existant', () => {
    expect(typeDeModule('Exercice')).toBe('Exercice')
    expect(typeDeModule('Écriture')).toBe('Écriture')
  })

  it('refuse ce qui n’en est pas un', () => {
    expect(typeDeModule('exercice')).toBeNull()
    expect(typeDeModule('toString')).toBeNull()
    expect(typeDeModule(42)).toBeNull()
    expect(typeDeModule(undefined)).toBeNull()
  })
})

describe('DEFINITION_DU_TYPE — ce que la thérapeute lit sous les puces', () => {
  it('chaque type de l’atelier a sa phrase', () => {
    for (const type of ATELIER_TYPES) {
      expect({ [type]: (DEFINITION_DU_TYPE[type] ?? '').length > 40 }).toEqual({ [type]: true })
    }
  })
})
