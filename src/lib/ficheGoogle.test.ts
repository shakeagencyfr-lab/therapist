import { describe, expect, it } from 'vitest'
import {
  AVIS_MAX,
  cleAvis,
  fusionnerFiche,
  retirerAvis,
  type BrouillonFusionnable,
  type FicheImportee,
} from './ficheGoogle'

const VIDE: BrouillonFusionnable = {
  titre: '',
  presentation: '',
  adresse: '',
  telephone: '',
  siteWeb: '',
  horaires: [],
  avis: [],
  photos: [],
  avisRetires: [],
}

const FICHE: FicheImportee = {
  nom: 'Cabinet Fontaine',
  presentation: 'Hypnothérapie à Nantes.',
  adresse: '3 rue des Lilas, Nantes',
  telephone: '02 40 00 00 00',
  siteWeb: 'https://cabinet-fontaine.fr/',
  horaires: [
    { jour: 'Lundi', heures: '09:00–19:00' },
    { jour: 'Mardi', heures: '09:00–19:00' },
  ],
  avis: [
    { auteur: 'Claire', note: 5, texte: 'Une écoute rare.', date: 'il y a 2 mois' },
    { auteur: 'Marc', note: 4, texte: 'Trois séances ont suffi.', date: 'il y a 1 an' },
  ],
  photos: [{ url: 'https://base/storage/v1/object/public/sites/c/site/google-a.jpg', alt: '', attribution: 'Photo : Google' }],
}

describe('fusionnerFiche — ce qui est vide se remplit', () => {
  it('remplit un brouillon vide, et dit tout ce qui a été ajouté', () => {
    const { site, ajouts } = fusionnerFiche(VIDE, FICHE)
    expect(site.titre).toBe('Cabinet Fontaine')
    expect(site.horaires).toHaveLength(2)
    expect(site.avis).toHaveLength(2)
    expect(site.photos).toHaveLength(1)
    expect(ajouts).toEqual([
      'le titre',
      'la présentation',
      "l'adresse",
      'le téléphone',
      'votre site',
      'les horaires',
      '2 avis',
      '1 photo',
    ])
  })

  it('traite la grille de sept jours sans heure comme vide', () => {
    const grille = { ...VIDE, horaires: ['Lundi', 'Mardi'].map((jour) => ({ jour, heures: '' })) }
    expect(fusionnerFiche(grille, FICHE).site.horaires).toEqual(FICHE.horaires)
  })
})

describe('fusionnerFiche — ce qui est écrit reste', () => {
  const ecrit: BrouillonFusionnable = {
    ...VIDE,
    titre: 'Mon cabinet',
    presentation: 'Mon texte à moi.',
    horaires: [{ jour: 'Lundi', heures: '10:00–18:00' }],
    photos: [{ url: 'https://base/x.jpg', alt: 'Salle', attribution: '' }],
  }

  it('garde les horaires corrigés, même quand Google en a', () => {
    expect(fusionnerFiche(ecrit, FICHE).site.horaires).toEqual([{ jour: 'Lundi', heures: '10:00–18:00' }])
  })

  it('garde le titre, la présentation et les photos', () => {
    const { site } = fusionnerFiche(ecrit, FICHE)
    expect(site.titre).toBe('Mon cabinet')
    expect(site.presentation).toBe('Mon texte à moi.')
    expect(site.photos).toEqual(ecrit.photos)
  })

  it('ne touche pas au brouillon reçu', () => {
    fusionnerFiche(ecrit, FICHE)
    expect(ecrit.avis).toEqual([])
  })
})

describe('les avis', () => {
  it("n'ajoute que les nouveaux, sans doublon", () => {
    const avecUn = { ...VIDE, avis: [FICHE.avis[0]!] }
    const { site, ajouts } = fusionnerFiche(avecUn, FICHE)
    expect(site.avis.map((a) => a.auteur)).toEqual(['Claire', 'Marc'])
    expect(ajouts).toContain('1 avis')
  })

  it('ne fait jamais revenir un avis retiré', () => {
    const importe = fusionnerFiche(VIDE, FICHE).site
    const sansClaire = retirerAvis(importe, 0)
    expect(sansClaire.avis.map((a) => a.auteur)).toEqual(['Marc'])
    const reimporte = fusionnerFiche(sansClaire, FICHE).site
    expect(reimporte.avis.map((a) => a.auteur)).toEqual(['Marc'])
  })

  it('reconnaît un avis malgré une date relative qui a changé', () => {
    expect(cleAvis({ auteur: 'Claire ', texte: 'Une  écoute rare.' })).toBe(
      cleAvis({ auteur: 'claire', texte: 'Une écoute rare.' }),
    )
  })

  it(`s'arrête à ${AVIS_MAX} avis`, () => {
    const plein = {
      ...VIDE,
      avis: Array.from({ length: AVIS_MAX }, (_, i) => ({ auteur: `A${i}`, note: 5, texte: `t${i}`, date: '' })),
    }
    const { site, ajouts } = fusionnerFiche(plein, FICHE)
    expect(site.avis).toHaveLength(AVIS_MAX)
    expect(ajouts.some((a) => a.endsWith('avis'))).toBe(false)
  })
})
