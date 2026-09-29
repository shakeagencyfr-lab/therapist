import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CHEMIN_PORTE } from './decision'

interface Regle {
  source: string
  destination?: string
  has?: Array<{ type: string; value?: string }>
  headers?: Array<{ key: string; value: string }>
}

const config = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'vercel.json'), 'utf8'),
) as { rewrites: Regle[]; headers: Regle[] }

/** Le motif `/:slug(...)` de vercel.json, tel que l'hébergeur le lit. */
const motifSlug = /^\/([a-z0-9][a-z0-9-]*)$/

describe('la page de vente chez l’hébergeur', () => {
  /* La canonique écrite dans le HTML suivrait la racine de CHAQUE domaine —
     celui d'un cabinet compris, qui disparaîtrait des moteurs au profit du
     nôtre. En en-tête, elle ne part que de klaroweb.site. */
  it('pose la canonique HTTP sur klaroweb.site, et seulement là', () => {
    const regles = config.headers.filter((r) => r.headers?.some((h) => h.key.toLowerCase() === 'link'))
    expect(regles).toHaveLength(1)
    const [regle] = regles
    expect(regle?.source).toBe('/')
    expect(regle?.has).toEqual([{ type: 'host', value: 'klaroweb.site' }])
    expect(regle?.headers?.[0]?.value).toBe('<https://klaroweb.site/>; rel="canonical"')
  })

  it('ne tient pas l’application pour non indexable : aucune consigne aux robots', () => {
    const toutes = config.headers.flatMap((r) => r.headers ?? [])
    expect(toutes.some((h) => h.key.toLowerCase() === 'x-robots-tag')).toBe(false)
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html'), 'utf8')
    expect(html).not.toMatch(/name="robots"/)
    expect(html).toMatch(/<html lang="fr">/)
  })

  /* /connexion passe par la réécriture des identifiants vers index.html —
     c'est Root, pas l'hébergeur, qui refuse d'y voir un cabinet (le mot est
     réservé, src/lib/vitrine.ts et 0037). */
  it('sert /connexion par index.html, comme toute adresse d’un segment', () => {
    const chemin = CHEMIN_PORTE
    const reecriture = config.rewrites.find(
      (r) => r.source === '/:slug([a-z0-9][a-z0-9-]*)' && r.destination === '/index.html',
    )
    expect(reecriture).toBeTruthy()
    expect(motifSlug.test(chemin)).toBe(true)
  })
})
