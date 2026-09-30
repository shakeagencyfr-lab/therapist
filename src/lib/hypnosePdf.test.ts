import { describe, expect, it } from 'vitest'
import type { Hypnose } from '@/types/domain'
import { accentLisible, composerHypnose, nomDuFichier } from './hypnosePdf'
import { PROPRIETES_IA } from './transparenceIA'
import { revendicationsInterdites } from '@/legal/contenu'

/**
 * Le nom du fichier finit dans un dossier de téléchargements, à côté de
 * quarante autres. Il doit se lire d'un coup d'œil et survivre à tous les
 * systèmes de fichiers — pas d'accent, pas d'espace, pas de ponctuation.
 */
describe('nomDuFichier', () => {
  it('recompose un nom lisible : qui, quoi, quand', () => {
    expect(nomDuFichier('Eugénie', 'Retrouver le sommeil', '2026-09-03T17:37:35Z')).toBe(
      'Eugenie_Retrouver-le-sommeil_2026-09-03.pdf',
    )
  })

  it('retire les accents et la ponctuation', () => {
    expect(nomDuFichier('Chloé Béart', "L'élan, retrouvé", '2026-01-05T08:00:00Z')).toBe(
      'Chloe-Beart_L-elan-retrouve_2026-01-05.pdf',
    )
  })

  it('tient face à un titre à rallonge', () => {
    const nom = nomDuFichier('A', 'x'.repeat(200), '2026-01-05T08:00:00Z')
    expect(nom.length).toBeLessThan(70)
    expect(nom.endsWith('.pdf')).toBe(true)
  })

  /* Un titre vide ne doit pas produire « Eugenie__2026-09-03.pdf ». */
  it('ne laisse pas de séparateur orphelin', () => {
    expect(nomDuFichier('Eugénie', '', '2026-09-03T17:37:35Z')).toBe('Eugenie_2026-09-03.pdf')
  })
})

const HYPNOSE: Hypnose = {
  id: 'h1',
  titre: 'La barque qui rentre au port',
  intention: 'Une hypnose pour s’endormir',
  createdAt: '2026-09-29T15:27:00Z',
  mouvements: [
    { mouvement: 'induction', titre: 'Le quai', texte: 'Installez-vous.\nLaissez venir le soir.' },
    { mouvement: 'approfondissement', titre: 'Le large', texte: 'Plus loin encore.' },
  ],
} as unknown as Hypnose

// Un carré PNG de 1 pixel : de quoi vérifier que l'image entre dans le fichier.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/**
 * La marque du cabinet : le logo en garde et en tête, la couleur sur les
 * repères. Le texte à lire ne change pas.
 */
describe('composerHypnose — la marque du cabinet', () => {
  it('pose le logo en page de garde et en tête des pages de lecture', async () => {
    const sans = (await composerHypnose(HYPNOSE, 'Test', 'Sebastien Tedeschi')).output()
    const avec = (
      await composerHypnose(HYPNOSE, 'Test', 'Sebastien Tedeschi', {
        logo: { dataUrl: PIXEL, largeur: 1, hauteur: 1 },
        accent: '#2E6B5E',
      })
    ).output()
    expect(sans).not.toMatch(/\/Subtype \/Image/)
    expect(avec).toMatch(/\/Subtype \/Image/)
    // Une image, placée trois fois : la garde et les deux pages de lecture.
    expect(avec.match(/\/I\d+ Do/g)?.length).toBe(3)
    for (const texte of ['La barque qui rentre au port', 'Installez-vous.', 'Sebastien Tedeschi']) {
      expect(avec).toContain(texte)
    }
  })

  /* Le texte est écrit avec l'IA et relu par la praticienne : le fichier le
     dit dans ses propriétés, lisibles par une machine (règlement européen
     sur l'IA, art. 50) — sans nommer ni la plateforme ni le modèle. */
  it('se déclare rédigé avec l’IA et validé par le praticien, dans ses propriétés', async () => {
    const brut = (await composerHypnose(HYPNOSE, 'Test', 'Cabinet Fontaine')).output()
    expect(brut).toContain(`/Subject (${PROPRIETES_IA.subject})`)
    expect(brut).toContain(`/Keywords (${PROPRIETES_IA.keywords})`)
    expect(brut).toContain('/Title (La barque qui rentre au port)')
    expect(brut).toContain('/Author (Cabinet Fontaine)')
    expect(PROPRIETES_IA.subject).toMatch(/intelligence artificielle[\s\S]*validé par le praticien/)
    const proprietes = (brut.match(/\/(?:Subject|Keywords|Title|Author) \([^)]*\)/g) ?? []).join('\n')
    expect(proprietes).not.toMatch(/Klaro/i)
    expect(revendicationsInterdites(proprietes)).toEqual([])
  })

  it('met la couleur du cabinet sur les repères', async () => {
    const avec = (
      await composerHypnose(HYPNOSE, 'Test', 'Cabinet', { logo: null, accent: '#2E6B5E' })
    ).output()
    // 0x2E/255, 0x6B/255, 0x5E/255, telles que jsPDF les écrit : le texte (rg), le filet (RG).
    expect(avec).toContain('0.18 0.42 0.369 rg')
    expect(avec).toContain('0.18 0.42 0.37 RG')
  })

  it('assombrit un accent trop pâle pour l’impression, sans changer sa teinte', () => {
    const [r, g, b] = accentLisible('#F2D9A8')
    expect(r).toBeLessThan(0xf2)
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
    // Une couleur déjà soutenue passe telle quelle ; une valeur illisible, le défaut.
    expect(accentLisible('#2E6B5E')).toEqual([0x2e, 0x6b, 0x5e])
    expect(accentLisible('javascript:')).toEqual([0x6e, 0x52, 0x30])
  })
})
