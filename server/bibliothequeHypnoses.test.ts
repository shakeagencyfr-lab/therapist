import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { INTENTION_MINIMALE_BIBLIOTHEQUE, matiereDeLHypnose } from './ai.js'
import { BAREME_PAR_DEFAUT, coutDeLAppel, recherchesPour } from './jetons.js'
import { HYPNOSE_SYSTEM, POUR_LA_BIBLIOTHEQUE, dossierHypnose, hypnosePrompt } from './prompts.js'

/*
 * La bibliothèque d'hypnoses du cabinet (0071), côté serveur : une hypnose
 * écrite dans l'atelier, sans patient, se lit, s'écrit et se paie comme une
 * hypnose de fiche — sans dossier, sur la seule intention.
 */

const DOSSIER = {
  name: 'Camille Laurent',
  program: 'Programme Liberté',
  subtitle: 'Arrêt du tabac',
  weekLabel: '3 séances sur 6',
  sessions: 3,
  totalSessions: 6,
  adherence: 67,
  scaleLabel: 'Envie de fumer',
  scaleDelta: '',
  modules: [{ title: 'Trois respirations', done: true }],
  journal: [{ date: 'lundi 7 sept.', text: 'La pause de 10 h a été la plus dure.' }],
  shared: '',
  profile: { updated: '', portrait: 'Avance par petites victoires.', axes: [], levers: [], care: [] },
}

const INTENTION = 'Retrouver un sommeil paisible après une journée chargée.'

async function refus(f: () => unknown): Promise<{ status: number; message: string }> {
  try {
    await f()
  } catch (err) {
    return err as { status: number; message: string }
  }
  throw new Error('la lecture devait échouer')
}

describe('matiereDeLHypnose — sans patient, une hypnose de la bibliothèque', () => {
  it('sans dossier, l’intention seule porte le script : rien de ce qu’une séance relève n’est lu', () => {
    const { mouvement, matiere } = matiereDeLHypnose({
      mouvement: 'induction',
      intention: `  ${INTENTION}  `,
      // Envoyés quand même : des formulations sans patient seraient celles de quelqu'un.
      mots: ['ma cage thoracique', 'le phare'],
      themes: ['le délai'],
      synthese: 'Une séance qui n’a pas eu lieu.',
    })
    expect(mouvement).toBe('induction')
    expect(matiere).toEqual({ context: null, mots: [], themes: [], synthese: '', intention: INTENTION, precedents: [] })
  })

  it('un dossier nul vaut un dossier absent', () => {
    expect(matiereDeLHypnose({ mouvement: 'retour', context: null, intention: INTENTION }).matiere.context).toBeNull()
  })

  it(`sans dossier, l’intention est exigée : ${INTENTION_MINIMALE_BIBLIOTHEQUE} caractères au moins`, async () => {
    for (const intention of [undefined, '', '   ', 'Le sommeil.']) {
      const err = await refus(() => matiereDeLHypnose({ mouvement: 'induction', intention }))
      expect(err.status).toBe(400)
      expect(err.message).toContain("sans patient, c'est votre intention qui la porte")
    }
    expect(() => matiereDeLHypnose({ mouvement: 'induction', intention: 'x'.repeat(INTENTION_MINIMALE_BIBLIOTHEQUE) })).not.toThrow()
  })

  it('une intention trop longue reste refusée, avec ou sans patient', async () => {
    for (const context of [undefined, DOSSIER]) {
      const err = await refus(() =>
        matiereDeLHypnose({ mouvement: 'travail', context: context as never, intention: 'x'.repeat(2001) }),
      )
      expect(err.status).toBe(400)
      expect(err.message).toContain("L'intention est trop longue")
    }
  })

  it('pour un patient, rien ne change : le dossier, ses formulations, l’intention facultative', () => {
    const { matiere } = matiereDeLHypnose({
      mouvement: 'approfondissement',
      context: DOSSIER as never,
      mots: ['le phare'],
      themes: ['le délai'],
      synthese: 'Une séance.',
      intention: '',
      precedents: [{ mouvement: 'induction', texte: 'Installez-vous.' }],
    })
    expect(matiere.context?.name).toBe('Camille Laurent')
    expect(matiere.mots).toEqual(['le phare'])
    expect(matiere.themes).toEqual(['le délai'])
    expect(matiere.synthese).toBe('Une séance.')
    expect(matiere.precedents).toEqual([{ mouvement: 'induction', texte: 'Installez-vous.' }])
  })

  it('un dossier mal formé ne devient pas une hypnose de bibliothèque', async () => {
    const err = await refus(() =>
      matiereDeLHypnose({ mouvement: 'induction', context: { ...DOSSIER, modules: 'trois' } as never, intention: INTENTION }),
    )
    expect(err.status).toBe(400)
    expect(err.message).toContain('Le dossier du patient est arrivé incomplet')
  })

  it('un mouvement inconnu est refusé avant tout', async () => {
    const err = await refus(() => matiereDeLHypnose({ mouvement: 'finale', intention: INTENTION }))
    expect(err).toMatchObject({ status: 400, message: "Ce mouvement d'hypnose n'existe pas." })
  })
})

