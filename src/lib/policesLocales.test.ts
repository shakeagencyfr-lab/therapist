import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Aucune police ne se charge chez un tiers.
 *
 * Une page publique qui va chercher sa police chez Google lui signale la
 * visite de chacun. Sur la page d'un cabinet de thérapie, cela suffit à
 * révéler une consultation : c'est une fuite qui ne se voit pas à l'écran, et
 * qui revient à la première balise `<link>` recopiée d'un exemple.
 *
 * Cette épreuve garde la porte fermée. Elle est volontairement brutale — elle
 * lit les fichiers — parce que le rendu ne peut pas la remplacer : une page
 * qu'aucune scène ne rend passerait au travers.
 */
const RACINE = join(import.meta.dirname, '..', '..')
const TIERS = /fonts\.googleapis\.com|fonts\.gstatic\.com/

function fichiers(dossier: string, extensions: string[]): string[] {
  const trouves: string[] = []
  for (const entree of readdirSync(dossier)) {
    if (entree === 'node_modules' || entree === '.git' || entree === 'dist') continue
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(chemin, extensions))
    else if (extensions.some((e) => entree.endsWith(e))) trouves.push(chemin)
  }
  return trouves
}

describe('les polices sont servies depuis notre domaine', () => {
  it('aucun document ni aucune source ne pointe vers Google Fonts', () => {
    const aExaminer = [
      ...['index.html', 'patient.html', 'embed.html'].map((f) => join(RACINE, f)),
      ...fichiers(join(RACINE, 'src'), ['.ts', '.tsx', '.css']),
      ...fichiers(join(RACINE, 'public'), ['.css']),
    ]
    const coupables = aExaminer.filter((f) => TIERS.test(readFileSync(f, 'utf8')))
    expect(coupables.map((f) => f.slice(RACINE.length + 1))).toEqual([])
  })

  /* Le script de rapatriement, lui, DOIT parler à Google : c'est son travail.
     Il ne s'exécute qu'à la main, jamais dans le navigateur. */
  it('les fichiers rapatriés existent bien, et les deux feuilles avec', () => {
    const dossier = join(RACINE, 'public', 'fonts')
    const noms = readdirSync(dossier)
    expect(noms).toContain('base.css')
    expect(noms).toContain('vitrine.css')
    expect(noms.filter((n) => n.endsWith('.woff2')).length).toBeGreaterThan(20)
  })

  it('les feuilles ne référencent que des chemins locaux', () => {
    for (const nom of ['base.css', 'vitrine.css']) {
      const css = readFileSync(join(RACINE, 'public', 'fonts', nom), 'utf8')
      const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1] as string)
      expect(urls.length).toBeGreaterThan(0)
      for (const url of urls) expect(url.startsWith('/fonts/')).toBe(true)
    }
  })
})
