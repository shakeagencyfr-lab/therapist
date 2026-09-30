import { describe, expect, it, vi } from 'vitest'
import { MISE_A_JOUR } from '../src/legal/version.js'
import { deposerDemande, estUneDemande, ipDuVisiteur, VERSION_DES_CONDITIONS, type PorteDemande } from './demandes.js'

const DEMANDE = {
  nom: 'Claire Fontaine',
  email: 'claire@cabinet-fontaine.fr',
  telephone: '',
  cabinet: 'Cabinet Claire Fontaine',
  ville: 'Nantes',
  patients: '10-25',
  offre: 'cabinet',
  message: '',
  consentement: true,
  conditions: true,
}

function porte(reglages: Partial<PorteDemande> = {}): PorteDemande & {
  deposer: ReturnType<typeof vi.fn>
  verifierCaptcha: ReturnType<typeof vi.fn>
} {
  return {
    secretCaptcha: null,
    verifierCaptcha: vi.fn(async () => true),
    deposer: vi.fn(async () => ({ ok: true })),
    ...reglages,
  } as never
}

describe('la demande d’essai, côté serveur', () => {
  it('dépose une demande en règle et confirme sans promettre de délai', async () => {
    const p = porte()
    const r = await deposerDemande({ geste: 'demande-essai', demande: DEMANDE }, null, p)
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(r.body.message).toContain('claire@cabinet-fontaine.fr')
    expect(p.deposer).toHaveBeenCalledTimes(1)
    expect(p.deposer.mock.calls[0]?.[0]).toMatchObject({ email: 'claire@cabinet-fontaine.fr', consentement: true })
  })

  /* Le champ piège : un « merci », et rien d'écrit. */
  it('remercie le robot qui remplit le champ piège, et n’écrit rien', async () => {
    const p = porte()
    const r = await deposerDemande({ demande: DEMANDE, piege: 'https://spam.example' }, null, p)
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(p.deposer).not.toHaveBeenCalled()
  })

  it('refuse une demande incomplète, champ par champ, sans rien écrire', async () => {
    const p = porte()
    const r = await deposerDemande({ demande: { ...DEMANDE, consentement: false, email: 'claire' } }, null, p)
    expect(r.status).toBe(400)
    expect(Object.keys(r.body.erreurs ?? {}).sort()).toEqual(['consentement', 'email'])
    expect(p.deposer).not.toHaveBeenCalled()
  })

  /* Accepter d'être recontacté n'est pas accepter les conditions : sans la
     seconde case, rien ne part — même si l'écran a été contourné. */
  it('refuse une demande dont les conditions ne sont pas acceptées', async () => {
    const p = porte()
    for (const conditions of [false, undefined, 'true', 1]) {
      const r = await deposerDemande({ demande: { ...DEMANDE, conditions } }, null, p)
      expect(r.status, String(conditions)).toBe(400)
      expect(Object.keys(r.body.erreurs ?? {})).toEqual(['conditions'])
    }
    expect(p.deposer).not.toHaveBeenCalled()
  })

  it('dépose la version des conditions fixée par le serveur, jamais celle de la requête', async () => {
    const p = porte()
    await deposerDemande({ demande: { ...DEMANDE, conditionsVersion: '1er janvier 1970' } }, null, p)
    expect(VERSION_DES_CONDITIONS).toBe(MISE_A_JOUR)
    expect(p.deposer.mock.calls[0]?.[0]).toMatchObject({ conditions: true })
    expect(JSON.stringify(p.deposer.mock.calls[0]?.[0])).not.toContain('1970')
  })

  describe('avec le CAPTCHA réglé', () => {
    it('exige le jeton', async () => {
      const p = porte({ secretCaptcha: 'secret' })
      const r = await deposerDemande({ demande: DEMANDE }, null, p)
      expect(r.status).toBe(400)
      expect(p.deposer).not.toHaveBeenCalled()
    })

    it('refuse un jeton que hCaptcha ne reconnaît pas', async () => {
      const p = porte({ secretCaptcha: 'secret', verifierCaptcha: vi.fn(async () => false) })
      const r = await deposerDemande({ demande: DEMANDE, captcha: 'faux' }, '203.0.113.4', p)
      expect(r.status).toBe(400)
      expect(p.deposer).not.toHaveBeenCalled()
    })

    it('dit que hCaptcha ne répond pas, sans rien écrire', async () => {
      const p = porte({
        secretCaptcha: 'secret',
        verifierCaptcha: vi.fn(async () => {
          throw new Error('timeout')
        }),
      })
      const r = await deposerDemande({ demande: DEMANDE, captcha: 'jeton' }, null, p)
      expect(r.status).toBe(503)
      expect(p.deposer).not.toHaveBeenCalled()
    })

    it('dépose une fois le jeton reconnu, avec l’adresse du visiteur', async () => {
      const p = porte({ secretCaptcha: 'secret' })
      const r = await deposerDemande({ demande: DEMANDE, captcha: 'jeton' }, '203.0.113.4', p)
      expect(r.status).toBe(200)
      expect(p.verifierCaptcha).toHaveBeenCalledWith('jeton', 'secret', '203.0.113.4')
      expect(p.deposer).toHaveBeenCalledTimes(1)
    })
  })

  it('ne demande aucun jeton quand le CAPTCHA n’est pas réglé', async () => {
    const p = porte()
    await deposerDemande({ demande: DEMANDE, captcha: 'peu importe' }, null, p)
    expect(p.verifierCaptcha).not.toHaveBeenCalled()
  })

  it('traduit les bornes de la base', async () => {
    const adresse = await deposerDemande({ demande: DEMANDE }, null, porte({ deposer: vi.fn(async () => ({ ok: false, motif: 'adresse' })) }))
    expect(adresse.status).toBe(429)
    const heure = await deposerDemande({ demande: DEMANDE }, null, porte({ deposer: vi.fn(async () => ({ ok: false, motif: 'heure' })) }))
    expect(heure.status).toBe(429)
    const fermee = await deposerDemande({ demande: DEMANDE }, null, porte({ deposer: vi.fn(async () => ({ ok: false, motif: 'fermee' })) }))
    expect(fermee.status).toBe(503)
  })

  it('dit que la base n’a pas répondu', async () => {
    const r = await deposerDemande({ demande: DEMANDE }, null, porte({ deposer: vi.fn(async () => null) }))
    expect(r.status).toBe(503)
    expect(r.body.ok).toBeUndefined()
  })
})

describe('l’aiguillage de api/invitations', () => {
  it('reconnaît une demande d’essai, et elle seule', () => {
    expect(estUneDemande({ geste: 'demande-essai' })).toBe(true)
    expect(estUneDemande({ email: 'a@b.fr', cabinetId: 'x', kind: 'patient' })).toBe(false)
    expect(estUneDemande(null)).toBe(false)
    expect(estUneDemande('demande-essai')).toBe(false)
  })

  it('lit l’adresse du visiteur posée par l’hébergeur', () => {
    expect(ipDuVisiteur({ 'x-forwarded-for': '203.0.113.4, 10.0.0.1' })).toBe('203.0.113.4')
    expect(ipDuVisiteur({ 'x-forwarded-for': ['198.51.100.2'] })).toBe('198.51.100.2')
    expect(ipDuVisiteur({})).toBeNull()
  })
})
