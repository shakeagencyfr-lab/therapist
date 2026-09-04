import { describe, expect, it } from 'vitest'
import {
  CARTES,
  FEUILLE_POLICES,
  COINS,
  FONDS,
  POLICES_TEXTE,
  POLICES_TITRES,
  PRESETS,
  THEME_DEFAUT,
  pileTexte,
  pileTitres,
  policesAcharger,
  resoudreTheme,
  themeDuPreset,
} from './themeVitrine'

describe('resoudreTheme', () => {
  it('rend le thème d’origine sur une valeur absente ou illisible', () => {
    expect(resoudreTheme(null)).toEqual(THEME_DEFAUT)
    expect(resoudreTheme(undefined)).toEqual(THEME_DEFAUT)
    expect(resoudreTheme('pas un objet')).toEqual(THEME_DEFAUT)
    expect(resoudreTheme({})).toEqual(THEME_DEFAUT)
  })

  it('garde ce qu’elle reconnaît', () => {
    const t = resoudreTheme({ preset: 'atelier', titres: 'fraunces', texte: 'karla', fond: 'grain', anime: true, carte: 'papier', coins: 'doux' })
    expect(t).toEqual({ preset: 'atelier', titres: 'fraunces', texte: 'karla', fond: 'grain', anime: true, carte: 'papier', coins: 'doux' })
  })

  /* LA RAISON D'ÊTRE DE LA LISTE BLANCHE. Ces valeurs finissent en noms de
     classe et en `font-family` sur une page publique : une chaîne recopiée
     telle quelle laisserait écrire du CSS dans la page d'un cabinet. */
  it('refuse tout code inconnu, et ne le laisse jamais ressortir', () => {
    const hostile = {
      titres: "Georgia; } body { display:none } .x {",
      texte: '../../etc/passwd',
      fond: '<script>',
      carte: 'url(https://tiers.test/pixel)',
      coins: 'expression(alert(1))',
      preset: 'inconnu',
    }
    const t = resoudreTheme(hostile)
    expect(t).toEqual(THEME_DEFAUT)
    for (const valeur of Object.values(t)) {
      if (typeof valeur === 'string') {
        expect(valeur).toMatch(/^[a-z0-9]+$/)
      }
    }
  })

  it('n’accepte « anime » que strictement vrai', () => {
    expect(resoudreTheme({ anime: 'oui' }).anime).toBe(false)
    expect(resoudreTheme({ anime: 1 }).anime).toBe(false)
    expect(resoudreTheme({ anime: true }).anime).toBe(true)
  })
})

describe('les listes', () => {
  it('n’ont aucun code en double', () => {
    for (const liste of [PRESETS, POLICES_TITRES, POLICES_TEXTE, FONDS, CARTES, COINS]) {
      const codes = liste.map((e) => e.code)
      expect(new Set(codes).size).toBe(codes.length)
    }
  })

  /* Un code qui ne serait pas un identifiant simple ne pourrait pas servir de
     nom de classe CSS, et se composerait mal dans une feuille de style. */
  it('n’emploient que des codes en minuscules sans ponctuation', () => {
    for (const liste of [PRESETS, POLICES_TITRES, POLICES_TEXTE, FONDS, CARTES, COINS]) {
      for (const e of liste) expect(e.code).toMatch(/^[a-z0-9]+$/)
    }
  })

  it('les préréglages ne désignent que des valeurs existantes', () => {
    for (const p of PRESETS) {
      const resolu = resoudreTheme({ preset: p.code, ...p.theme })
      expect(resolu).toEqual({ preset: p.code, ...p.theme })
    }
  })
})

describe('themeDuPreset', () => {
  it('rend le thème complet d’un préréglage connu', () => {
    expect(themeDuPreset('atelier').titres).toBe('fraunces')
    expect(themeDuPreset('atelier').preset).toBe('atelier')
  })
  it('retombe sur l’origine pour un code inconnu', () => {
    expect(themeDuPreset('nexistepas')).toEqual(THEME_DEFAUT)
  })
})

describe('les polices', () => {
  it('rendent toujours une pile utilisable, jamais une chaîne vide', () => {
    for (const p of POLICES_TITRES) {
      expect(pileTitres(resoudreTheme({ titres: p.code }))).toBe(p.pile)
    }
    for (const p of POLICES_TEXTE) {
      expect(pileTexte(resoudreTheme({ texte: p.code }))).toBe(p.pile)
    }
  })

  /* Le thème d'origine n'a rien à charger : ses deux polices sont déjà
     servies par le document. Une page qui n'a rien à demander ne demande
     rien — c'est une requête vers un tiers en moins sur une page publique. */
  it('ne demandent rien pour le thème d’origine', () => {
    expect(policesAcharger(THEME_DEFAUT)).toBeNull()
  })

  it('demandent la feuille dès qu’une police sort du défaut', () => {
    expect(policesAcharger(resoudreTheme({ titres: 'fraunces', texte: 'publicsans' }))).toBe(
      FEUILLE_POLICES,
    )
    expect(policesAcharger(resoudreTheme({ titres: 'newsreader', texte: 'karla' }))).toBe(
      FEUILLE_POLICES,
    )
    expect(policesAcharger(resoudreTheme({ titres: 'lora', texte: 'karla' }))).toBe(FEUILLE_POLICES)
  })

  /* LE POINT DE TOUT L'EXERCICE. Une page publique qui va chercher sa police
     chez Google lui signale la visite de chacun ; sur la page d'un cabinet de
     thérapie, cela suffit à révéler une consultation. Aucune adresse de tiers
     ne doit pouvoir ressortir d'ici, quelle que soit la police choisie. */
  it('ne pointent jamais vers un serveur tiers', () => {
    for (const t of POLICES_TITRES) {
      for (const x of POLICES_TEXTE) {
        const url = policesAcharger(resoudreTheme({ titres: t.code, texte: x.code }))
        if (url === null) continue
        expect(url.startsWith('/')).toBe(true)
        expect(url).not.toMatch(/googleapis|gstatic|https?:/)
      }
    }
  })
})
