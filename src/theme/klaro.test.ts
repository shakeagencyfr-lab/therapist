import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COULEURS_KLARO, KLARO, logoDePorte } from './klaro'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const publie = (chemin: string) => join(racine, 'public', chemin)

/**
 * La marque Klaro : ses fichiers existent, ne portent rien d'exécutable, et
 * ne se montrent jamais là où un cabinet paie pour qu'elle ne se voie pas.
 */
describe('les fichiers de la marque', () => {
  it('sont tous servis depuis public/marque', () => {
    for (const chemin of Object.values(KLARO).filter((v) => v.startsWith('/'))) {
      expect({ [chemin]: existsSync(publie(chemin)) }).toEqual({ [chemin]: true })
    }
  })

  it('les SVG ne contiennent qu’un tracé dans l’or de la marque : ni script, ni lien, ni image', () => {
    for (const chemin of [KLARO.monogramme, KLARO.logotype, KLARO.logo, KLARO.icone]) {
      const svg = readFileSync(publie(chemin), 'utf8')
      expect(svg).not.toMatch(/<script|on[a-z]+=|href|<image|<foreignObject/i)
      expect(svg.toLowerCase()).toContain(`fill="${COULEURS_KLARO.or}"`)
    }
  })
})

describe('logoDePorte — le K ne va qu’à Klaro', () => {
  it('la porte de Klaro porte le monogramme', () => {
    expect(logoDePorte('Klaro', null)).toBe(KLARO.monogramme)
  })

  it('un cabinet sans logo garde ses initiales, jamais le K de son fournisseur', () => {
    expect(logoDePorte('Cabinet des Tilleuls', null)).toBeNull()
    expect(logoDePorte('Cabinet des Tilleuls', undefined)).toBeNull()
  })

  it('le logo d’un cabinet l’emporte toujours', () => {
    expect(logoDePorte('Cabinet des Tilleuls', 'https://x/logo.png')).toBe('https://x/logo.png')
  })
})

/* index.html est servi identique au domaine de chaque cabinet, patient.html
   et embed.html vivent sous sa marque : une icône Klaro écrite là se verrait
   dans l'onglet de la page publique d'un cabinet. */
describe('aucune marque Klaro écrite dans les documents servis aux cabinets', () => {
  it('ni icône, ni logo dans index.html, patient.html, embed.html', () => {
    for (const doc of ['index.html', 'patient.html', 'embed.html']) {
      const html = readFileSync(join(racine, doc), 'utf8')
      expect({ [doc]: /\/marque\/|rel="icon"/.test(html) }).toEqual({ [doc]: false })
    }
  })
})
