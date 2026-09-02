import { describe, expect, it } from 'vitest'
import { clock, dateDuJour, durationToSeconds, euro, plural, timecode } from './format'

describe('formats partagés', () => {
  it('clock : mm:ss sur deux chiffres', () => {
    expect(clock(0)).toBe('00:00')
    expect(clock(65)).toBe('01:05')
    expect(clock(3599)).toBe('59:59')
  })
  it('timecode : m:ss', () => {
    expect(timecode(214)).toBe('3:34')
    expect(timecode(5)).toBe('0:05')
  })
  it('durationToSeconds inverse timecode', () => {
    expect(durationToSeconds('03:34')).toBe(214)
    expect(durationToSeconds('—')).toBe(0)
  })
  it('euro : virgule décimale, plancher sous un centime', () => {
    expect(euro(0.12)).toBe('0,12 €')
    expect(euro(0.001)).toBe('moins de 0,01 €')
  })
  it('plural accorde', () => {
    expect(plural(1, 'séance', 'séances')).toBe('1 séance')
    expect(plural(3, 'séance', 'séances')).toBe('3 séances')
  })
  it('dateDuJour : jour et mois en toutes lettres', () => {
    expect(dateDuJour(new Date(2026, 8, 1))).toBe('1 septembre')
  })
})
