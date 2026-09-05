import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Les gris du produit se lisent, ou ne sont pas du texte.
 *
 * `--c-text-muted` a valu #8a857b pendant toute la vie du produit : 3,61 pour
 * un sur le fond des cartes. C'est la couleur de la moitié de l'espace
 * patient — les méta d'exercice, le compte des pages du journal, les libellés
 * de l'échelle du soir, les états vides — et elle passait sous le seuil de
 * 4,5 que le texte courant demande. `--c-text-faint`, à 1,79, ne se voyait pas
 * du tout, alors qu'il porte les indications des champs.
 *
 * Un jeton se retouche en une seconde et personne ne recalcule : d'où cette
 * épreuve, qui lit le fichier et refait le calcul.
 */

/** Luminance relative, formule WCAG 2. */
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const canaux = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lineaire = canaux.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * lineaire[0] + 0.7152 * lineaire[1] + 0.0722 * lineaire[2]
}

/** Rapport de contraste entre deux couleurs, de 1 à 21. */
function contraste(a: string, b: string): number {
  const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (haut + 0.05) / (bas + 0.05)
}

/** Les jetons du fichier, tels qu'ils y sont écrits. */
function jetons(): Record<string, string> {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tokens.css'), 'utf8')
  const table: Record<string, string> = {}
  for (const [, nom, valeur] of css.matchAll(/(--c-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    table[nom] = valeur.toLowerCase()
  }
  return table
}

/* `--c-text-disabled` n'est pas dans l'épreuve, et c'est délibéré : la règle
   de contraste ne s'applique pas à une commande désactivée, dont l'aspect
   éteint EST l'information. L'y inclure obligerait à la rendre indiscernable
   d'une commande active. */

/** Les trois fonds sur lesquels du texte se pose dans le produit. */
const FONDS = ['--c-surface', '--c-surface-2', '--c-field'] as const

describe('contraste des textes', () => {
  const t = jetons()

  it('lit bien les jetons du fichier', () => {
    for (const fond of FONDS) expect(t[fond]).toMatch(/^#[0-9a-f]{6}$/)
    expect(t['--c-text-muted']).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('tient 4,5 pour tout texte courant, sur les trois fonds', () => {
    const textes = ['--c-text', '--c-text-2', '--c-text-3', '--c-text-4', '--c-text-muted', '--c-text-faint']
    const faibles: string[] = []
    for (const texte of textes) {
      for (const fond of FONDS) {
        const r = contraste(t[texte] as string, t[fond] as string)
        if (r < 4.5) faibles.push(`${texte} sur ${fond} : ${r.toFixed(2)}`)
      }
    }
    expect(faibles).toEqual([])
  })

  it('garde la hiérarchie : chaque gris est plus clair que le précédent', () => {
    const echelle = ['--c-text', '--c-text-2', '--c-text-3', '--c-text-4', '--c-text-muted', '--c-text-faint']
    const rangs = echelle.map((nom) => contraste(t[nom] as string, t['--c-surface'] as string))
    for (let i = 1; i < rangs.length; i += 1) {
      expect({ [echelle[i] as string]: rangs[i] < (rangs[i - 1] as number) }).toEqual({
        [echelle[i] as string]: true,
      })
    }
  })
})
