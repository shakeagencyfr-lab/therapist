import { describe, expect, it } from 'vitest'
import { etatInstallation, installationAProposer, type EnvInstallation } from './installable'

const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const CHROME_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1'
const INSTAGRAM_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0'
const GMAIL_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GmailApp/6.0'

const BASE: EnvInstallation = { installee: false, invitation: false, ios: false, userAgent: '' }

describe('ce qu’on peut proposer sur cet appareil', () => {
  it('ne propose rien à un espace déjà installé, quoi que dise le navigateur', () => {
    expect(etatInstallation({ ...BASE, installee: true, invitation: true })).toBe('installee')
  })

  it('offre un vrai bouton quand le navigateur a annoncé savoir installer', () => {
    expect(etatInstallation({ ...BASE, invitation: true })).toBe('bouton')
  })

  it('donne les étapes à la main dans Safari sur iPhone', () => {
    expect(etatInstallation({ ...BASE, ios: true, userAgent: SAFARI_IPHONE })).toBe('ios')
  })

  /* Le lien de connexion s'ouvre souvent dans Gmail ou dans une autre
     application : leur navigateur intégré ne sait pas installer. Donner les
     étapes de Safari là-dedans, c'est faire chercher un bouton qui n'existe
     pas. */
  it('fait d’abord rouvrir la page dans Safari depuis un autre navigateur ou une application', () => {
    for (const ua of [CHROME_IPHONE, INSTAGRAM_IPHONE, GMAIL_IPHONE]) {
      expect({ [ua.slice(-24)]: etatInstallation({ ...BASE, ios: true, userAgent: ua }) }).toEqual({
        [ua.slice(-24)]: 'ios-ailleurs',
      })
    }
  })

  it('se tait là où aucun geste n’aboutirait', () => {
    expect(etatInstallation(BASE)).toBe('impossible')
    expect(installationAProposer('impossible')).toBe(false)
    expect(installationAProposer('installee')).toBe(false)
    expect(installationAProposer('bouton')).toBe(true)
    expect(installationAProposer('ios')).toBe(true)
  })
})
