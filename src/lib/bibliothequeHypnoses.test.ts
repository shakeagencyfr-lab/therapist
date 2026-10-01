import { describe, expect, it } from 'vitest'
import { BIBLIOTHEQUE_HYPNOSES_DEMO, HYPNOSE_SEED_INTENTIONS } from '@/data/bibliothequeHypnoses'
import { PATIENTS } from '@/data/patients'
import type { HypnoseDeBibliotheque, HypnoseMouvement } from '@/types/domain'
import {
  AVERTISSEMENT_SEANCE,
  INTENTION_MINIMALE,
  TITRE_EN_COURS,
  TITRE_PAR_DEFAUT,
  attributionsParLigne,
  bilanBibliotheque,
  caseDeLaSuppression,
  consequenceDeLaSuppression,
  estEntiere,
  hypnosePourPdf,
  libelleOrigine,
  lireLigne,
  messageRefusBibliotheque,
  metaDeLaBibliotheque,
  mouvementsDepuisJson,
  neesDe,
  phraseApresAttribution,
  phraseAttribution,
  phraseDeLaSuppression,
  poserMouvement,
  refusIntention,
  titreDeLaBibliotheque,
  titreLibreDe,
} from './bibliothequeHypnoses'

const QUATRE: HypnoseMouvement[] = [
  { mouvement: 'induction', titre: 'Le quai', texte: 'Installez-vous.' },
  { mouvement: 'approfondissement', titre: 'Le large', texte: 'Plus loin.' },
  { mouvement: 'travail', titre: 'La barque', texte: 'Ce qui porte.' },
  { mouvement: 'retour', titre: 'Le port', texte: 'Revenez.' },
]

function ligne(o: Partial<HypnoseDeBibliotheque> = {}): HypnoseDeBibliotheque {
  return {
    id: 'b1',
    titre: 'Le quai',
    intention: 'Retrouver le sommeil',
    mouvements: QUATRE,
    origine: 'atelier',
    complete: true,
    creeLe: '2026-09-29T15:27:00Z',
    modifieLe: '2026-09-29T15:30:00Z',
    attribueeA: [],
    sourcePatientId: null,
    ...o,
  }
}

describe('mouvementsDepuisJson — la colonne écrite par le navigateur, relue avec méfiance', () => {
  it('range les mouvements dans l’ordre de la séance', () => {
    expect(mouvementsDepuisJson([QUATRE[3], QUATRE[0], QUATRE[2], QUATRE[1]])).toEqual(QUATRE)
  })

  it('écarte ce qui n’a pas la forme d’un mouvement, et garde le dernier en double', () => {
    const lu = mouvementsDepuisJson([
      null,
      'texte',
      { mouvement: 'finale', titre: 'x', texte: 'x' },
      { mouvement: 'induction', titre: 'x' },
      { mouvement: 'induction', titre: 'Ancien', texte: 'Avant.' },
      { mouvement: 'induction', texte: 'Après.' },
    ])
    expect(lu).toEqual([{ mouvement: 'induction', titre: '', texte: 'Après.' }])
  })

  it('une colonne qui n’est pas un tableau ne rend rien', () => {
    expect(mouvementsDepuisJson({ induction: 'x' })).toEqual([])
    expect(mouvementsDepuisJson(null)).toEqual([])
  })
})

describe('poserMouvement et estEntiere', () => {
  it('pose un mouvement à sa place, ou remplace l’ancien', () => {
    const deux = poserMouvement([QUATRE[0]!], QUATRE[1]!)
    expect(deux.map((m) => m.mouvement)).toEqual(['induction', 'approfondissement'])
    const corrige = poserMouvement(QUATRE, { ...QUATRE[2]!, texte: 'Corrigé.' })
    expect(corrige).toHaveLength(4)
    expect(corrige[2]?.texte).toBe('Corrigé.')
  })

  it('entière : les quatre, chacun avec un texte', () => {
    expect(estEntiere(QUATRE)).toBe(true)
    expect(estEntiere(QUATRE.slice(0, 3))).toBe(false)
    expect(estEntiere(poserMouvement(QUATRE, { ...QUATRE[3]!, texte: '   ' }))).toBe(false)
  })
})

