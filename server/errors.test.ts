import { afterEach, describe, expect, it, vi } from 'vitest'
import { journaliserRefus, niveauDuJournal } from './errors'

describe('le niveau du journal', () => {
  it('range une panne du serveur parmi les erreurs', () => {
    for (const status of [500, 502, 503, 504]) expect(niveauDuJournal(status), String(status)).toBe('error')
  })

  /* Un visiteur non connecté, un droit manquant, une méthode inconnue : le
     produit fonctionne. Journalisés en erreur, ils noyaient les vraies pannes. */
  it('laisse les refus ordinaires au rang des avertissements', () => {
    for (const status of [400, 401, 403, 404, 405, 409, 429]) {
      expect(niveauDuJournal(status), String(status)).toBe('warn')
    }
  })
})

describe('la ligne de journal', () => {
  afterEach(() => vi.restoreAllMocks())

  it('passe par console.warn pour une 401, sans rien écrire en erreur', () => {
    const avert = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
    journaliserRefus('[cabinet] GET', 401, 'Connectez-vous pour utiliser cette fonction.')
    expect(avert).toHaveBeenCalledWith('[cabinet] GET — 401 · Connectez-vous pour utiliser cette fonction.')
    expect(erreur).not.toHaveBeenCalled()
  })

  it('passe par console.error pour une 502', () => {
    const avert = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
    journaliserRefus('[boutique] demarrer', 502, 'Le paiement est indisponible.')
    expect(erreur).toHaveBeenCalledWith('[boutique] demarrer — 502 · Le paiement est indisponible.')
    expect(avert).not.toHaveBeenCalled()
  })
})
