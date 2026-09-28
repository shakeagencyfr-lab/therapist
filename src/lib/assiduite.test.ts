import { describe, expect, it } from 'vitest'
import {
  assiduite,
  decalerJour,
  jourDeParis,
  libelleSeptJours,
  mesurable,
  septJours,
  tacheEnRetard,
} from './assiduite'

/**
 * La pratique de chaque jour.
 *
 * Une case cochée l'était pour toujours : « La journée est faite » ne
 * revenait jamais sur « à faire », et l'assiduité comptait les exercices
 * faits UNE fois. Les exercices entre les séances se refont chaque jour ;
 * l'assiduité devient la part des jours faits sur les sept derniers.
 */

describe('decalerJour', () => {
  it('traverse les mois, les années et les années bissextiles', () => {
    expect(decalerJour('2026-03-01', -1)).toBe('2026-02-28')
    expect(decalerJour('2028-03-01', -1)).toBe('2028-02-29')
    expect(decalerJour('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('ne glisse pas au changement d’heure', () => {
    // Le 29 mars 2026, Paris passe à l'heure d'été : le jour n'a que 23 heures.
    expect(decalerJour('2026-03-30', -1)).toBe('2026-03-29')
    expect(decalerJour('2026-03-29', -1)).toBe('2026-03-28')
    expect(decalerJour('2026-10-26', -1)).toBe('2026-10-25')
  })
})

describe('jourDeParis', () => {
  it('range 0 h 30 à Paris sur le bon jour, pas sur la veille UTC', () => {
    expect(jourDeParis('2026-07-01T22:30:00Z')).toBe('2026-07-02')
    expect(jourDeParis('2026-01-01T23:30:00Z')).toBe('2026-01-02')
  })
})

describe('septJours — les jours faits sur la semaine', () => {
  const aujourdhui = '2026-09-28'
  const semaine = (n: number) => Array.from({ length: n }, (_, i) => decalerJour(aujourdhui, -i))

  it('tous les jours de la semaine faits, aujourd’hui compris : 7 sur 7', () => {
    expect(septJours(semaine(7), '2026-09-01', aujourdhui)).toEqual({ faits: 7, possibles: 7 })
  })

  it('aujourd’hui pas encore fait ne compte pas comme manqué', () => {
    // Fait les sept jours d'avant, pas encore ce matin : toujours 7 sur 7.
    const avant = semaine(8).slice(1)
    expect(septJours(avant, '2026-09-01', aujourdhui)).toEqual({ faits: 7, possibles: 7 })
  })

  it('fait une fois, il y a trois semaines : 0 sur 7 — la case d’autrefois ne vaut plus', () => {
    expect(septJours(['2026-09-07'], '2026-09-01', aujourdhui)).toEqual({ faits: 0, possibles: 7 })
  })

  it('un exercice confié il y a trois jours ne se juge que sur ses jours', () => {
    // Confié le 25 : possibles le 26 et le 27 (aujourd'hui pas encore fait).
    expect(septJours(['2026-09-26'], '2026-09-25', aujourdhui)).toEqual({ faits: 1, possibles: 2 })
  })

  it('le jour où il est confié ne compte que s’il est fait', () => {
    expect(septJours([], aujourdhui, aujourdhui)).toEqual({ faits: 0, possibles: 0 })
    expect(septJours([aujourdhui], aujourdhui, aujourdhui)).toEqual({ faits: 1, possibles: 1 })
    expect(septJours([], decalerJour(aujourdhui, -1), aujourdhui)).toEqual({ faits: 0, possibles: 0 })
  })

  it('ignore les jours hors de la fenêtre', () => {
    expect(septJours(['2026-09-20', '2026-09-21'], '2026-09-01', aujourdhui)).toEqual({ faits: 1, possibles: 7 })
  })
})

describe('assiduite — la part des jours faits', () => {
  it('additionne les jours, plutôt que de moyenner des pourcentages', () => {
    // 7/7 et 0/1 : 7 jours sur 8, pas (100 % + 0 %) / 2.
    expect(assiduite([{ faits: 7, possibles: 7 }, { faits: 0, possibles: 1 }])).toBe(88)
  })

  it('rien de mesurable donne 0, et le dit', () => {
    expect(assiduite([])).toBe(0)
    expect(assiduite([{ faits: 0, possibles: 0 }])).toBe(0)
    expect(mesurable([{ faits: 0, possibles: 0 }])).toBe(false)
    expect(mesurable([{ faits: 0, possibles: 3 }])).toBe(true)
  })

  it('la moitié des jours faits : 50 %', () => {
    expect(assiduite([{ faits: 3, possibles: 7 }, { faits: 4, possibles: 7 }])).toBe(50)
  })
})

describe('tacheEnRetard', () => {
  it('pas encore faite ce matin, mais faite cette semaine : pas en retard', () => {
    expect(tacheEnRetard({ faits: 4, possibles: 7 }, false)).toBe(false)
  })

  it('pas faite une seule fois sur ses jours : en retard', () => {
    expect(tacheEnRetard({ faits: 0, possibles: 3 }, false)).toBe(true)
  })

  it('tout juste confiée : pas encore en retard', () => {
    expect(tacheEnRetard({ faits: 0, possibles: 0 }, false)).toBe(false)
  })

  it('sans les jours, la case fait foi', () => {
    expect(tacheEnRetard(undefined, false)).toBe(true)
    expect(tacheEnRetard(undefined, true)).toBe(false)
  })
})

describe('libelleSeptJours', () => {
  it('dit les jours au singulier et au pluriel', () => {
    expect(libelleSeptJours({ faits: 3, possibles: 7 })).toBe('fait 3 jours sur 7')
    expect(libelleSeptJours({ faits: 1, possibles: 2 })).toBe('fait 1 jour sur 2')
    expect(libelleSeptJours({ faits: 0, possibles: 7 })).toBe('fait 0 jour sur 7')
  })

  it('ne dit pas « 0 jour sur 0 »', () => {
    expect(libelleSeptJours({ faits: 0, possibles: 0 })).toBe('tout juste confié')
  })
})