describe('lireLigne et attributionsParLigne', () => {
  it('une ligne de la base, à la forme de l’écran', () => {
    const h = lireLigne(
      {
        id: 'b1',
        titre: 'Le quai',
        intention: null,
        mouvements: [QUATRE[1], QUATRE[0]],
        origine: 'seance',
        complete: false,
        cree_le: '2026-09-29T15:27:00Z',
        modifie_le: '2026-09-29T15:30:00Z',
        source_patient_id: 'p1',
      },
      ['p2'],
    )
    expect(h).toMatchObject({ intention: '', origine: 'seance', attribueeA: ['p2'], sourcePatientId: 'p1' })
    expect(h.mouvements.map((m) => m.mouvement)).toEqual(['induction', 'approfondissement'])
    expect(lireLigne({ ...h, cree_le: '', modifie_le: '', source_patient_id: null, intention: '', origine: 'autre', mouvements: [] } as never).origine).toBe('atelier')
  })

  it('compte les patients, chacun une fois, et ignore les hypnoses écrites pour eux', () => {
    const par = attributionsParLigne([
      { bibliotheque_id: 'b1', patient_id: 'p1' },
      { bibliotheque_id: 'b1', patient_id: 'p1' },
      { bibliotheque_id: 'b1', patient_id: 'p2' },
      { bibliotheque_id: null, patient_id: 'p3' },
      { bibliotheque_id: 'b2', patient_id: 'p3' },
    ])
    expect(par.get('b1')).toEqual(['p1', 'p2'])
    expect(par.get('b2')).toEqual(['p3'])
    expect(par.size).toBe(2)
  })
})

describe('ce que la liste dit d’une hypnose', () => {
  it('l’origine, en trois mots', () => {
    expect(libelleOrigine('seance')).toBe('Écrite en séance')
    expect(libelleOrigine('atelier')).toBe('Écrite dans l’atelier')
  })

  it('« attribuée à N patients », au singulier comme au pluriel', () => {
    expect(phraseAttribution(0)).toBe('pas encore attribuée')
    expect(phraseAttribution(1)).toBe('attribuée à 1 patient')
    expect(phraseAttribution(3)).toBe('attribuée à 3 patients')
  })

  it('la méta : origine, date, attribution — ou l’écriture en cours, ou interrompue', () => {
    expect(metaDeLaBibliotheque(ligne({ attribueeA: ['a', 'b'] }))).toBe(
      'Écrite dans l’atelier · 29 septembre 2026 · attribuée à 2 patients',
    )
    expect(metaDeLaBibliotheque(ligne({ complete: false, mouvements: QUATRE.slice(0, 2) }))).toBe(
      'Écrite dans l’atelier · 29 septembre 2026 · interrompue, 2 mouvements sur 4',
    )
    expect(metaDeLaBibliotheque(ligne({ complete: false, mouvements: [] }), true)).toContain('en cours d’écriture')
    expect(metaDeLaBibliotheque(ligne({ creeLe: 'pas une date' }))).toBe('Écrite dans l’atelier · pas encore attribuée')
  })

  it('ne nomme jamais personne, même née d’une séance', () => {
    const noms = Object.values(PATIENTS).map((p) => p.name)
    const meta = metaDeLaBibliotheque(ligne({ origine: 'seance', sourcePatientId: 'camille', attribueeA: ['nadia'] }))
    for (const nom of noms) expect(meta).not.toContain(nom)
    expect(meta).not.toContain('camille')
  })
})

describe('refusIntention — sans patient, l’intention porte le script', () => {
  it(`refuse sous ${INTENTION_MINIMALE} caractères, et au-delà de deux mille`, () => {
    expect(refusIntention('   le sommeil  ')).toContain('sans patient')
    expect(refusIntention('x'.repeat(2001))).toContain('trop longue')
    expect(refusIntention('x'.repeat(INTENTION_MINIMALE))).toBeNull()
  })

  it('les amorces proposées passent toutes', () => {
    for (const intention of Object.values(HYPNOSE_SEED_INTENTIONS)) expect(refusIntention(intention)).toBeNull()
  })
})

describe('le titre', () => {
  it('celui qu’on a donné, sinon celui de l’induction, sinon un titre de repli', () => {
    expect(titreDeLaBibliotheque('  Mon titre ', QUATRE)).toBe('Mon titre')
    expect(titreDeLaBibliotheque('', QUATRE)).toBe('Le quai')
    expect(titreDeLaBibliotheque('', [])).toBe(TITRE_PAR_DEFAUT)
    expect(titreDeLaBibliotheque('x'.repeat(400), QUATRE)).toHaveLength(300)
  })

  it('une ligne reprise garde le titre donné, pas celui d’attente', () => {
    expect(titreLibreDe({ titre: TITRE_EN_COURS })).toBe('')
    expect(titreLibreDe({ titre: 'Mon titre' })).toBe('Mon titre')
  })
})

