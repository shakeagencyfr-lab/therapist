import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * La page de vente se lit : chaque couple texte / fond qu'elle emploie tient
 * 4,5:1, relu dans les fichiers eux-mêmes (tokens.css et la feuille de la
 * page), comme src/styles/contraste.test.ts le fait pour le produit.
 */

const ici = dirname(fileURLToPath(import.meta.url))

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const canaux = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = canaux.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (lin[0] as number) + 0.7152 * (lin[1] as number) + 0.0722 * (lin[2] as number)
}

function contraste(a: string, b: string): number {
  const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (haut + 0.05) / (bas + 0.05)
}

function jetons(fichier: string): Record<string, string> {
  const css = readFileSync(fichier, 'utf8')
  const table: Record<string, string> = {}
  for (const [, nom, valeur] of css.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    table[nom as string] = (valeur as string).toLowerCase()
  }
  return table
}

const t = {
  ...jetons(join(ici, '..', 'styles', 'tokens.css')),
  ...jetons(join(ici, 'PageDeVente.module.css')),
}

/** [texte, fond, où] */
const COUPLES: Array<[string, string, string]> = [
  ['--c-text', '--c-app', 'titres'],
  ['--c-text-2', '--c-app', 'chapeau'],
  ['--c-text-3', '--c-app', 'texte courant'],
  ['--c-text-3', '--c-surface', 'texte des cartes'],
  ['--c-text-muted', '--c-app', 'mentions'],
  ['--c-accent-deep', '--c-app', 'surtitres et liens'],
  ['--c-accent-deep', '--c-surface', 'liens dans les cartes'],
  ['--c-accent-deep', '--c-accent-tint', 'numéros du parcours, section essai'],
  ['--c-surface', '--c-accent-deep', 'boutons pleins'],
  ['--c-surface', '--c-dark', 'boutons pleins survolés'],
  ['--c-danger', '--c-surface', 'erreurs du formulaire'],
  ['--v-erreur-texte', '--v-erreur-fond', 'refus du serveur'],
  ['--c-danger', '--v-erreur-fond', 'bordure du refus (élément graphique, 3:1 suffirait)'],
  ['--c-text-2', '--c-surface-2', 'aperçus : bandeau « Exemple fictif »'],
  ['--c-text-muted', '--c-surface', 'aperçus : compteurs, légendes (les « désactivés » y prennent ce gris)'],
  ['--c-text-3', '--c-surface', 'brouillon de démonstration : texte des rubriques'],
  ['--c-accent-deep', '--c-surface-2', 'pastilles de la marque, bouton « Marquer comme relue »'],
  ['--v-sombre-texte', '--c-dark', 'bande sombre : titres'],
  ['--v-sombre-doux', '--c-dark', 'bande sombre : texte'],
  ['--v-sombre-doux', '--v-sombre-carte', 'bande sombre : texte des cartes'],
  ['--v-sombre-texte', '--v-sombre-carte', 'bande sombre : titres des cartes'],
  ['--v-sombre-accent', '--c-dark', 'bande sombre : surtitre et liens'],
]

describe('les contrastes de la page de vente', () => {
  it('lit toutes les couleurs employées', () => {
    for (const [texte, fond] of COUPLES) {
      expect(t[texte], texte).toMatch(/^#[0-9a-f]{6}$/)
      expect(t[fond], fond).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('tient 4,5:1 pour chaque texte, sur chaque fond', () => {
    const faibles = COUPLES.filter(([texte, fond]) => contraste(t[texte] as string, t[fond] as string) < 4.5).map(
      ([texte, fond, ou]) => `${ou} — ${texte} sur ${fond} : ${contraste(t[texte] as string, t[fond] as string).toFixed(2)}`,
    )
    expect(faibles).toEqual([])
  })
})
