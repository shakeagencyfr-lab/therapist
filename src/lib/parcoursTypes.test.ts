import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ATELIER_TYPES } from '../data/atelier'
import { seFaitParLePatient } from './typesDeModules'
import {
  LIMITE_CONSIGNE,
  MAX_EXERCICES,
  TYPES_DU_PARCOURS,
  apercuPourLePatient,
  choixParDefaut,
  deplacer,
  etapesDeLaConsigne,
  libelleAjout,
  messageRefusParcours,
  parcoursAEnvoyer,
  parcoursModifie,
  phraseAjout,
  programmesDepuisLignes,
  refusParcours,
  type ExerciceType,
} from './parcoursTypes'

const RESPIRATION: ExerciceType = {
  id: 'e1',
  titre: 'Respiration carrée',
  type: 'Exercice',
  consigne: 'Inspirez quatre temps.\nExpirez quatre temps.',
}
const LIGNES: ExerciceType = { id: 'e2', titre: 'Trois lignes du soir', type: 'Écriture', consigne: '' }

describe('les types du parcours', () => {
  it("sont ceux de l'atelier, et tous se font", () => {
    expect([...TYPES_DU_PARCOURS]).toEqual(ATELIER_TYPES)
    for (const t of TYPES_DU_PARCOURS) expect(seFaitParLePatient(t)).toBe(true)
  })

  it('sont ceux que la base accepte', () => {
    const ici = dirname(fileURLToPath(import.meta.url))
    const sql = readFileSync(join(ici, '../../supabase/migrations/0059_la_seance_a_une_date.sql'), 'utf8')
    const liste = TYPES_DU_PARCOURS.map((t) => `'${t}'`).join(', ')
    expect(sql).toContain(`type_module in (${liste})`)
    expect(sql).toContain(`not in (${liste})`)
    expect(sql).toContain(`> ${MAX_EXERCICES} then`)
    expect(sql).toContain(`<= ${LIMITE_CONSIGNE})`)
  })
})

describe('la lecture', () => {
  it('range les programmes par libellé, leurs exercices dans leur ordre', () => {
    const par = programmesDepuisLignes([
      {
        id: 'p1',
        label: 'Sommeil',
        exercices: [
          { id: 'b', rang: 1, titre: 'Trois lignes', type_module: 'Écriture', consigne: null },
          { id: 'a', rang: 0, titre: 'Respiration', type_module: 'Exercice', consigne: 'x' },
          { id: 'c', rang: 2, titre: 'Écouter', type_module: 'Audio', consigne: '' },
        ],
      },
      { id: 'p2', label: 'Tabac', exercices: null },
    ])
    expect(par.Sommeil.exercices).toEqual([
      { id: 'a', titre: 'Respiration', type: 'Exercice', consigne: 'x' },
      { id: 'b', titre: 'Trois lignes', type: 'Écriture', consigne: '' },
    ])
    expect(par.Tabac).toEqual({ id: 'p2', label: 'Tabac', exercices: [] })
    expect(programmesDepuisLignes(null)).toEqual({})
  })
})

describe("l'édition", () => {
  it('refuse ce que la base refuserait, avec ses mots', () => {
    expect(refusParcours([RESPIRATION, LIGNES])).toBeNull()
    expect(refusParcours([])).toBeNull()
    expect(refusParcours([{ ...RESPIRATION, titre: '  ' }])).toBe("Chaque exercice a besoin d'un titre.")
    expect(refusParcours([{ ...RESPIRATION, titre: 'x'.repeat(121) }])).toMatch(/120 caractères/)
    expect(refusParcours([{ ...RESPIRATION, consigne: 'x'.repeat(601) }])).toMatch(/600 caractères/)
    expect(refusParcours([{ ...RESPIRATION, type: 'Audio' as never }])).toMatch(/Type d'exercice inconnu/)
    expect(refusParcours(Array.from({ length: 13 }, () => RESPIRATION))).toMatch(/douze exercices/)
  })

  it('envoie les champs relus, sans identifiant', () => {
    expect(parcoursAEnvoyer([{ ...RESPIRATION, titre: ' Respiration ', consigne: ' a \n' }])).toEqual([
      { titre: 'Respiration', type: 'Exercice', consigne: 'a' },
    ])
  })

  it("voit ce qui a changé — pas un espace de plus", () => {
    expect(parcoursModifie([RESPIRATION], [{ ...RESPIRATION, titre: 'Respiration carrée ' }])).toBe(false)
    expect(parcoursModifie([RESPIRATION], [{ ...RESPIRATION, type: 'Journal' }])).toBe(true)
    expect(parcoursModifie([RESPIRATION, LIGNES], [LIGNES, RESPIRATION])).toBe(true)
  })

  it('déplace d’un cran sans sortir de la liste', () => {
    expect(deplacer(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(deplacer(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b'])
    expect(deplacer(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(deplacer(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
  })

  it('découpe la consigne en étapes comme la base', () => {
    expect(etapesDeLaConsigne('Inspirez.\r\nBloquez.\n\n  Expirez.  ')).toEqual(['Inspirez.', 'Bloquez.', 'Expirez.'])
    expect(etapesDeLaConsigne('   ')).toEqual([])
  })
})

describe('la proposition au patient', () => {
  it('reconnaît ce qu’il a déjà, et ne le coche pas', () => {
    const apercu = apercuPourLePatient(
      [RESPIRATION, LIGNES, { titre: 'Pas encore enregistré', type: 'Journal', consigne: '' }],
      [
        { title: '  respiration CARRÉE ', kind: 'Exercice' },
        // Même titre, autre type : ce n'est pas le même exercice.
        { title: 'Trois lignes du soir', kind: 'Journal' },
      ],
    )
    expect(apercu.map((e) => [e.id, e.dejaLa])).toEqual([
      ['e1', true],
      ['e2', false],
    ])
    expect(choixParDefaut(apercu)).toEqual(['e2'])
  })

  it('dit ce qui a été fait', () => {
    expect(phraseAjout(2, 'Camille R.')).toBe('2 exercices ajoutés au parcours de Camille R.')
    expect(phraseAjout(1, 'Paul')).toBe('1 exercice ajouté au parcours de Paul.')
    expect(phraseAjout(0, 'Camille R.')).toMatch(/déjà dans son parcours/)
    expect(libelleAjout(0)).toBe('Choisissez au moins un exercice')
    expect(libelleAjout(3)).toBe('Ajouter 3 exercices')
  })

  it('rend les refus de la base tels quels, et traduit le reste', () => {
    expect(messageRefusParcours("Cette fiche n'est pas un suivi en cours de votre cabinet.")).toBe(
      "Cette fiche n'est pas un suivi en cours de votre cabinet.",
    )
    expect(messageRefusParcours('Could not find the function public.cabinet_regler_parcours_type in the schema cache')).toMatch(
      /pas encore disponibles/,
    )
    expect(messageRefusParcours('fetch failed')).toMatch(/Vérifiez votre connexion/)
    expect(messageRefusParcours(null)).toMatch(/Vérifiez votre connexion/)
  })
})
