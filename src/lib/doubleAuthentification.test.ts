import { describe, expect, it } from 'vitest'
import {
  REFUS_SANS_CODE,
  aUnFacteurVerifie,
  adresseImageQr,
  cleLisible,
  codeADemander,
  codeTotpComplet,
  facteursTotpVerifies,
  messageDoubleAuth,
  niveauDuJeton,
  nomDuFacteur,
  normaliserCodeTotp,
  refusSansCode,
} from './doubleAuthentification'

/** Un jeton à la forme réelle : en-tête, charge en base64url, signature. */
function jeton(charge: object): string {
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(charge)}.signature`
}

describe('le niveau que porte le jeton', () => {
  it('lit aal2 après le code', () => {
    expect(niveauDuJeton(jeton({ sub: 'u', aal: 'aal2' }))).toBe('aal2')
  })

  it('lit aal1 après la seule première preuve', () => {
    expect(niveauDuJeton(jeton({ sub: 'u', aal: 'aal1' }))).toBe('aal1')
  })

  it('tient un jeton sans aal, abîmé ou absent pour aal1 : dans le doute, on redemande', () => {
    expect(niveauDuJeton(jeton({ sub: 'u' }))).toBe('aal1')
    expect(niveauDuJeton('pas.un-jeton')).toBe('aal1')
    expect(niveauDuJeton('')).toBe('aal1')
    expect(niveauDuJeton(null)).toBe('aal1')
  })

  it('ne se laisse pas abuser par un aal2 glissé dans les métadonnées du compte', () => {
    // user_metadata s'écrit depuis le navigateur : seul le champ de premier
    // niveau, posé par le service, fait foi.
    expect(niveauDuJeton(jeton({ sub: 'u', aal: 'aal1', user_metadata: { aal: 'aal2' } }))).toBe('aal1')
  })

  it('lit une charge encodée en base64url (caractères - et _)', () => {
    const charge = { sub: 'u', aal: 'aal2', email: 'élodie+ß?>>@exemple.fr' }
    expect(niveauDuJeton(jeton(charge))).toBe('aal2')
  })
})

describe('les facteurs du compte', () => {
  it("ne compte qu'un facteur vérifié", () => {
    expect(aUnFacteurVerifie([{ status: 'verified' }])).toBe(true)
    expect(aUnFacteurVerifie([{ status: 'unverified' }])).toBe(false)
    expect(aUnFacteurVerifie([])).toBe(false)
    expect(aUnFacteurVerifie(undefined)).toBe(false)
  })

  it('range les applications vérifiées, les plus anciennes d’abord', () => {
    const lus = facteursTotpVerifies([
      { id: 'b', status: 'verified', factor_type: 'totp', created_at: '2026-09-02' },
      { id: 'x', status: 'unverified', factor_type: 'totp', created_at: '2026-09-01' },
      { id: 'p', status: 'verified', factor_type: 'phone', created_at: '2026-08-01' },
      { id: 'a', status: 'verified', factor_type: 'totp', created_at: '2026-09-01' },
    ])
    expect(lus.map((f) => f.id)).toEqual(['a', 'b'])
  })
})

describe('la porte du second facteur', () => {
  it('demande le code à un compte protégé resté en aal1', () => {
    expect(codeADemander('aal1', true)).toBe(true)
  })

  it('ouvre à un compte protégé qui a donné son code', () => {
    expect(codeADemander('aal2', true)).toBe(false)
  })

  it('ne demande rien à un compte sans facteur', () => {
    expect(codeADemander('aal1', false)).toBe(false)
    // Un jeton aal2 resté d'un facteur retiré depuis : rien à demander non plus.
    expect(codeADemander('aal2', false)).toBe(false)
  })

  it('refuse les gestes sensibles dans le même cas, et dans lui seul', () => {
    expect(refusSansCode('aal1', true)).toBe(REFUS_SANS_CODE)
    expect(refusSansCode('aal2', true)).toBeNull()
    expect(refusSansCode('aal1', false)).toBeNull()
  })
})

describe("l'image du QR code", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#000" d="M0 0h1v1H0z"/></svg>'

  it('ré-encode la forme que rend la bibliothèque — préfixée, jamais encodée', () => {
    const url = adresseImageQr(`data:image/svg+xml;utf-8,${svg}`)
    expect(url).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    // Le # de la couleur aurait coupé l'adresse : il est encodé.
    expect(url).not.toContain('#')
  })

  it('accepte le SVG brut, une forme déjà encodée, ou du base64', () => {
    const attendu = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    expect(adresseImageQr(svg)).toBe(attendu)
    expect(adresseImageQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)).toBe(attendu)
    expect(adresseImageQr(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)).toBe(attendu)
  })

  it('refuse ce qui n’est pas un SVG', () => {
    expect(adresseImageQr('<script>alert(1)</script>')).toBeNull()
    expect(adresseImageQr('javascript:alert(1)')).toBeNull()
    expect(adresseImageQr('data:text/html,<svg>')).toBeNull()
    expect(adresseImageQr('')).toBeNull()
    expect(adresseImageQr(undefined)).toBeNull()
  })

  it("ne rend jamais qu'une adresse d'image, dont le balisage est encodé", () => {
    const url = adresseImageQr(`${svg}<script>alert(1)</script>`) ?? ''
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(url).not.toMatch(/[<>"]/)
  })
})

describe('la clé à recopier', () => {
  it('se lit par groupes de quatre, en capitales', () => {
    expect(cleLisible('jbswy3dpehpk3pxp')).toBe('JBSW Y3DP EHPK 3PXP')
    expect(cleLisible('ABCDEF')).toBe('ABCD EF')
    expect(cleLisible('AB CD')).toBe('ABCD')
    expect(cleLisible(undefined)).toBe('')
  })
})

describe('le nom du facteur', () => {
  it('change à chaque minute : le service refuse deux noms identiques', () => {
    const a = nomDuFacteur(new Date(Date.UTC(2026, 8, 29, 9, 5)))
    const b = nomDuFacteur(new Date(Date.UTC(2026, 8, 29, 9, 6)))
    expect(a).toBe('Klaro · 2026-09-29 09:05')
    expect(a).not.toBe(b)
  })
})

describe('le code saisi', () => {
  it('garde six chiffres, espaces et tirets ôtés', () => {
    expect(normaliserCodeTotp('123 456')).toBe('123456')
    expect(normaliserCodeTotp('12-34-56-78')).toBe('123456')
    expect(codeTotpComplet('123 45')).toBe(false)
    expect(codeTotpComplet('123 456')).toBe(true)
  })
})

describe('ce qu’on dit quand le code ne passe pas', () => {
  it('parle de l’heure du téléphone pour un code refusé', () => {
    expect(messageDoubleAuth({ status: 422, code: 'mfa_verification_failed' })).toMatch(/heure de votre téléphone/)
  })

  it('demande de patienter après trop d’essais', () => {
    expect(messageDoubleAuth({ status: 429 })).toMatch(/Patientez/)
  })

  it('dit qu’un réglage manque au service quand la double authentification y est fermée', () => {
    expect(messageDoubleAuth({ code: 'mfa_totp_enroll_not_enabled' })).toMatch(/support/)
  })

  it('ne rend rien sans erreur, et une phrase générique sinon', () => {
    expect(messageDoubleAuth(null)).toBe('')
    expect(messageDoubleAuth({ status: 500 })).toMatch(/Réessayez/)
  })
})
