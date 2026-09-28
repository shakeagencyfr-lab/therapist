import { describe, expect, it } from 'vitest'
import { messageConnexionMotDePasse, messageEnvoiLien, refusCaptcha } from './messageAuth'

describe('messageEnvoiLien', () => {
  it('ne dit rien quand il n’y a pas d’erreur', () => {
    expect(messageEnvoiLien(null)).toBe('')
    expect(messageEnvoiLien(undefined)).toBe('')
  })

  it('sur un refus pour cadence, disculpe l’adresse et n’invite pas à réessayer tout de suite', () => {
    const m = messageEnvoiLien({ status: 429, code: 'over_email_send_rate_limit' })
    expect(m).toContain("n'est pas en cause")
    expect(m).toContain('patientez')
    // Le défaut d'origine : envoyer relire une adresse correcte.
    expect(m).not.toMatch(/vérifiez.{0,20}adresse/i)
  })

  it('reconnaît la cadence au seul code, sans le statut', () => {
    expect(messageEnvoiLien({ code: 'over_email_send_rate_limit' })).toContain("n'est pas en cause")
  })

  it('ne parle de l’adresse que lorsqu’elle est réellement refusée', () => {
    expect(messageEnvoiLien({ status: 422 })).toMatch(/adresse/i)
    expect(messageEnvoiLien({ status: 400 })).toMatch(/adresse/i)
  })

  it('reste utile face à une panne qu’on ne sait pas nommer', () => {
    const m = messageEnvoiLien({ status: 500, message: 'boom' })
    expect(m).toContain('Réessayez')
    expect(m).not.toMatch(/adresse/i)
  })

  /* Le refus du CAPTCHA porte le statut 400, comme une adresse mal formée :
     lu au seul statut, un jeton expiré faisait relire une adresse juste. */
  it('reconnaît le refus du CAPTCHA avant le 400 générique', () => {
    const m = messageEnvoiLien({
      status: 400,
      code: 'captcha_failed',
      message: 'captcha protection: request disallowed (timeout-or-duplicate)',
    })
    expect(m).toContain('Refaites la vérification anti-robot')
    expect(m).not.toContain("n'est pas acceptée")
  })
})

describe('refusCaptcha', () => {
  it('se lit au code', () => {
    expect(refusCaptcha({ status: 400, code: 'captcha_failed' })).toBe(true)
  })

  it('se lit au message, pour un service qui n’envoie pas de code', () => {
    expect(refusCaptcha({ status: 400, message: 'captcha verification process failed' })).toBe(true)
  })

  it('ne confond pas un autre refus avec le CAPTCHA', () => {
    expect(refusCaptcha({ status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(false)
    expect(refusCaptcha({ status: 422, code: 'validation_failed' })).toBe(false)
    expect(refusCaptcha(null)).toBe(false)
  })
})

describe('messageConnexionMotDePasse', () => {
  it('ne dit rien quand il n’y a pas d’erreur', () => {
    expect(messageConnexionMotDePasse(undefined)).toBe('')
  })

  it('ne présente pas un refus du CAPTCHA comme un mot de passe faux', () => {
    const m = messageConnexionMotDePasse({ status: 400, code: 'captcha_failed' })
    expect(m).toContain('Refaites la vérification anti-robot')
    expect(m).not.toMatch(/incorrect/i)
  })

  it('ne dit jamais lequel, de l’adresse ou du mot de passe, est faux', () => {
    const m = messageConnexionMotDePasse({ status: 400, code: 'invalid_credentials' })
    expect(m).toMatch(/adresse ou mot de passe incorrect/i)
  })

  it('renvoie aux messages de l’envoi pour le reste', () => {
    expect(messageConnexionMotDePasse({ status: 500 })).toContain('Réessayez')
  })
})
