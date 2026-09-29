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

describe('le slogan de Klaro', () => {
  /* Il se lit en capitales, à côté du K, sur la largeur de la carte : au-delà,
     il passerait sur trois lignes. */
  it('tient sur la ligne de la porte', () => {
    expect(KLARO.slogan.length).toBeLessThanOrEqual(45)
    expect(KLARO.slogan).not.toMatch(/klaro/i)
  })

  /* La porte d'un cabinet et son widget parlent au nom du cabinet : sans
     phrase à lui, « Espace thérapie », jamais la promesse de son fournisseur. */
  it('ne sert jamais de phrase par défaut à un cabinet', () => {
    const widget = readFileSync(join(racine, 'src/embed/EmbedSignIn.tsx'), 'utf8')
    const patient = readFileSync(join(racine, 'src/patient-main.tsx'), 'utf8')
    for (const source of [widget, patient]) {
      expect(source).not.toContain('KLARO.slogan')
      expect(source).toMatch(/vitrine\??\.tagline \|\| 'Espace thérapie'/)
    }
  })
})
