import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from './errors.js'

/*
 * L'analyse en mode jetons, sans base ni modèle : la base, les jetons et la
 * clé du cabinet sont remplacés, le reste — l'ordre des gestes, les refus —
 * est le vrai code de server/ai.ts. Aucun appel au modèle n'a lieu : chaque
 * cas échoue avant, ou sur la lecture du corps.
 */
const m = vi.hoisted(() => ({
  abonnementEnRegle: vi.fn(async () => true),
  hypnoseOuverte: vi.fn(async () => true),
  facturationDuCabinet: vi.fn(),
  coutDeLAppel: vi.fn(async () => ({ action: 'module', prix: 5, ref: null, regle: 'prix', mouvement: null })),
  reserver: vi.fn(async () => ({ consommation: 'conso-1', jetons: 5, compris: false })),
  confirmer: vi.fn(async () => undefined),
  rembourser: vi.fn(async () => undefined),
  soldeDuCabinet: vi.fn(async () => 40),
  cleAnthropicDuCabinet: vi.fn(async () => null),
}))

vi.mock('./auth.js', async (original) => ({
  ...(await original<typeof import('./auth.js')>()),
  clientAdmin: () => ({}),
}))
vi.mock('./droits.js', async (original) => ({
  ...(await original<typeof import('./droits.js')>()),
  abonnementEnRegle: m.abonnementEnRegle,
  hypnoseOuverte: m.hypnoseOuverte,
}))
vi.mock('./jetons.js', async (original) => ({
  ...(await original<typeof import('./jetons.js')>()),
  facturationDuCabinet: m.facturationDuCabinet,
  coutDeLAppel: m.coutDeLAppel,
  recherchesPour: () => ({}),
  reserver: m.reserver,
  confirmer: m.confirmer,
  rembourser: m.rembourser,
  soldeDuCabinet: m.soldeDuCabinet,
}))
vi.mock('./integrations.js', async (original) => ({
  ...(await original<typeof import('./integrations.js')>()),
  cleAnthropicDuCabinet: m.cleAnthropicDuCabinet,
}))

const { analyserPourCabinet } = await import('./ai.js')
const { REFUS_HYPNOSE } = await import('./droits.js')
const { SoldeInsuffisant, BAREME_PAR_DEFAUT, REFUS_JETONS_SANS_CLE } = await import('./jetons.js')

const JETONS = { mode: 'jetons', resellerId: 'r1', cle: 'sk-ant-du-revendeur', bareme: BAREME_PAR_DEFAUT, paiement: true }

async function refus(promesse: Promise<unknown>): Promise<HttpError> {
  try {
    await promesse
  } catch (err) {
    return err as HttpError
  }
  throw new Error('la promesse devait échouer')
}

describe('l’analyse en mode jetons', () => {
  beforeEach(() => {
    for (const f of Object.values(m)) f.mockClear()
    m.abonnementEnRegle.mockResolvedValue(true)
    m.hypnoseOuverte.mockResolvedValue(true)
    m.facturationDuCabinet.mockResolvedValue(JETONS)
    m.reserver.mockResolvedValue({ consommation: 'conso-1', jetons: 5, compris: false })
  })

  it('refuse l’hypnose hors offre avant de lire la facturation, donc avant toute dépense', async () => {
    m.hypnoseOuverte.mockResolvedValue(false)
    const err = await refus(analyserPourCabinet('hypnose', { mouvement: 'induction' }, 'cab-1'))
    expect(err.status).toBe(403)
    expect(err.message).toBe(REFUS_HYPNOSE)
    expect(m.facturationDuCabinet).not.toHaveBeenCalled()
    expect(m.reserver).not.toHaveBeenCalled()
  })

  it('ne demande le droit à l’hypnose que pour l’hypnose', async () => {
    await refus(analyserPourCabinet('module', { intent: 'court' }, 'cab-1'))
    expect(m.hypnoseOuverte).not.toHaveBeenCalled()
  })

  it('réserve avant l’appel, et rend les jetons quand l’appel échoue', async () => {
    const err = await refus(analyserPourCabinet('module', { intent: 'court' }, 'cab-1'))
    expect(err.status).toBe(400)
    expect(m.reserver).toHaveBeenCalledTimes(1)
    expect(m.rembourser).toHaveBeenCalledWith('conso-1', expect.anything())
    expect(m.confirmer).not.toHaveBeenCalled()
  })

  it('à court de jetons, rien ne part au modèle et rien n’est à rendre', async () => {
    m.reserver.mockRejectedValue(new SoldeInsuffisant(3, 5, true))
    const err = await refus(analyserPourCabinet('module', { intent: 'Un module assez long pour passer.' }, 'cab-1'))
    expect(err.status).toBe(402)
    expect(err.message).toContain('Il vous reste 3 jetons')
    expect(m.rembourser).not.toHaveBeenCalled()
    expect(m.confirmer).not.toHaveBeenCalled()
  })

  it('hors du mode jetons, le chemin d’avant : la clé du cabinet, et rien de décompté', async () => {
    m.facturationDuCabinet.mockResolvedValue({ mode: 'cle_cabinet' })
    const err = await refus(analyserPourCabinet('affirmations', {}, 'cab-1'))
    expect(err.status).toBe(503)
    expect(err.message).toContain("n'a pas encore sa clé Anthropic")
    expect(m.cleAnthropicDuCabinet).toHaveBeenCalledWith('cab-1')
    expect(m.coutDeLAppel).not.toHaveBeenCalled()
    expect(m.reserver).not.toHaveBeenCalled()
  })

  it('des jetons forcés sans la clé du revendeur : le 503 remonte, jamais la clé du cabinet (0070)', async () => {
    m.facturationDuCabinet.mockRejectedValue(new HttpError(503, REFUS_JETONS_SANS_CLE))
    m.cleAnthropicDuCabinet.mockResolvedValue('sk-ant-du-cabinet' as never)
    const err = await refus(analyserPourCabinet('module', { intent: 'Un module assez long pour passer.' }, 'cab-1'))
    expect(err.status).toBe(503)
    expect(err.message).toBe(REFUS_JETONS_SANS_CLE)
    expect(m.cleAnthropicDuCabinet).not.toHaveBeenCalled()
    expect(m.reserver).not.toHaveBeenCalled()
    m.cleAnthropicDuCabinet.mockResolvedValue(null)
  })

  it('hors contrat, ni facturation ni jetons', async () => {
    m.abonnementEnRegle.mockResolvedValue(false)
    const err = await refus(analyserPourCabinet('module', { intent: 'Un module assez long pour passer.' }, 'cab-1'))
    expect(err.status).toBe(403)
    expect(m.facturationDuCabinet).not.toHaveBeenCalled()
  })
})
