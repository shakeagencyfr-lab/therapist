import { describe, expect, it } from 'vitest'
import { motsInterditsDans } from './garde'

/**
 * Le banc refuse une REVENDICATION, pas un sigle : une page honnête doit
 * pouvoir répondre « non » à la question qu'une acheteuse se pose.
 */
describe('ce que la page ne dira jamais', () => {
  it('refuse une certification ou une conformité affirmée', () => {
    for (const phrase of [
      'Klaro est certifié HDS.',
      'Un hébergeur certifié pour vos données de santé.',
      'Hébergement HDS certifié, en France.',
      'Une solution conforme RGPD.',
      '100 % conforme au RGPD',
      'Hébergeur agréé HDS',
      'Klaro, certification HDS obtenue',
    ]) {
      expect(motsInterditsDans(phrase), phrase).not.toEqual([])
    }
  })

  it('laisse dire qu’on ne l’a pas', () => {
    for (const phrase of [
      'Non. Klaro n’est pas certifié HDS (hébergement de données de santé), et ne le prétend pas.',
      'Les données sont-elles hébergées selon la norme HDS ?',
      'Aucune certification n’est revendiquée.',
      'Klaro n’est pas un hébergeur certifié.',
    ]) {
      expect(motsInterditsDans(phrase), phrase).toEqual([])
    }
  })

  it('refuse toujours témoignages, avis et étoiles', () => {
    expect(motsInterditsDans('Leurs témoignages')).not.toEqual([])
    expect(motsInterditsDans('4,8/5 sur 120 avis clients')).not.toEqual([])
    expect(motsInterditsDans('★★★★★')).not.toEqual([])
    expect(motsInterditsDans('Essai de 14 jours, réponse sous 2/5 jours')).toEqual([])
  })
})
