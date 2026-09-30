import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from './errors.js'

/* L'identification est remplacée — elle demande la base. Le reste, les
   gardes et la lecture des corps, est le vrai code. */
const identifierPourGesteSensible = vi.hoisted(() => vi.fn())
vi.mock('./auth.js', async (original) => ({
  ...(await original<typeof import('./auth.js')>()),
  identifierPourGesteSensible,
}))

const { agirRevendeur, coutsReels, entierBorne, rechargeDemandee, reglagesDemandes } = await import('./revendeur.js')

/** Un appelant dont la base répond `proprietaire` à is_reseller_owner. */
function appelant(resellerId: string | null, proprietaire: boolean) {
  return {
    userId: 'u1',
    resellerId,
    cabinetId: null,
    client: { rpc: vi.fn(async () => ({ data: proprietaire, error: null })) },
  }
}

describe('les gestes du revendeur', () => {
  beforeEach(() => identifierPourGesteSensible.mockReset())

  it('sont au propriétaire seul : l’équipe lit, elle ne règle pas', async () => {
    identifierPourGesteSensible.mockResolvedValue(appelant('r1', false))
    await expect(agirRevendeur('jeton', { action: 'reglages', actif: true })).rejects.toMatchObject({
      status: 403,
      message: 'Ce réglage est réservé au propriétaire du compte revendeur.',
    })
  })

  it('sont refusés à qui n’est d’aucun revendeur', async () => {
    identifierPourGesteSensible.mockResolvedValue(appelant(null, true))
    await expect(agirRevendeur('jeton', { action: 'cle', cle: 'sk-ant-x' })).rejects.toMatchObject({ status: 403 })
  })

  it('disent au propriétaire qu’un geste inconnu n’existe pas, avant de toucher à la base', async () => {
    identifierPourGesteSensible.mockResolvedValue(appelant('r1', true))
    await expect(agirRevendeur('jeton', { action: 'nimporte' })).rejects.toMatchObject({
      status: 400,
      message: 'Action inconnue.',
    })
  })
})

describe('les réglages demandés', () => {
  it('bornent le barème entre 0 et 10 000, action par action', () => {
    expect(reglagesDemandes({ bareme: { seance: 20, hypnose: 0 } })).toEqual({ bareme_seance: 20, bareme_hypnose: 0 })
    expect(() => reglagesDemandes({ bareme: { seance: -1 } })).toThrow(HttpError)
    expect(() => reglagesDemandes({ bareme: { seance: 10_001 } })).toThrow(/entre 0 et 10/)
    expect(() => reglagesDemandes({ bareme: { seance: 2.5 } })).toThrow(HttpError)
    expect(() => reglagesDemandes({ bareme: { inconnue: 3 } as never })).toThrow(/ne connaît pas/)
  })

  it('lisent l’essai et l’option Hypnose, et ne gardent que ce qui est demandé', () => {
    expect(reglagesDemandes({ essaiJetons: 150, optionHypnose: { prixCents: 2900, jours: 30 } })).toEqual({
      essai_jetons: 150,
      option_hypnose_prix_cents: 2900,
      option_hypnose_jours: 30,
    })
    expect(() => reglagesDemandes({ optionHypnose: { prixCents: 50 } })).toThrow(HttpError)
    expect(() => reglagesDemandes({ optionHypnose: { jours: 0 } })).toThrow(HttpError)
    expect(reglagesDemandes({})).toEqual({})
  })

  it('n’acceptent qu’un vrai booléen pour activer', () => {
    expect(reglagesDemandes({ actif: false })).toEqual({ actif: false })
    expect(() => reglagesDemandes({ actif: 'oui' })).toThrow(HttpError)
  })
})

describe('les recharges demandées', () => {
  it('exigent un nom, des jetons et un prix d’un euro au moins à la création', () => {
    expect(rechargeDemandee({ libelle: ' 100 jetons ', jetons: 100, prixCents: 1200 }, true)).toEqual({
      libelle: '100 jetons',
      jetons: 100,
      prix_cents: 1200,
    })
    expect(() => rechargeDemandee({ libelle: '', jetons: 100, prixCents: 1200 }, true)).toThrow(HttpError)
    expect(() => rechargeDemandee({ libelle: 'x', jetons: 0, prixCents: 1200 }, true)).toThrow(HttpError)
    expect(() => rechargeDemandee({ libelle: 'x', jetons: 10, prixCents: 99 }, true)).toThrow(HttpError)
  })

  it('ne touchent en réglage que ce qui est demandé', () => {
    expect(rechargeDemandee({ actif: false }, false)).toEqual({ actif: false })
    expect(rechargeDemandee({ prixCents: 1500 }, false)).toEqual({ prix_cents: 1500 })
  })

  it('lisent un entier donné en texte, et refusent le reste', () => {
    expect(entierBorne('12', 0, 100, 'x')).toBe(12)
    expect(() => entierBorne('', 0, 100, 'x')).toThrow(HttpError)
    expect(() => entierBorne(null, 0, 100, 'x')).toThrow(HttpError)
  })
})

describe('ce que coûte vraiment une action', () => {
  it('traduit les genres d’appel en actions, et compte quatre mouvements par hypnose', () => {
    const couts = coutsReels([
      { kind: 'hypnose', appels: 8, moyen_cents: '10.34' },
      { kind: 'brouillon_seance', appels: 2, moyen_cents: 5.56 },
      { kind: 'inconnu', appels: 1, moyen_cents: 99 },
    ])
    expect(couts.map((c) => c.action)).toEqual(['seance', 'hypnose'])
    expect(couts[0]).toEqual({ action: 'seance', appels: 2, parAppelCentimesUsd: 5.56, parActionCentimesEur: 5.12 })
    expect(couts[1]).toMatchObject({ action: 'hypnose', parAppelCentimesUsd: 10.34, parActionCentimesEur: 38.05 })
  })

  /* 0066 : la retouche se compte sous le genre « revision ». Sans cette
     ligne, le barème des retouches restait « non mesuré » chez le revendeur. */
  it('lit une retouche comme une retouche, au prix d’un seul appel', () => {
    const couts = coutsReels([{ kind: 'revision', appels: 5, moyen_cents: 2 }])
    expect(couts).toEqual([{ action: 'retouche', appels: 5, parAppelCentimesUsd: 2, parActionCentimesEur: 1.84 }])
  })
})
