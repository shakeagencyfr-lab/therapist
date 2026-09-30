import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HttpError } from './errors.js'
import {
  BAREME_PAR_DEFAUT,
  REFUS_JETONS_SANS_CLE,
  facturationDuCabinet,
  modeEffectif,
  overrideLu,
  versEtatJetons,
} from './jetons.js'
import { cabinetDeLApercu } from './revendeur.js'
import { chiffrer } from './secrets.js'

/*
 * La facturation cabinet par cabinet (0070) : le réglage du revendeur par
 * défaut, l'exception du contrat quand elle est posée — la même règle que
 * la base (`facturation_ia_du_cabinet`), éprouvée ici sans elle.
 */

describe('le mode effectif d’un cabinet', () => {
  it('sans exception, la règle d’avant : jetons activés ET clé posée', () => {
    expect(modeEffectif({ override: null, actif: true, clePosee: true })).toBe('jetons')
    expect(modeEffectif({ override: null, actif: true, clePosee: false })).toBe('cle_cabinet')
    expect(modeEffectif({ override: null, actif: false, clePosee: true })).toBe('cle_cabinet')
    expect(modeEffectif({ override: null, actif: false, clePosee: false })).toBe('cle_cabinet')
  })

  it('la clé du cabinet forcée l’emporte sur un revendeur en jetons', () => {
    expect(modeEffectif({ override: 'cle_cabinet', actif: true, clePosee: true })).toBe('cle_cabinet')
  })

  it('les jetons forcés valent sans activation — et restent des jetons sans clé, jamais un repli', () => {
    expect(modeEffectif({ override: 'jetons', actif: false, clePosee: true })).toBe('jetons')
    expect(modeEffectif({ override: 'jetons', actif: false, clePosee: false })).toBe('jetons')
  })

  it('une exception inconnue ne vaut rien', () => {
    expect(overrideLu('credits')).toBeNull()
    expect(overrideLu(undefined)).toBeNull()
    expect(overrideLu('jetons')).toBe('jetons')
    expect(modeEffectif({ override: 'credits', actif: true, clePosee: true })).toBe('jetons')
  })
})

/** Une base qui rend, table par table, la ligne qu'on lui donne. */
function base(lignes: {
  cabinet?: { reseller_id: string | null } | null
  contrat?: { facturation_ia_override: string | null } | null
  reglages?: { actif: boolean } | null
  secrets?: { anthropic_key_enc: string | null; stripe_secret_enc: string | null } | null
}): SupabaseClient {
  const parTable: Record<string, unknown> = {
    cabinets: lignes.cabinet ?? null,
    subscriptions: lignes.contrat ?? null,
    reseller_jetons: lignes.reglages ?? null,
    reseller_secrets: lignes.secrets ?? null,
  }
  return {
    from: vi.fn((table: string) => {
      const c: Record<string, unknown> = {}
      c.select = () => c
      c.eq = () => c
      c.maybeSingle = async () => ({ data: parTable[table] ?? null, error: null })
      return c
    }),
  } as unknown as SupabaseClient
}

