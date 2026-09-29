import { describe, expect, it } from 'vitest'
import { AdresseInterne, lookupPublic, obtenirPublic, priveOuLocal } from './reseau.js'

describe('priveOuLocal, sous ses déguisements', () => {
  it('reconnaît l’IPv4 interne écrite en IPv6', () => {
    for (const ip of ['::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:127.0.0.1', '::ffff:a9fe:a9fe', '64:ff9b::a00:1']) {
      expect({ [ip]: priveOuLocal(ip) }).toEqual({ [ip]: true })
    }
  })

  it('refuse les plages IPv6 locales et l’illisible', () => {
    for (const ip of ['::', '::1', 'fd00::1', 'fe80::1', 'ff02::1', '2001:db8::1', 'pas une adresse', '1:2:3']) {
      expect({ [ip]: priveOuLocal(ip) }).toEqual({ [ip]: true })
    }
  })

  it('laisse passer l’Internet public', () => {
    for (const ip of ['8.8.8.8', '2606:4700:4700::1111', '::ffff:8.8.8.8', '2a00:1450:4007:80c::200e']) {
      expect({ [ip]: priveOuLocal(ip) }).toEqual({ [ip]: false })
    }
  })
})

describe('les connexions sortantes', () => {
  it('le résolveur refuse un nom qui mène à la machine même', async () => {
    const erreur = await new Promise<Error | null>((fin) =>
      lookupPublic('localhost', {}, (err) => fin(err)),
    )
    expect(erreur).toBeInstanceOf(AdresseInterne)
  })

  it('une adresse IP interne écrite telle quelle ne part pas', async () => {
    for (const url of ['https://127.0.0.1/', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/']) {
      await expect(obtenirPublic(url, { delai: 1000 }), url).rejects.toBeInstanceOf(AdresseInterne)
    }
  })

  it('ni http, ni identifiants dans l’adresse', async () => {
    await expect(obtenirPublic('http://exemple.fr/', { delai: 1000 })).rejects.toThrow(/https/)
    await expect(obtenirPublic('https://a:b@exemple.fr/', { delai: 1000 })).rejects.toThrow(/identifiants/)
  })
})
