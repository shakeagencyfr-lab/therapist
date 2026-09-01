import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chiffrer, chiffrementConfigure, dechiffrer, empreinte } from './secrets.js'
import { HttpError } from './errors.js'

describe('secrets — chiffrement des clés confiées', () => {
  beforeEach(() => {
    process.env.INTEGRATIONS_KEY = 'une-phrase-longue-et-secrete-pour-les-tests'
  })
  afterEach(() => {
    delete process.env.INTEGRATIONS_KEY
  })

  it('aller-retour', () => {
    const clair = 'sk-ant-api03-exemple-de-cle'
    const scelle = chiffrer(clair)
    expect(scelle).not.toContain(clair)
    expect(scelle.startsWith('v1:')).toBe(true)
    expect(dechiffrer(scelle)).toBe(clair)
  })

  it('deux chiffrements de la même valeur diffèrent (IV neuf)', () => {
    expect(chiffrer('x')).not.toBe(chiffrer('x'))
  })

  it('une valeur altérée ne se déchiffre pas', () => {
    const scelle = chiffrer('secret')
    const parts = scelle.split(':')
    parts[3] = Buffer.from('autre chose').toString('base64')
    expect(() => dechiffrer(parts.join(':'))).toThrow()
  })

  it('sans INTEGRATIONS_KEY : refus explicite, jamais de clair', () => {
    delete process.env.INTEGRATIONS_KEY
    expect(chiffrementConfigure()).toBe(false)
    try {
      chiffrer('secret')
      expect.fail('devait lever')
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError)
      expect((err as HttpError).status).toBe(503)
    }
  })

  it('empreinte : les quatre derniers caractères, rien de plus', () => {
    expect(empreinte('sk-ant-api03-ABCDEFGH')).toBe('…EFGH')
    expect(empreinte('abc')).toBe('••••')
  })
})