describe('facturationDuCabinet — qui paie, cabinet par cabinet', () => {
  let cle: string
  beforeEach(() => {
    process.env.INTEGRATIONS_KEY = 'une-phrase-longue-et-secrete-pour-les-tests'
    cle = chiffrer('sk-ant-du-revendeur')
  })
  afterEach(() => {
    delete process.env.INTEGRATIONS_KEY
  })

  const revendeurEnJetons = () => ({
    cabinet: { reseller_id: 'rev-1' },
    reglages: { actif: true },
    secrets: { anthropic_key_enc: cle, stripe_secret_enc: null },
  })

  it('par défaut, le réglage du revendeur : ses jetons, avec sa clé', async () => {
    const f = await facturationDuCabinet('cab-1', base({ ...revendeurEnJetons(), contrat: { facturation_ia_override: null } }))
    expect(f).toEqual({ mode: 'jetons', resellerId: 'rev-1', cle: 'sk-ant-du-revendeur', bareme: BAREME_PAR_DEFAUT, paiement: false })
  })

  it('un cabinet gardé sur sa clé (BYOK) chez un revendeur en jetons', async () => {
    const f = await facturationDuCabinet(
      'cab-1',
      base({ ...revendeurEnJetons(), contrat: { facturation_ia_override: 'cle_cabinet' } }),
    )
    expect(f).toEqual({ mode: 'cle_cabinet' })
  })

  it('un cabinet passé en jetons avant les autres, jetons non activés', async () => {
    const f = await facturationDuCabinet(
      'cab-1',
      base({
        cabinet: { reseller_id: 'rev-1' },
        reglages: { actif: false },
        secrets: { anthropic_key_enc: cle, stripe_secret_enc: 'x' },
        contrat: { facturation_ia_override: 'jetons' },
      }),
    )
    expect(f.mode).toBe('jetons')
    expect(f.mode === 'jetons' && f.cle).toBe('sk-ant-du-revendeur')
    expect(f.mode === 'jetons' && f.paiement).toBe(true)
  })

  it('sans exception ni jetons activés, la clé du cabinet', async () => {
    const f = await facturationDuCabinet(
      'cab-1',
      base({ cabinet: { reseller_id: 'rev-1' }, reglages: { actif: false }, secrets: { anthropic_key_enc: cle, stripe_secret_enc: null } }),
    )
    expect(f).toEqual({ mode: 'cle_cabinet' })
  })

  it('des jetons forcés sans la clé du revendeur : un 503 en clair, pas la clé du cabinet', async () => {
    const tait = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const err = await facturationDuCabinet(
      'cab-1',
      base({
        cabinet: { reseller_id: 'rev-1' },
        reglages: { actif: false },
        secrets: { anthropic_key_enc: null, stripe_secret_enc: null },
        contrat: { facturation_ia_override: 'jetons' },
      }),
    ).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).status).toBe(503)
    expect((err as HttpError).message).toBe(REFUS_JETONS_SANS_CLE)
    // Le journal ne dit que des identifiants.
    expect(String(tait.mock.calls[0]?.[0] ?? '')).not.toContain('sk-ant')
    tait.mockRestore()
  })

  it('le refus dit quoi faire, en français, sans rien de technique', () => {
    expect(REFUS_JETONS_SANS_CLE).toContain('Prévenez-le')
    expect(REFUS_JETONS_SANS_CLE).toContain("rien n'a été produit, ni décompté")
    expect(REFUS_JETONS_SANS_CLE).not.toMatch(/override|503|BYOK/)
  })

  it('une panne de lecture du contrat ne vaut pas « clé du cabinet »', async () => {
    const tait = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const db = {
      from: vi.fn((table: string) => {
        const c: Record<string, unknown> = {}
        c.select = () => c
        c.eq = () => c
        c.maybeSingle = async () =>
          table === 'subscriptions'
            ? { data: null, error: { message: 'réseau coupé' } }
            : { data: { reseller_id: 'rev-1' }, error: null }
        return c
      }),
    } as unknown as SupabaseClient
    const err = await facturationDuCabinet('cab-1', db).catch((e: unknown) => e)
    expect((err as HttpError).status).toBe(503)
    tait.mockRestore()
  })
})

describe('ce que les écrans lisent du mode', () => {
  it('le cabinet : « pret » ne vaut qu’en jetons, et une base d’avant 0070 est prête', () => {
    expect(versEtatJetons({ mode: 'jetons', pret: false }).pret).toBe(false)
    expect(versEtatJetons({ mode: 'jetons', pret: true }).pret).toBe(true)
    expect(versEtatJetons({ mode: 'jetons' }).pret).toBe(true)
    expect(versEtatJetons({ mode: 'cle_cabinet', pret: true }).pret).toBe(false)
  })

  it('le revendeur : chaque cabinet dit son mode effectif et son exception', () => {
    expect(
      cabinetDeLApercu(
        { cabinet_id: 'c1', nom: 'A', consommes_mois: 3, solde: 9, mode_effectif: 'cle_cabinet', override: 'cle_cabinet' },
        'jetons',
      ),
    ).toEqual({ cabinetId: 'c1', nom: 'A', consommesMois: 3, solde: 9, modeEffectif: 'cle_cabinet', override: 'cle_cabinet' })
    expect(cabinetDeLApercu({ cabinet_id: 'c2', nom: 'B', mode_effectif: 'jetons', override: null }, 'cle_cabinet')).toMatchObject({
      modeEffectif: 'jetons',
      override: null,
    })
  })

  it('le revendeur, sur une base d’avant 0070 : le réglage du revendeur, et aucune exception', () => {
    expect(cabinetDeLApercu({ cabinet_id: 'c1', nom: 'A' }, 'jetons')).toMatchObject({ modeEffectif: 'jetons', override: null })
    expect(cabinetDeLApercu({ cabinet_id: 'c1', nom: 'A', override: 'credits' }, 'cle_cabinet')).toMatchObject({
      modeEffectif: 'cle_cabinet',
      override: null,
    })
  })
})
