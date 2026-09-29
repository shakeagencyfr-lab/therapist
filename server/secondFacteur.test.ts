import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { exigerDeuxiemeFacteur, type LecteurDeFacteurs } from './auth.js'
import { HttpError } from './errors.js'
import { REFUS_SANS_CODE } from '../src/lib/doubleAuthentification.js'

/** Un jeton à la forme réelle : en-tête, charge en base64url, signature. */
function jeton(charge: object): string {
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(charge)}.signature`
}

/** Un service d'authentification factice, qui compte ses appels. */
function service(
  reponse: Awaited<ReturnType<LecteurDeFacteurs['auth']['getUser']>>,
): LecteurDeFacteurs & { appels: number } {
  const s = {
    appels: 0,
    auth: {
      async getUser() {
        s.appels++
        return reponse
      },
    },
  }
  return s
}

const AVEC_FACTEUR = { data: { user: { factors: [{ status: 'verified', factor_type: 'totp' }] } }, error: null }
const SANS_FACTEUR = { data: { user: { factors: [] } }, error: null }
const INSCRIPTION_ABANDONNEE = { data: { user: { factors: [{ status: 'unverified' }] } }, error: null }

async function statut(p: Promise<void>): Promise<number | 'ok'> {
  try {
    await p
    return 'ok'
  } catch (err) {
    if (err instanceof HttpError) return err.status
    throw err
  }
}

describe('la garde des gestes sensibles', () => {
  it('laisse passer une session aal2 sans rien demander au service', async () => {
    const s = service(AVEC_FACTEUR)
    expect(await statut(exigerDeuxiemeFacteur(s, jeton({ sub: 'u', aal: 'aal2' })))).toBe('ok')
    expect(s.appels).toBe(0)
  })

  it('refuse (403) une session aal1 d’un compte protégé, avec la phrase de l’écran', async () => {
    const s = service(AVEC_FACTEUR)
    await expect(exigerDeuxiemeFacteur(s, jeton({ sub: 'u', aal: 'aal1' }))).rejects.toMatchObject({
      status: 403,
      message: REFUS_SANS_CODE,
    })
    expect(s.appels).toBe(1)
  })

  it('laisse passer un compte sans facteur, ou dont l’inscription est restée inachevée', async () => {
    expect(await statut(exigerDeuxiemeFacteur(service(SANS_FACTEUR), jeton({ sub: 'u', aal: 'aal1' })))).toBe('ok')
    expect(
      await statut(exigerDeuxiemeFacteur(service(INSCRIPTION_ABANDONNEE), jeton({ sub: 'u', aal: 'aal1' }))),
    ).toBe('ok')
  })

  it('tient un jeton sans aal pour aal1', async () => {
    expect(await statut(exigerDeuxiemeFacteur(service(AVEC_FACTEUR), jeton({ sub: 'u' })))).toBe(403)
  })

  it('refuse dans le doute quand le service ne répond pas, et dit la session expirée quand il la refuse', async () => {
    const panne = service({ data: { user: null }, error: { status: 500 } })
    expect(await statut(exigerDeuxiemeFacteur(panne, jeton({ sub: 'u', aal: 'aal1' })))).toBe(502)
    const expiree = service({ data: { user: null }, error: { status: 401 } })
    expect(await statut(exigerDeuxiemeFacteur(expiree, jeton({ sub: 'u', aal: 'aal1' })))).toBe(401)
  })
})

/**
 * Les routes sensibles passent par la garde.
 *
 * Une garde que personne n'appelle ne garde rien : on lit la source, comme
 * les autres gardes du dépôt, pour qu'un remaniement ne la fasse pas tomber
 * sans bruit.
 */
describe('les routes sensibles', () => {
  const ici = dirname(fileURLToPath(import.meta.url))
  const source = (f: string) => readFileSync(join(ici, f), 'utf8')

  /** Le corps d'une fonction exportée, jusqu'à la suivante. */
  function corps(fichier: string, nom: string): string {
    const s = source(fichier)
    const debut = s.indexOf(`export async function ${nom}(`)
    expect(debut, `${fichier} : ${nom} introuvable`).toBeGreaterThan(-1)
    const suite = s.indexOf('\nexport ', debut + 1)
    return s.slice(debut, suite === -1 ? undefined : suite)
  }

  it.each([
    ['compte.ts', 'changerMotDePasse'],
    ['integrations.ts', 'appliquerIntegration'],
    ['courriel.ts', 'reglerSmtp'],
    ['courriel.ts', 'retirerSmtp'],
    ['domaines.ts', 'poserDomaine'],
    ['domaines.ts', 'retirerDomaine'],
  ])('%s · %s identifie par identifierPourGesteSensible', (fichier, nom) => {
    const c = corps(fichier, nom)
    expect(c).toContain('identifierPourGesteSensible(token)')
    expect(c).not.toMatch(/await identifier\(token\)/)
  })

  it("l'envoi d'une invitation exige le code avant toute écriture", () => {
    const c = corps('invitations.ts', 'envoyerInvitation')
    const garde = c.indexOf('exigerDeuxiemeFacteur(appelant, token)')
    expect(garde).toBeGreaterThan(-1)
    // Avant la première lecture par la clé de service, et avant tout envoi.
    expect(garde).toBeLessThan(c.indexOf('await admin'))
    expect(garde).toBeLessThan(c.indexOf('lienDeConnexion('))
  })
})
