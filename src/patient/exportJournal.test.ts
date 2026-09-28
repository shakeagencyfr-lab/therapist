import { describe, expect, it } from 'vitest'
import { journalEnTexte, nomDuFichierJournal, type PageExportee } from './exportJournal'

/**
 * Emporter son journal avant de partir.
 *
 * Supprimer son compte efface le journal ; la copie est la seule trace qui
 * reste. Elle doit donc être complète, lisible, et dans l'ordre où l'on relit.
 */
const ENTETE = { nom: 'Léa Martin', cabinet: 'Cabinet Fontaine', le: new Date(2026, 8, 28, 12) }

const PAGES: PageExportee[] = [
  { title: 'Un mot', body: 'La nuit a été courte.', shared: true, written_at: '2026-09-20T12:00:00Z' },
  { title: 'Premier soir', body: '  Trois lignes,\n\nà peine.  ', shared: false, written_at: '2026-09-02T12:00:00Z' },
]

describe('journalEnTexte', () => {
  const texte = journalEnTexte(PAGES, ENTETE)

  it('commence par l’indicateur UTF-8, pour les accents sous Windows', () => {
    expect(texte.startsWith('﻿Mon journal — Léa Martin')).toBe(true)
  })

  it('dit d’où vient le journal, et combien de pages il compte', () => {
    expect(texte).toContain("Tenu dans l'espace de Cabinet Fontaine")
    expect(texte).toContain('2 pages')
  })

  it('range les pages dans l’ordre du temps, la plus ancienne d’abord', () => {
    expect(texte.indexOf('Premier soir')).toBeLessThan(texte.indexOf('Un mot'))
  })

  it('garde chaque page entière, et dit lesquelles étaient partagées', () => {
    expect(texte).toContain('Trois lignes,\n\nà peine.')
    expect(texte).toMatch(/2026 · partagée\nUn mot/)
    expect(texte).not.toMatch(/2026 · partagée\nPremier soir/)
  })

  it('ne rend pas un fichier muet quand il n’y a rien', () => {
    expect(journalEnTexte([], ENTETE)).toContain('Aucune page écrite.')
  })

  it('accorde le nombre de pages', () => {
    expect(journalEnTexte([PAGES[0]], ENTETE)).toContain('1 page\n')
  })
})

describe('nomDuFichierJournal', () => {
  it('date le fichier, pour qu’une seconde copie n’écrase pas la première', () => {
    expect(nomDuFichierJournal(new Date(2026, 0, 5, 9))).toBe('mon-journal-2026-01-05.txt')
  })
})
