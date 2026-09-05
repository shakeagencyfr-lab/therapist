import { describe, expect, it } from 'vitest'
import { jourDeParis } from './usePatientData'

/**
 * Le jour de la note du soir, dans le fuseau de la base.
 *
 * `patient_note_echelle()` crée ou corrige la ligne du soir en comparant des
 * dates d'Europe/Paris ; l'écran comparait des dates UTC. Entre minuit et
 * deux heures du matin (heure d'été), les deux horloges désignent des jours
 * différents : l'écran reposait une question déjà répondue, et la réponse
 * écrasait la première sur la courbe que la thérapeute lit en séance.
 *
 * Les deux fenêtres de bascule sont éprouvées explicitement — c'est là, et
 * seulement là, que le défaut se manifestait.
 */
describe('jourDeParis', () => {
  it('donne la date de Paris, pas celle d’UTC, en heure d’été', () => {
    // 00 h 30 à Paris le 2 juillet = 22 h 30 UTC le 1er juillet.
    expect(jourDeParis('2026-07-01T22:30:00Z')).toBe('2026-07-02')
    // 23 h 30 à Paris le 1er = 21 h 30 UTC le 1er : même jour des deux côtés.
    expect(jourDeParis('2026-07-01T21:30:00Z')).toBe('2026-07-01')
  })

  it('donne la date de Paris en heure d’hiver, où le décalage n’est que d’une heure', () => {
    // 00 h 30 à Paris le 2 janvier = 23 h 30 UTC le 1er.
    expect(jourDeParis('2026-01-01T23:30:00Z')).toBe('2026-01-02')
    expect(jourDeParis('2026-01-01T22:30:00Z')).toBe('2026-01-01')
  })

  /* Le cas exact du défaut : deux instants de la MÊME nuit parisienne, qui
     tombaient de part et d'autre de minuit UTC. L'écran les croyait sur deux
     jours ; la base les rangeait sur un seul. */
  it('range sur le même jour deux instants de la même nuit parisienne', () => {
    const juste_apres_minuit = '2026-07-01T22:30:00Z' // 00 h 30 à Paris
    const trois_heures = '2026-07-02T01:00:00Z' // 03 h 00 à Paris
    expect(jourDeParis(juste_apres_minuit)).toBe(jourDeParis(trois_heures))
  })

  it('rend le format AAAA-MM-JJ, comparable tel quel', () => {
    expect(jourDeParis('2026-03-09T12:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(jourDeParis()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
