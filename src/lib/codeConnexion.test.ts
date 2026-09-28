import { describe, expect, it } from 'vitest'
import { codeComplet, LONGUEUR_CODE, normaliserCode } from './codeConnexion'
import { messageCode } from './messageAuth'

/**
 * Le code reçu par courriel.
 *
 * C'est la seule porte qui s'ouvre depuis l'espace installé sur un iPhone :
 * le lien, lui, mène à Safari. Un code juste refusé pour une espace collée
 * ferait croire le code faux — ou la porte cassée.
 */
describe('normaliserCode', () => {
  it('garde les chiffres, et eux seuls', () => {
    expect(normaliserCode('123 456')).toBe('123456')
    expect(normaliserCode('123-456')).toBe('123456')
    expect(normaliserCode(' 12a34 56\n')).toBe('123456')
  })

  it('ne laisse pas grandir un collage sans fin', () => {
    expect(normaliserCode('1'.repeat(40)).length).toBe(10)
  })
})

describe('codeComplet', () => {
  it(`attend au moins ${LONGUEUR_CODE} chiffres`, () => {
    expect(codeComplet('12345')).toBe(false)
    expect(codeComplet('123456')).toBe(true)
    expect(codeComplet('123 456')).toBe(true)
  })

  it('accepte un code plus long, si le réglage du service a changé', () => {
    expect(codeComplet('12345678')).toBe(true)
  })
})

describe('messageCode', () => {
  it('ne dit rien sans erreur', () => {
    expect(messageCode(null)).toBe('')
  })

  it('sur un code refusé, dit les trois causes et le geste qui les règle', () => {
    const m = messageCode({ status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' })
    expect(m).toMatch(/inexact/)
    expect(m).toMatch(/expiré/)
    expect(m).toMatch(/nouveau code/)
  })

  it('sur trop d’essais, fait patienter plutôt que retaper', () => {
    const m = messageCode({ status: 429, code: 'over_request_rate_limit' })
    expect(m).toMatch(/Patientez/)
    expect(m).not.toMatch(/inexact/)
  })

  it('reste utile face à une panne qu’on ne sait pas nommer', () => {
    expect(messageCode({ status: 500, message: 'boom' })).toMatch(/Réessayez/)
  })
})