describe('les phrases des gestes', () => {
  it('l’avertissement d’une hypnose née en séance', () => {
    expect(AVERTISSEMENT_SEANCE).toBe(
      "Écrite pendant la séance d'un autre patient : relisez-la avant de l'utiliser, elle peut contenir des détails qui lui sont propres.",
    )
  })

  it('la suppression dit que les patients la gardent', () => {
    expect(consequenceDeLaSuppression('Le quai')).toContain("Les patients qui l'ont reçue la gardent dans leur fiche.")
  })

  it('la case de la suppression d’une fiche, au singulier et au pluriel', () => {
    expect(caseDeLaSuppression(1)).toBe(
      "Retirer aussi de la bibliothèque l'hypnose écrite pendant ses séances (elle peut contenir des détails qui lui sont propres)",
    )
    expect(caseDeLaSuppression(3)).toBe(
      'Retirer aussi de la bibliothèque les 3 hypnoses écrites pendant ses séances (elles peuvent contenir des détails qui lui sont propres)',
    )
    // Le compte illisible : la case reste offerte, sans chiffre.
    expect(caseDeLaSuppression(null)).toContain("s'il y en a")
  })

  it('la phrase de la zone de suppression suit la case', () => {
    expect(phraseDeLaSuppression(0, true)).toBe('')
    expect(phraseDeLaSuppression(2, true)).toContain('partent aussi, avant la fiche')
    expect(phraseDeLaSuppression(2, false)).toContain('y restent, sans plus la désigner')
    expect(phraseDeLaSuppression(null, true)).toContain('partent aussi')
  })

  it('après une attribution', () => {
    expect(phraseApresAttribution('Le quai', 1)).toContain('du patient choisi')
    expect(phraseApresAttribution('Le quai', 3)).toContain('3 patients')
  })

  it('les refus de la base passent tels quels ; le reste se dit sans jargon', () => {
    const refus = "Un des patients choisis n'est pas un suivi en cours de votre cabinet."
    expect(messageRefusBibliotheque(refus)).toBe(refus)
    expect(messageRefusBibliotheque('relation "public.bibliotheque_hypnoses" does not exist')).toContain('pas encore disponible')
    expect(messageRefusBibliotheque('JWT expired')).toContain('Vérifiez votre connexion')
  })
})

describe('neesDe et hypnosePourPdf', () => {
  it('compte ce qu’une fiche laisserait dans la bibliothèque', () => {
    const liste = [ligne({ sourcePatientId: 'p1' }), ligne({ id: 'b2', sourcePatientId: 'p1' }), ligne({ id: 'b3' })]
    expect(neesDe(liste, 'p1')).toBe(2)
    expect(neesDe(liste, 'p2')).toBe(0)
  })

  it('le PDF lit le titre, l’intention, la date et les mouvements', () => {
    expect(hypnosePourPdf(ligne())).toMatchObject({ titre: 'Le quai', intention: 'Retrouver le sommeil', createdAt: '2026-09-29T15:27:00Z', mouvements: QUATRE })
  })
})

describe('bilanBibliotheque', () => {
  it('« conservée » n’est dit que si la bibliothèque l’a reçue', () => {
    expect(bilanBibliotheque({ fini: true, conservee: true, ecrits: 4, interrompue: false })?.ton).toBe('ok')
    expect(bilanBibliotheque({ fini: true, conservee: false, ecrits: 4, interrompue: false })?.texte).toContain('pas conservée')
    expect(bilanBibliotheque({ fini: false, conservee: true, ecrits: 2, interrompue: true })?.texte).toContain('2 mouvements écrits et conservés')
    expect(bilanBibliotheque({ fini: false, conservee: true, ecrits: 0, interrompue: false })).toBeNull()
  })
})

describe('la bibliothèque de démonstration', () => {
  it('ne nomme aucun patient de la démonstration', () => {
    const texte = JSON.stringify(BIBLIOTHEQUE_HYPNOSES_DEMO.map(({ attribueeA: _a, sourcePatientId: _s, ...h }) => h))
    for (const p of Object.values(PATIENTS)) {
      expect(texte).not.toContain(p.name)
      expect(texte).not.toContain(p.name.split(' ')[0]!)
    }
  })

  it('une hypnose de chaque origine, entières', () => {
    expect(new Set(BIBLIOTHEQUE_HYPNOSES_DEMO.map((h) => h.origine))).toEqual(new Set(['seance', 'atelier']))
    for (const h of BIBLIOTHEQUE_HYPNOSES_DEMO) expect(estEntiere(h.mouvements)).toBe(true)
  })
})
