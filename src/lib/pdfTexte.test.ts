import { describe, expect, it } from 'vitest'
import { pourPdf, segmentDeFichier } from './pdfTexte'

describe('pourPdf', () => {
  it('garde le français tel quel : accents, guillemets, apostrophe, euro, œ, points de suspension', () => {
    const texte = 'L’œuvre « déjà » vue… 60,00 € — ça va ?'
    expect(pourPdf(texte)).toBe(texte)
  })

  /* Le défaut constaté : un seul caractère hors WinAnsi fait basculer la
     chaîne entière dans un autre encodage, et tout le paragraphe sort en
     symboles illisibles. */
  it('retire les émojis au lieu de laisser ruiner la ligne', () => {
    expect(pourPdf('Bonne journée 😀 merci')).toBe('Bonne journée merci')
  })

  it('rend ordinaires les espaces que fr-FR glisse dans les nombres', () => {
    expect(pourPdf('1 200 €')).toBe('1 200 €')
    expect(pourPdf('a b')).toBe('a b')
  })

  it('traduit les flèches et les tirets insécables', () => {
    expect(pourPdf('8 → 3')).toBe('8 -> 3')
    expect(pourPdf('peut‑être')).toBe('peut-être')
  })

  it('recompose les accents décomposés', () => {
    expect(pourPdf('été')).toBe('été')
  })

  it('garde les retours à la ligne, normalise ceux de Windows', () => {
    expect(pourPdf('un\r\ndeux\rtrois')).toBe('un\ndeux\ntrois')
  })

  it('rend une chaîne vide pour rien', () => {
    expect(pourPdf(null)).toBe('')
    expect(pourPdf(undefined)).toBe('')
  })

  it('ne laisse que des caractères que la police de base sait écrire', () => {
    const sortie = pourPdf('Ωmega ✓ 中文 ok')
    for (const c of sortie) {
      const cp = c.codePointAt(0) as number
      expect(cp === 0x0a || (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)).toBe(true)
    }
  })
})

describe('segmentDeFichier', () => {
  it('rend un nom lisible sans accent ni espace', () => {
    expect(segmentDeFichier('Camille Lefèvre-Bœuf')).toBe('Camille-Lefevre-B-uf')
    expect(segmentDeFichier('  Élodie  ')).toBe('Elodie')
  })
})
