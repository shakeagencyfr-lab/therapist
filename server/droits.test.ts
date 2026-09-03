import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { exigerDroit, placesRestantes, type Droits } from './droits'
import { HttpError } from './errors'

const OUVERT: Droits = {
  maxPatients: 40,
  patientesActives: 12,
  shop: true,
  marqueBlanche: false,
  site: true,
  offre: 'Cabinet',
  offreCode: 'cabinet',
}

describe('exigerDroit', () => {
  it('laisse passer un levier ouvert, refuse un levier fermé', () => {
    expect(() => exigerDroit(OUVERT, 'shop')).not.toThrow()
    expect(() => exigerDroit(OUVERT, 'marqueBlanche')).toThrow(HttpError)
    expect(() => exigerDroit(OUVERT, 'marqueBlanche')).toThrow(/revendeur peut l'ouvrir/)
  })
})

describe('placesRestantes', () => {
  it('compte ce qui reste, et ne descend pas sous zéro', () => {
    expect(placesRestantes(OUVERT)).toBe(28)
    expect(placesRestantes({ ...OUVERT, patientesActives: 51 })).toBe(0)
  })

  it('rend null quand l’offre est sans limite', () => {
    expect(placesRestantes({ ...OUVERT, maxPatients: null })).toBeNull()
  })
})

/**
 * `cabinet_droits()` ne répond qu'à un membre du cabinet ou à son revendeur :
 * elle part de `auth.uid()`. Appelée avec la clé de service — où il n'y a
 * aucun `auth.uid()` — elle rend NULL, en silence.
 *
 * C'est exactement ce qui a fait que le SMTP d'un cabinet n'est jamais parti
 * pendant deux versions : le droit était lu du mauvais côté, la lecture
 * rendait NULL, et l'envoi retombait sur la plateforme sans rien dire. Le
 * serveur qui demande POUR LUI-MÊME lit `levierDuCabinet`, jamais cette
 * fonction — et ce fichier est le seul endroit où son nom a le droit
 * d'apparaître.
 */
describe('cabinet_droits, côté serveur', () => {
  it("n'est appelée que depuis droits.ts, jamais sous la clé de service", () => {
    const ici = dirname(fileURLToPath(import.meta.url))
    const coupables = readdirSync(ici)
      .filter((f) => f.endsWith('.ts') && f !== 'droits.ts' && !f.endsWith('.test.ts'))
      .filter((f) => readFileSync(join(ici, f), 'utf8').includes("rpc('cabinet_droits'"))
    expect(coupables).toEqual([])
  })
})
