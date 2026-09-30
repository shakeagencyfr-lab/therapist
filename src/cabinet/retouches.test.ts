import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Les gestes des retouches (0066), la base remplacée : ce qui part vers les
 * trois fonctions, et ce que l'écran lit de leurs refus.
 */
const m = vi.hoisted(() => ({
  rpc: vi.fn(async (): Promise<{ data: unknown; error: { message: string } | null }> => ({ data: null, error: null })),
  lignes: [] as Array<Record<string, unknown>>,
  erreurLecture: null as { message: string } | null,
  filtres: [] as unknown[][],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: () => ({
    rpc: m.rpc,
    from: () => {
      const chaine = {
        select: () => chaine,
        eq: (...args: unknown[]) => (m.filtres.push(args), chaine),
        order: async () => ({ data: m.erreurLecture ? null : m.lignes, error: m.erreurLecture }),
      }
      return chaine
    },
  }),
}))

const { gestesRetouches, messageRefusRetouche } = await import('./retouches')

describe('les gestes des retouches', () => {
  beforeEach(() => {
    m.rpc.mockClear()
    m.rpc.mockResolvedValue({ data: null, error: null })
    m.lignes = []
    m.erreurLecture = null
    m.filtres = []
  })

  it('un avis part pour ce cabinet, ce type, ce sens', async () => {
    const r = await gestesRetouches('cab-1').voter('synthese', 'bas')
    expect(r.ok).toBe(true)
    expect(m.rpc).toHaveBeenCalledWith('cabinet_voter_ia', { p_cabinet: 'cab-1', p_cible: 'synthese', p_vote: 'bas' })
  })

  it('sans cabinet — la démonstration —, rien ne part', async () => {
    expect((await gestesRetouches(null).voter('hypnose', 'haut')).ok).toBe(false)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('retenir : la consigne relue, sans ses blancs, JAMAIS coupée', async () => {
    const r = await gestesRetouches('cab-1').retenir('hypnose', '  Des pauses marquées  ')
    expect(r).toEqual({ ok: true, message: 'Préférence retenue pour les prochaines générations.' })
    expect(m.rpc).toHaveBeenCalledWith('cabinet_retenir_preference', {
      p_cabinet: 'cab-1',
      p_cible: 'hypnose',
      p_consigne: 'Des pauses marquées',
    })
    expect((await gestesRetouches('cab-1').retenir('hypnose', '   ')).ok).toBe(false)
    expect(m.rpc).toHaveBeenCalledTimes(1)
  })

  it('trop longue malgré la fenêtre : la base la refuse entière, et sa phrase se dit', async () => {
    const longue = 'Des phrases lentes. '.repeat(25) + 'Et surtout aucune image d’eau.'
    m.rpc.mockResolvedValue({ data: null, error: { message: 'Une préférence tient en 400 caractères au plus : raccourcissez-la.' } })
    const r = await gestesRetouches('cab-1').retenir('hypnose', longue)
    // Partie entière, la fin comprise : c'est la base qui dit non, pas l'écran qui coupe.
    expect(m.rpc).toHaveBeenCalledWith('cabinet_retenir_preference', { p_cabinet: 'cab-1', p_cible: 'hypnose', p_consigne: longue })
    expect(r).toEqual({
      ok: false,
      message: 'Une préférence tient en 400 caractères au plus : raccourcissez-la. La retouche, elle, est faite.',
    })
  })

  it('le nom du patient : rien ne part', async () => {
    const r = await gestesRetouches('cab-1').retenir('hypnose', 'Reprendre le jardin de Marie', 'Marie Dupont')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('« Marie »')
    expect(r.message).toContain('La retouche, elle, est faite.')
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('un refus de retenir ne dit pas que la retouche a échoué', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    const r = await gestesRetouches('cab-1').retenir('message', 'Plus chaleureux')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('La retouche, elle, est faite.')
  })

  it('lire : les actives du cabinet, sans un type que l’écran ne connaît pas', async () => {
    m.lignes = [
      { id: 'p1', cible: 'hypnose', consigne: 'Des pauses', cree_le: '2026-09-30T09:00:00Z' },
      { id: 'p2', cible: 'inconnu', consigne: '?', cree_le: '2026-09-30T09:00:00Z' },
    ]
    expect(await gestesRetouches('cab-1').lire()).toEqual([
      { id: 'p1', cible: 'hypnose', consigne: 'Des pauses', creeLe: '2026-09-30T09:00:00Z' },
    ])
    expect(m.filtres).toEqual([
      ['cabinet_id', 'cab-1'],
      ['actif', true],
    ])
  })

  it('une lecture en échec n’est pas « aucune préférence » ; une base sans 0066 le dit', async () => {
    m.erreurLecture = { message: 'timeout' }
    expect(await gestesRetouches('cab-1').lire()).toBeNull()
    m.erreurLecture = { message: 'relation "public.preferences_ia" does not exist' }
    expect(await gestesRetouches('cab-1').lire()).toBe('indisponible')
  })

  it('oublier passe par la fonction de la base', async () => {
    const r = await gestesRetouches('cab-1').oublier('p1')
    expect(r.ok).toBe(true)
    expect(m.rpc).toHaveBeenCalledWith('cabinet_oublier_preference', { p_id: 'p1' })
  })
})

describe('messageRefusRetouche — ce que l’écran dit d’un refus', () => {
  it('garde les phrases de la base, remplace le jargon', () => {
    expect(messageRefusRetouche('Une préférence tient en 400 caractères au plus : raccourcissez-la.', 'repli')).toBe(
      'Une préférence tient en 400 caractères au plus : raccourcissez-la.',
    )
    expect(messageRefusRetouche('duplicate key value violates unique constraint', 'repli')).toBe('repli')
    expect(messageRefusRetouche('function public.cabinet_voter_ia does not exist', 'repli')).toMatch(/pas encore disponibles/)
    expect(messageRefusRetouche(undefined, 'repli')).toBe('repli')
  })
})