describe('hypnosePrompt — un script général pour la bibliothèque du cabinet', () => {
  const sans = hypnosePrompt('induction', {
    context: null,
    mots: [],
    themes: [],
    synthese: '',
    intention: INTENTION,
    precedents: [],
  })

  it('dit que ce n’est écrit pour personne, sans détail inventé, au « vous », adaptable', () => {
    expect(sans.startsWith(POUR_LA_BIBLIOTHEQUE)).toBe(true)
    expect(sans).toContain('PERSONNE EN PARTICULIER')
    expect(sans).toContain('bibliothèque du cabinet')
    expect(sans).toContain('script général')
    expect(sans).toContain('AUCUN détail personnel')
    expect(sans).toContain('ni prénom ni nom')
    expect(sans).toContain('« vous »')
    expect(sans).toContain('adaptera')
    expect(sans).toContain(`Ce que la thérapeute veut travailler avec cette hypnose : ${INTENTION}`)
  })

  it('ne lit ni dossier ni séance, même si on lui en glisse', () => {
    const glisse = dossierHypnose({ context: null, mots: ['le phare'], themes: ['le délai'], synthese: 'Une séance.', intention: INTENTION })
    for (const absent of ['Pour qui : Camille', 'SES FORMULATIONS', 'le phare', 'Fils de la séance', 'Une séance.']) {
      expect(glisse).not.toContain(absent)
    }
  })

  it('les règles du métier restent celles de toutes les hypnoses', () => {
    expect(HYPNOSE_SYSTEM).toContain('AUCUNE NÉGATION')
  })

  it('pour un patient, le dossier reste celui de la personne', () => {
    const pour = hypnosePrompt('induction', {
      context: { ...DOSSIER, scaleQuestion: '', echelle: [] } as never,
      mots: ['le phare'],
      themes: [],
      synthese: '',
      intention: '',
      precedents: [],
    })
    expect(pour.startsWith('Pour qui : Camille.')).toBe(true)
    expect(pour).toContain('— le phare')
    expect(pour).not.toContain('PERSONNE EN PARTICULIER')
  })
})

/**
 * Une base imaginaire, qui répond à `from(table).select().eq().eq().maybeSingle()`
 * et retient ce qu'on lui a demandé.
 */
function base(lignes: Record<string, Array<{ id: string; cabinet_id: string }>>) {
  const lues: string[] = []
  const db = {
    from(table: string) {
      const filtres: Record<string, string> = {}
      const requete = {
        select: () => requete,
        eq: (colonne: string, valeur: string) => {
          filtres[colonne] = valeur
          return requete
        },
        maybeSingle: async () => {
          lues.push(table)
          const trouvee = (lignes[table] ?? []).find((l) => l.id === filtres.id && l.cabinet_id === filtres.cabinet_id)
          return { data: trouvee ? { id: trouvee.id } : null, error: null }
        },
      }
      return requete
    },
  }
  return { db: db as unknown as SupabaseClient, lues }
}

const CABINET = 'cab-1'
const DE_FICHE = '33333333-3333-4333-8333-333333333333'
const DE_BIBLIOTHEQUE = '44444444-4444-4444-8444-444444444444'
const D_AILLEURS = '55555555-5555-4555-8555-555555555555'

describe('recherchesPour — une hypnose du cabinet, sur une fiche ou dans sa bibliothèque', () => {
  const lignes = {
    hypnoses: [{ id: DE_FICHE, cabinet_id: CABINET }],
    bibliotheque_hypnoses: [
      { id: DE_BIBLIOTHEQUE, cabinet_id: CABINET },
      { id: D_AILLEURS, cabinet_id: 'cab-2' },
    ],
  }

  it('une hypnose de fiche se reconnaît d’une seule lecture', async () => {
    const { db, lues } = base(lignes)
    expect(await recherchesPour(CABINET, db).hypnoseDuCabinet(DE_FICHE)).toBe(true)
    expect(lues).toEqual(['hypnoses'])
  })

  it('une hypnose de la bibliothèque du cabinet se reconnaît aussi', async () => {
    const { db, lues } = base(lignes)
    expect(await recherchesPour(CABINET, db).hypnoseDuCabinet(DE_BIBLIOTHEQUE)).toBe(true)
    expect(lues).toEqual(['hypnoses', 'bibliotheque_hypnoses'])
  })

  it('celle de la bibliothèque d’un autre cabinet, non', async () => {
    const { db } = base(lignes)
    expect(await recherchesPour(CABINET, db).hypnoseDuCabinet(D_AILLEURS)).toBe(false)
  })
})

describe('coutDeLAppel — une hypnose de bibliothèque se paie une fois, comme les autres', () => {
  const recherches = {
    seanceDuCabinet: async () => false,
    hypnoseDuCabinet: async (id: string) => id === DE_BIBLIOTHEQUE,
  }

  it('la règle du forfait tient à son identifiant', async () => {
    expect(
      await coutDeLAppel('hypnose', { hypnoseId: DE_BIBLIOTHEQUE, mouvement: 'travail', context: null }, BAREME_PAR_DEFAUT, recherches),
    ).toEqual({ action: 'hypnose', prix: BAREME_PAR_DEFAUT.hypnose, ref: DE_BIBLIOTHEQUE, regle: 'hypnose', mouvement: 'travail' })
  })

  it('sans ligne ouverte, rien ne part', async () => {
    await expect(
      coutDeLAppel('hypnose', { hypnoseId: D_AILLEURS, mouvement: 'induction' }, BAREME_PAR_DEFAUT, recherches),
    ).rejects.toMatchObject({ status: 400 })
  })
})
