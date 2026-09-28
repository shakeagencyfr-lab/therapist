import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * L'espace installable et son service worker.
 *
 * Ni l'un ni l'autre ne s'éprouve dans Vitest : il faudrait un téléphone.
 * On vérifie donc sur le texte ce qui, cassé, ne se verrait qu'en
 * production — et parfois des semaines plus tard.
 */
const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sw = readFileSync(join(racine, 'public', 'sw.js'), 'utf8')
const manifeste = JSON.parse(readFileSync(join(racine, 'public', 'manifest.webmanifest'), 'utf8')) as {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  icons: Array<{ src: string; sizes: string; purpose: string }>
}

describe('le service worker', () => {
  it('affiche les rappels et rouvre l’espace', () => {
    expect(sw).toMatch(/addEventListener\('push'/)
    expect(sw).toMatch(/addEventListener\('notificationclick'/)
  })

  /* Un service worker qui intercepte les requêtes finit par servir une
     version périmée de l'application. Celui-ci n'en intercepte aucune. */
  it("n'intercepte aucune requête", () => {
    expect(sw).not.toMatch(/addEventListener\(\s*['"]fetch['"]/)
    expect(sw).not.toMatch(/caches\./)
  })

  /* Le chemin vient d'un message : on ne rouvre jamais une autre origine. */
  it('ne rouvre que l’espace patient de cette origine', () => {
    expect(sw).toMatch(/url\.origin !== self\.location\.origin/)
    expect(sw).toMatch(/mon\\\/\?\$/)
  })
})

describe('le manifeste', () => {
  /* Il s'affiche chez tous les cabinets, y compris ceux qui ont payé pour
     ne plus voir notre marque. */
  it('ne porte pas notre marque', () => {
    expect(`${manifeste.name} ${manifeste.short_name}`).not.toMatch(/klaro/i)
  })

  /* Relatif, pour que l'espace installé depuis /son-cabinet/mon rouvre
     /son-cabinet/mon : le manifeste y est lu depuis cette adresse. */
  it('rouvre la porte d’où il a été installé', () => {
    expect(manifeste.start_url).toBe('./mon')
    expect(manifeste.scope).toBe('./')
    expect(manifeste.display).toBe('standalone')
  })

  it('désigne des icônes qui existent, à la taille annoncée', () => {
    for (const icone of manifeste.icons) {
      const fichier = join(racine, 'public', icone.src)
      expect({ [icone.src]: existsSync(fichier) }).toEqual({ [icone.src]: true })
      const png = readFileSync(fichier)
      const cote = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`
      expect({ [icone.src]: cote }).toEqual({ [icone.src]: icone.sizes })
    }
  })
})

/* L'annonce de Chrome ne passe qu'une fois, et souvent avant le premier
   rendu. Une écoute déplacée après le montage ne casserait rien de visible
   — le bouton ne s'afficherait simplement jamais sur Android. */
describe("l'annonce d'installation", () => {
  const demarrage = readFileSync(join(racine, 'src', 'patient-main.tsx'), 'utf8')

  it('est écoutée avant que l’espace ne soit monté', () => {
    const ecoute = demarrage.indexOf('ecouterInstallation()')
    const montage = demarrage.indexOf('createRoot(')
    expect(ecoute).toBeGreaterThan(-1)
    expect(ecoute).toBeLessThan(montage)
  })

  it('retient le bandeau de Chrome pour le remplacer par le bouton', () => {
    const module = readFileSync(join(racine, 'src', 'patient', 'installation.ts'), 'utf8')
    expect(module).toMatch(/beforeinstallprompt[\s\S]{0,120}preventDefault\(\)/)
    expect(module).toMatch(/appinstalled/)
  })
})
