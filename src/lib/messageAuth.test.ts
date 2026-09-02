import { describe, expect, it } from 'vitest'
import { messageEnvoiLien } from './messageAuth'

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
})
