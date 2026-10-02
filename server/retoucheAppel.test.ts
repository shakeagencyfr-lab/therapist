import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from './errors.js'

/*
 * La retouche (0066) de bout en bout, sans réseau : la base, les droits, la
 * clé et le service d'analyse sont remplacés ; l'ordre des gestes, les refus,
 * le choix du modèle, la demande envoyée et la consommation inscrite sont le
 * vrai code de server/ai.ts.
 */
const m = vi.hoisted(() => ({
  base: null as unknown,
  abonnementEnRegle: vi.fn(async () => true),
  hypnoseOuverte: vi.fn(async () => true),
  facturationDuCabinet: vi.fn(),
  reserver: vi.fn(async () => ({ consommation: 'conso-1', jetons: 8, compris: false })),
  confirmer: vi.fn(async () => undefined),
  rembourser: vi.fn(async () => undefined),
  soldeDuCabinet: vi.fn(async () => 40),
  cleAnthropicDuCabinet: vi.fn(async () => 'sk-ant-du-cabinet'),
  parse: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', async (original) => {
  const mod = await original<typeof import('@anthropic-ai/sdk')>()
  // Le vrai client, erreurs comprises ; seule la demande au service est remplacée.
  class ClientEprouve extends mod.default {
    constructor(options: ConstructorParameters<typeof mod.default>[0]) {
      super(options)
      Object.defineProperty(this, 'messages', { value: { parse: m.parse } })
    }
  }
  return { ...mod, default: ClientEprouve }
})
vi.mock('./auth.js', async (original) => ({
  ...(await original<typeof import('./auth.js')>()),
  clientAdmin: () => m.base,
}))
vi.mock('./droits.js', async (original) => ({
  ...(await original<typeof import('./droits.js')>()),
  abonnementEnRegle: m.abonnementEnRegle,
  hypnoseOuverte: m.hypnoseOuverte,
}))
vi.mock('./jetons.js', async (original) => ({
  ...(await original<typeof import('./jetons.js')>()),
  facturationDuCabinet: m.facturationDuCabinet,
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
const { BAREME_PAR_DEFAUT } = await import('./jetons.js')
const { AFFIRMATIONS_SYSTEM, HYPNOSE_SYSTEM, REGLES_DE_RETOUCHE } = await import('./prompts.js')

/** Une base qui rend des préférences et note ce qu'on lui demande. */
function fausseBase(lignes: Array<{ cible: string; consigne: string }>, panne = '') {
  const lectures: Array<Record<string, unknown>> = []
  const inscrits: Array<Record<string, unknown>> = []
  const db = {
    from(table: string) {
      if (table === 'ai_usage') {
        return {
          insert: async (ligne: Record<string, unknown>) => {
            inscrits.push(ligne)
            return { error: null }
          },
        }
      }
      const lecture: Record<string, unknown> = { table }
      const chaine = {
        select: (colonnes: string) => ((lecture.select = colonnes), chaine),
        eq: (cle: string, valeur: unknown) => ((lecture[cle] = valeur), chaine),
        in: (cle: string, valeurs: unknown) => ((lecture[`${cle} parmi`] = valeurs), chaine),
        order: (cle: string, sens: unknown) => ((lecture.ordre = [cle, sens]), chaine),
        limit: async (n: number) => {
          lecture.limite = n
          lectures.push(lecture)
          if (panne) return { data: null, error: { message: panne } }
          // Comme la base : ce type-là, les n premières (la liste est donnée la plus récente d'abord).
          const du = lecture.cible === undefined ? lignes : lignes.filter((l) => l.cible === lecture.cible)
          return { data: du.slice(0, n), error: null }
        },
      }
      return chaine
    },
  }
  return { db, lectures, inscrits }
}

/** Ce que le service d'analyse rend, en réponse structurée. */
function reponse(donnees: unknown) {
  return { stop_reason: 'end_turn', parsed_output: donnees, usage: { input_tokens: 1200, output_tokens: 800 } }
}

/** La demande envoyée au service, telle que le client l'a reçue. */
function demande(): { model: string; max_tokens: number; system: string; messages: Array<{ content: string }>; output_config: Record<string, unknown> } {
  expect(m.parse).toHaveBeenCalledTimes(1)
  return m.parse.mock.calls[0]![0]
}

async function refus(promesse: Promise<unknown>): Promise<HttpError> {
  try {
    await promesse
  } catch (err) {
    return err as HttpError
  }
  throw new Error('la promesse devait échouer')
}

const DOSSIER = {
  name: 'Camille Laurent',
  program: 'Programme Liberté',
  weekLabel: '3 séances sur 6',
  profile: { updated: '', portrait: 'Avance par petites victoires.', axes: [], levers: [], care: [] },
}

const RETOUR = {
  probleme: "Le rythme de l'induction est trop rapide",
  attendu: 'Des phrases plus longues, plus lentes, avec davantage de pauses',
}

const MOUVEMENT = {
  cible: 'hypnose',
  ...RETOUR,
  context: DOSSIER,
  actuel: { titre: 'Le poids du siège', texte: 'Installez-vous confortablement…' },
  extra: { mouvement: 'induction', autres: [{ mouvement: 'approfondissement', texte: "L'escalier de pierre…" }] },
  hypnoseId: '6f1c1f0e-1f0e-4c1f-9f0e-1f0e6f1c1f0e',
}

let base: ReturnType<typeof fausseBase>

describe('la retouche, de la demande à la consommation', () => {
  beforeEach(() => {
    for (const f of [m.abonnementEnRegle, m.hypnoseOuverte, m.facturationDuCabinet, m.reserver, m.confirmer, m.rembourser, m.soldeDuCabinet, m.cleAnthropicDuCabinet, m.parse]) {
      f.mockClear()
    }
    base = fausseBase([
      { cible: 'hypnose', consigne: 'Des pauses marquées entre les phrases' },
      { cible: 'hypnose', consigne: 'Jamais de métaphore marine' },
    ])
    m.base = base.db
    m.hypnoseOuverte.mockResolvedValue(true)
    m.facturationDuCabinet.mockResolvedValue({ mode: 'cle_cabinet' })
    m.parse.mockResolvedValue(reponse({ titre: 'Le poids du siège', texte: 'Installez-vous… lentement.' }))
  })

  afterEach(() => {
    delete process.env.AI_MOCK
  })

  it('refuse la retouche d’un mouvement hors de l’option Hypnose, avant toute dépense', async () => {
    m.hypnoseOuverte.mockResolvedValue(false)
    const err = await refus(analyserPourCabinet('revision', MOUVEMENT, 'cab-1'))
    expect(err.status).toBe(403)
    expect(err.message).toBe(REFUS_HYPNOSE)
    expect(m.facturationDuCabinet).not.toHaveBeenCalled()
    expect(m.parse).not.toHaveBeenCalled()
  })

  it('ne demande pas l’option pour retoucher autre chose qu’un mouvement', async () => {
    m.parse.mockResolvedValue(reponse({ texte: 'Une synthèse retouchée.' }))
    await analyserPourCabinet('revision', { cible: 'synthese', ...RETOUR, actuel: 'Une synthèse.' }, 'cab-1')
    expect(m.hypnoseOuverte).not.toHaveBeenCalled()
  })

  it('un mouvement : Opus, son effort et son plafond, ses règles, et les préférences à la fin de la demande', async () => {
    const r = await analyserPourCabinet('revision', MOUVEMENT, 'cab-1')
    expect(r).toEqual({ mock: false, data: { titre: 'Le poids du siège', texte: 'Installez-vous… lentement.' } })

    const envoi = demande()
    expect(envoi.model).toBe('claude-opus-5-5')
    expect(envoi.max_tokens).toBe(7000)
    expect(envoi.output_config.effort).toBe('medium')
    expect(envoi.system.startsWith(HYPNOSE_SYSTEM)).toBe(true)
    expect(envoi.system.endsWith(REGLES_DE_RETOUCHE)).toBe(true)

    const message = envoi.messages[0]!.content
    expect(message).toContain('<ce_que_l_ia_a_mal_fait>\n' + RETOUR.probleme)
    expect(message).toContain("--- APPROFONDISSEMENT ---\nL'escalier de pierre…")
    expect(
      message.endsWith(
        '<preferences_de_la_praticienne>\n— [Mouvements d\'hypnose] Des pauses marquées entre les phrases\n— [Mouvements d\'hypnose] Jamais de métaphore marine\n</preferences_de_la_praticienne>',
      ),
    ).toBe(true)
    // Jamais dans les règles du système.
    expect(envoi.system).not.toContain('Des pauses marquées')

    // Les préférences lues : ce cabinet, ce type, actives, dix au plus, les plus récentes d'abord.
    expect(base.lectures).toEqual([
      {
        table: 'preferences_ia',
        select: 'cible, consigne',
        cabinet_id: 'cab-1',
        actif: true,
        cible: 'hypnose',
        ordre: ['cree_le', { ascending: false }],
        limite: 10,
      },
    ])
    // La consommation, sous son genre et sans rien d'autre.
    expect(base.inscrits).toEqual([
      expect.objectContaining({ cabinet_id: 'cab-1', kind: 'revision', model: 'claude-opus-5-5', input_tokens: 1200, output_tokens: 800 }),
    ])
  })

  it('des affirmations : Haiku, sans effort, et comptées au prix de Haiku', async () => {
    m.parse.mockResolvedValue(reponse({ affirmations: ['Je respire calmement.'] }))
    await analyserPourCabinet(
      'revision',
      { cible: 'affirmations', ...RETOUR, context: DOSSIER, actuel: ['Je respire.', 'Je suis là.'] },
      'cab-1',
    )
    const envoi = demande()
    expect(envoi.model).toBe('claude-haiku-4-5')
    expect(envoi.output_config).not.toHaveProperty('effort')
    expect(envoi.max_tokens).toBe(3000)
    expect(envoi.system.startsWith(AFFIRMATIONS_SYSTEM)).toBe(true)
    expect(base.inscrits[0]).toMatchObject({ kind: 'revision', model: 'claude-haiku-4-5' })
    expect(base.lectures).toEqual([expect.objectContaining({ cible: 'affirmations', limite: 10 })])
  })

  it('une écriture ordinaire relit aussi les préférences de ses textes', async () => {
    m.parse.mockResolvedValue(reponse({ synthese: 's', mots: [], themes: [], propositions: [], questions: [], vigilance: [], categories_audio: [], message: 'm' }))
    base = fausseBase([{ cible: 'synthese', consigne: 'Des faits, avec ses mots' }])
    m.base = base.db
    await analyserPourCabinet(
      'session-draft',
      { context: DOSSIER, notes: 'La séance a porté sur le délai avant le geste, et sur la porte qui se referme le soir.', categories: ['Détente'] },
      'cab-1',
    )
    // Une lecture par type, dix chacune, pour ce cabinet seulement.
    expect(base.lectures.map((l) => [l.cible, l.limite, l.cabinet_id, l.actif])).toEqual([
      ['synthese', 10, 'cab-1', true],
      ['message', 10, 'cab-1', true],
      ['proposition', 10, 'cab-1', true],
    ])
    const envoi = demande()
    expect(envoi.messages[0]!.content.endsWith('— [Synthèses de séance] Des faits, avec ses mots\n</preferences_de_la_praticienne>')).toBe(true)
    expect(envoi.system).not.toContain('Des faits, avec ses mots')
  })

  it('dix messages retenus récemment ne chassent pas les synthèses', async () => {
    m.parse.mockResolvedValue(reponse({ synthese: 's', mots: [], themes: [], propositions: [], questions: [], vigilance: [], categories_audio: [], message: 'm' }))
    // La plus récente d'abord : douze messages, puis trois synthèses plus anciennes.
    base = fausseBase([
      ...Array.from({ length: 12 }, (_, i) => ({ cible: 'message', consigne: `Message n° ${i}` })),
      ...Array.from({ length: 3 }, (_, i) => ({ cible: 'synthese', consigne: `Synthèse n° ${i}` })),
    ])
    m.base = base.db
    await analyserPourCabinet(
      'session-draft',
      { context: DOSSIER, notes: 'La séance a porté sur le délai avant le geste, et sur la porte qui se referme le soir.', categories: ['Détente'] },
      'cab-1',
    )
    const message = demande().messages[0]!.content
    const bloc = message.slice(message.indexOf('<preferences_de_la_praticienne>'))
    for (let i = 0; i < 3; i++) expect(bloc).toContain(`— [Synthèses de séance] Synthèse n° ${i}`)
    expect(bloc.match(/— \[Messages au patient\]/g)).toHaveLength(10)
    expect(bloc).not.toContain('Message n° 10')
    expect(bloc.match(/<\/preferences_de_la_praticienne>/g)).toHaveLength(1)
  })

  it('une lecture des préférences en panne n’empêche pas d’écrire', async () => {
    base = fausseBase([], 'relation "preferences_ia" does not exist')
    m.base = base.db
    await analyserPourCabinet('revision', MOUVEMENT, 'cab-1')
    expect(demande().messages[0]!.content).not.toContain('<preferences_de_la_praticienne>')
  })

  it('un corps refusé ne lit rien et n’appelle rien', async () => {
    const err = await refus(analyserPourCabinet('revision', { ...MOUVEMENT, attendu: '' }, 'cab-1'))
    expect(err.status).toBe(400)
    expect(base.lectures).toEqual([])
    expect(m.parse).not.toHaveBeenCalled()
  })

  it('en maquette : une retouche marquée, sans modèle ni préférences', async () => {
    process.env.AI_MOCK = '1'
    const r = await analyserPourCabinet('revision', { cible: 'message', ...RETOUR, actuel: 'Bonjour Camille.' }, 'cab-1')
    expect(r.mock).toBe(true)
    expect((r.data as { texte: string }).texte).toContain('Retouche de maquette')
    expect(m.parse).not.toHaveBeenCalled()
    expect(base.lectures).toEqual([])
  })

  describe('en jetons', () => {
    beforeEach(() => {
      m.facturationDuCabinet.mockResolvedValue({ mode: 'jetons', resellerId: 'r1', cle: 'sk-ant-du-revendeur', bareme: BAREME_PAR_DEFAUT, paiement: true })
    })

    it('un mouvement se paie au prix d’une retouche d’hypnose, et le solde suit', async () => {
      const r = await analyserPourCabinet('revision', MOUVEMENT, 'cab-1')
      expect(m.reserver).toHaveBeenCalledWith('cab-1', { action: 'retouche_hypnose', prix: 8, ref: null, regle: 'prix', mouvement: null }, expect.anything(), expect.anything())
      expect(m.confirmer).toHaveBeenCalledTimes(1)
      expect(r.jetons).toEqual({ utilises: 8, solde: 40 })
    })

    it('tout autre texte au prix d’une retouche', async () => {
      m.parse.mockResolvedValue(reponse({ texte: 'Bonjour Camille, merci.' }))
      await analyserPourCabinet('revision', { cible: 'message', ...RETOUR, actuel: 'Bonjour Camille.' }, 'cab-1')
      expect(m.reserver).toHaveBeenCalledWith('cab-1', { action: 'retouche', prix: 2, ref: null, regle: 'prix', mouvement: null }, expect.anything(), expect.anything())
    })

    it('une retouche qui échoue rend ses jetons', async () => {
      const err = await refus(analyserPourCabinet('revision', { ...MOUVEMENT, extra: { mouvement: 'reveil' } }, 'cab-1'))
      expect(err.status).toBe(400)
      expect(m.rembourser).toHaveBeenCalledWith('conso-1', expect.anything())
      expect(m.confirmer).not.toHaveBeenCalled()
    })
  })
})

/*
 * Le cache du contexte répété (2 octobre 2026), de la demande au compteur :
 * les consignes d'une séance et les mouvements d'une hypnose posent un point
 * de cache sur leur début ; un module de l'atelier, seul, n'en pose pas ; et
 * la consommation inscrite compte l'écriture et la relecture du cache.
 */
describe('le cache du contexte répété, de la demande au compteur', () => {
  const SEANCE = '7a2b3c4d-1e2f-4a3b-8c4d-5e6f7a8b9c0d'

  beforeEach(() => {
    m.parse.mockClear()
    base = fausseBase([])
    m.base = base.db
    m.hypnoseOuverte.mockResolvedValue(true)
    m.facturationDuCabinet.mockResolvedValue({ mode: 'cle_cabinet' })
  })

  const contenu = () => (m.parse.mock.calls[0]![0] as { messages: Array<{ content: unknown }> }).messages[0]!.content

  it('les consignes d’une séance : le dossier en premier bloc, avec le point de cache', async () => {
    m.parse.mockResolvedValue(
      reponse({ titre: 'Ancrage', duree: '3 minutes', quand: 'Au réveil', steps: ['a', 'b', 'c', 'd'], pourquoi: 'Parce que.', quiz: [] }),
    )
    await analyserPourCabinet(
      'module',
      { intent: 'Ancrage du souffle après un appel', type: 'Exercice', quiz: false, context: DOSSIER, sessionId: SEANCE },
      'cab-1',
    )
    const blocs = contenu() as Array<{ text: string; cache_control?: unknown }>
    expect(Array.isArray(blocs)).toBe(true)
    expect(blocs[0]!.text).toContain('Camille Laurent')
    expect(blocs[0]!.cache_control).toEqual({ type: 'ephemeral' })
    expect(blocs.at(-1)!.text).toContain('Ancrage du souffle après un appel')
    expect(blocs.at(-1)!.cache_control).toBeUndefined()
  })

  it('un module de l’atelier, seul : une demande d’une pièce, sans écriture de cache à payer', async () => {
    m.parse.mockResolvedValue(
      reponse({ titre: 'Ancrage', duree: '3 minutes', quand: 'Au réveil', steps: ['a', 'b', 'c', 'd'], pourquoi: 'Parce que.', quiz: [] }),
    )
    await analyserPourCabinet('module', { intent: 'Ancrage du souffle après un appel', type: 'Exercice', context: DOSSIER }, 'cab-1')
    expect(typeof contenu()).toBe('string')
  })

  it('un mouvement d’hypnose : le dossier et les mouvements déjà écrits en tête, le point sur le dernier', async () => {
    m.parse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { titre: 'Le large', texte: 'Plus loin, plus profond.' },
      usage: { input_tokens: 300, output_tokens: 1500, cache_creation_input_tokens: 1400, cache_read_input_tokens: 2600 },
    })
    await analyserPourCabinet(
      'hypnose',
      {
        mouvement: 'approfondissement',
        context: DOSSIER,
        intention: 'Retrouver un sommeil profond',
        precedents: [{ mouvement: 'induction', texte: 'Installez-vous confortablement.' }],
      },
      'cab-1',
    )
    const blocs = contenu() as Array<{ text: string; cache_control?: unknown }>
    expect(blocs).toHaveLength(3)
    expect(blocs[1]!.text).toContain('Installez-vous confortablement.')
    expect(blocs.map((b) => Boolean(b.cache_control))).toEqual([false, true, false])
    // Le compteur inscrit le cache, et le prix le compte : 300 × 4 + 1 400 × 5 + 2 600 × 0,20 + 1 500 × 20, au million.
    const ligne = base.inscrits[0]!
    expect(ligne).toMatchObject({ input_tokens: 300, output_tokens: 1500, cache_write_tokens: 1400, cache_read_tokens: 2600 })
    expect(ligne.cost_cents as number).toBeCloseTo(((300 * 4 + 1400 * 5 + 2600 * 0.2 + 1500 * 20) / 1_000_000) * 100, 6)
  })
})
