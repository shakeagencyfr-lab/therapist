import { afterEach, describe, expect, it, vi } from 'vitest'
import { avantDelai, decisionRelecture, roleAGarder } from './relecture'

describe('decisionRelecture', () => {
  /* Le défaut d'origine : auth-js émet SIGNED_IN à chaque retour sur
     l'onglet, et TOKEN_REFRESHED toutes les heures. Relire à chaque fois,
     c'était risquer, sur une panne d'une seconde, de démonter l'espace. */
  it('ne relit pas au retour sur l’onglet pour le même compte', () => {
    expect(decisionRelecture('SIGNED_IN', 'u1', 'u1')).toBe('garder')
  })

  it('ne relit pas au rafraîchissement horaire du jeton', () => {
    expect(decisionRelecture('TOKEN_REFRESHED', 'u1', 'u1')).toBe('garder')
  })

  it('ne relit pas deux fois la session initiale', () => {
    // getSession() et INITIAL_SESSION apportent la même session au démarrage.
    expect(decisionRelecture('INITIAL_SESSION', 'u1', 'u1')).toBe('garder')
  })

  it('relit à la première session connue', () => {
    expect(decisionRelecture('INITIAL_SESSION', 'u1', null)).toBe('relire')
    expect(decisionRelecture('SIGNED_IN', 'u1', null)).toBe('relire')
  })

  it('relit quand un autre compte entre sur le même appareil', () => {
    expect(decisionRelecture('SIGNED_IN', 'u2', 'u1')).toBe('relire')
  })

  it('relit quand le compte vient d’être modifié', () => {
    expect(decisionRelecture('USER_UPDATED', 'u1', 'u1')).toBe('relire')
  })

  it('oublie le rôle quand la session disparaît', () => {
    expect(decisionRelecture('SIGNED_OUT', null, 'u1')).toBe('oublier')
    expect(decisionRelecture('INITIAL_SESSION', null, null)).toBe('oublier')
  })
})

describe('roleAGarder', () => {
  const connu = { user_id: 'u1', cabinet: { id: 'c1' } }

  it('garde le rôle déjà lu du même compte quand la relecture échoue', () => {
    expect(roleAGarder(connu, 'u1')).toBe(connu)
  })

  it('ne rend jamais le rôle d’un autre compte', () => {
    expect(roleAGarder(connu, 'u2')).toBeNull()
  })

  it('ne rend rien quand aucun rôle n’a encore été lu', () => {
    expect(roleAGarder(null, 'u1')).toBeNull()
  })

  it('ne rend rien sans compte connecté', () => {
    expect(roleAGarder(connu, null)).toBeNull()
  })
})

describe('avantDelai', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rend la valeur arrivée à temps', async () => {
    await expect(avantDelai(Promise.resolve(42), 1_000)).resolves.toEqual({ aTemps: true, valeur: 42 })
  })

  it('cesse d’attendre une fois le délai passé', async () => {
    vi.useFakeTimers()
    const jamais = new Promise<number>(() => {})
    const issue = avantDelai(jamais, 8_000)
    await vi.advanceTimersByTimeAsync(8_000)
    await expect(issue).resolves.toEqual({ aTemps: false })
  })

  it('n’annule pas la promesse : un résultat tardif reste lisible', async () => {
    vi.useFakeTimers()
    let livrer: (v: string) => void = () => {}
    const lente = new Promise<string>((r) => {
      livrer = r
    })
    const issue = avantDelai(lente, 1_000)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(issue).resolves.toEqual({ aTemps: false })
    livrer('arrivé')
    await expect(lente).resolves.toBe('arrivé')
  })

  it('laisse passer un rejet', async () => {
    await expect(avantDelai(Promise.reject(new Error('panne')), 1_000)).rejects.toThrow('panne')
  })
})
