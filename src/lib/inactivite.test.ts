import { describe, expect, it } from 'vitest'
import {
  CLE_METADONNEE,
  DELAI_PAR_DEFAUT,
  PREAVIS_MS,
  etatVeille,
  libelleDelai,
  lireActivitePartagee,
  lireDelai,
  lireSortie,
  noteDeSortie,
  phraseDeSortie,
  plusRecente,
  secondesRestantes,
} from './inactivite'

const T0 = Date.UTC(2026, 8, 29, 14, 0, 0)
const MIN = 60_000

describe('le délai choisi', () => {
  it('vaut trente minutes pour qui n’a rien choisi', () => {
    expect(DELAI_PAR_DEFAUT).toBe(30)
    expect(lireDelai(undefined)).toBe(30)
    expect(lireDelai({})).toBe(30)
  })

  it('lit les quatre choix, y compris « jamais »', () => {
    for (const n of [0, 15, 30, 60]) expect(lireDelai({ [CLE_METADONNEE]: n })).toBe(n)
    expect(lireDelai({ [CLE_METADONNEE]: '15' })).toBe(15)
  })

  it('ramène au défaut une valeur inventée', () => {
    expect(lireDelai({ [CLE_METADONNEE]: 5 })).toBe(30)
    expect(lireDelai({ [CLE_METADONNEE]: 99999 })).toBe(30)
    expect(lireDelai({ [CLE_METADONNEE]: 'jamais' })).toBe(30)
    expect(lireDelai({ [CLE_METADONNEE]: null })).toBe(30)
  })

  it('se dit en français', () => {
    expect(libelleDelai(0)).toBe('Jamais')
    expect(libelleDelai(15)).toBe('15 minutes')
    expect(libelleDelai(60)).toBe('1 heure')
  })
})

describe('la veille', () => {
  const base = { derniereActivite: T0, delaiMinutes: 30 as const, captation: false }

  it('reste active tant que le préavis n’a pas commencé', () => {
    expect(etatVeille({ ...base, maintenant: T0 + 10 * MIN })).toEqual({ etat: 'actif', resteMs: 20 * MIN })
  })

  it('prévient pendant la dernière minute', () => {
    const e = etatVeille({ ...base, maintenant: T0 + 30 * MIN - 45_000 })
    expect(e).toEqual({ etat: 'preavis', resteMs: 45_000 })
    expect(etatVeille({ ...base, maintenant: T0 + 30 * MIN - PREAVIS_MS }).etat).toBe('preavis')
  })

  it('ferme une fois le délai passé', () => {
    expect(etatVeille({ ...base, maintenant: T0 + 30 * MIN })).toEqual({ etat: 'expire' })
    expect(etatVeille({ ...base, maintenant: T0 + 5 * 60 * MIN })).toEqual({ etat: 'expire' })
  })

  it('ne ferme jamais pendant une captation, quel que soit le temps écoulé', () => {
    expect(etatVeille({ ...base, captation: true, maintenant: T0 + 3 * 60 * MIN })).toEqual({ etat: 'suspendu' })
  })

  it('ne compte pas quand la praticienne a choisi « jamais »', () => {
    expect(etatVeille({ ...base, delaiMinutes: 0, maintenant: T0 + 24 * 60 * MIN })).toEqual({ etat: 'suspendu' })
  })

  it('ne fait pas expirer sur une horloge qui recule', () => {
    expect(etatVeille({ ...base, maintenant: T0 - 10 * MIN })).toEqual({ etat: 'actif', resteMs: 30 * MIN })
  })

  it('compte les secondes du préavis vers le haut, sans jamais afficher zéro', () => {
    expect(secondesRestantes(45_000)).toBe(45)
    expect(secondesRestantes(44_001)).toBe(45)
    expect(secondesRestantes(200)).toBe(1)
    expect(secondesRestantes(0)).toBe(1)
  })
})

describe("l'activité partagée entre onglets", () => {
  it('lit l’heure déposée par un autre onglet', () => {
    expect(lireActivitePartagee(String(T0), T0 + MIN)).toBe(T0)
  })

  it('ignore une valeur illisible, négative ou venue du futur', () => {
    expect(lireActivitePartagee(null, T0)).toBeNull()
    expect(lireActivitePartagee('abc', T0)).toBeNull()
    expect(lireActivitePartagee('-5', T0)).toBeNull()
    // Posée à la main pour ne jamais être déconnectée : ne tient rien ouvert.
    expect(lireActivitePartagee(String(T0 + 365 * 24 * 60 * MIN), T0)).toBeNull()
  })

  it('retient le geste le plus récent, d’où qu’il vienne', () => {
    expect(plusRecente(T0, T0 + MIN)).toBe(T0 + MIN)
    expect(plusRecente(T0 + MIN, T0)).toBe(T0 + MIN)
    expect(plusRecente(T0, null)).toBe(T0)
  })
})

describe('la note laissée à la porte', () => {
  it('se relit dans les douze heures', () => {
    const note = noteDeSortie(T0, 15)
    expect(lireSortie(note, T0 + 60 * MIN)).toBe(15)
    expect(lireSortie(note, T0 + 13 * 60 * MIN)).toBeNull()
  })

  it('ignore une note abîmée', () => {
    expect(lireSortie(null, T0)).toBeNull()
    expect(lireSortie('n’importe quoi', T0)).toBeNull()
    expect(lireSortie(`${T0}:7`, T0)).toBeNull()
    expect(lireSortie(`${T0}:0`, T0)).toBeNull()
  })

  it('dit la durée en français', () => {
    expect(phraseDeSortie(30)).toMatch(/après 30 minutes sans activité/)
    expect(phraseDeSortie(60)).toMatch(/après une heure sans activité/)
  })
})
