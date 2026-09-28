import { afterEach, describe, expect, it } from 'vitest'
import { cronAutorise, ordreDePassage } from './affirmationsHebdo.js'

/**
 * La porte de la tâche du lundi.
 *
 * Derrière elle, un appel Anthropic par fiche, facturé au cabinet. Une adresse
 * publique qui déclenche une dépense ne se protège pas par l'obscurité de son
 * chemin : il faut le secret de l'hébergeur, et SON ABSENCE DOIT FERMER — un
 * serveur mal configuré ne doit pas se retrouver ouvert à qui devine l'URL.
 */
describe('cronAutorise', () => {
  const avant = process.env.CRON_SECRET
  afterEach(() => {
    if (avant === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = avant
  })

  it('refuse tout le monde quand aucun secret n’est configuré', () => {
    delete process.env.CRON_SECRET
    expect(cronAutorise(null)).toBe(false)
    expect(cronAutorise('Bearer ')).toBe(false)
    expect(cronAutorise('Bearer undefined')).toBe(false)
    expect(cronAutorise('')).toBe(false)
    process.env.CRON_SECRET = '   '
    expect(cronAutorise('Bearer    ')).toBe(false)
  })

  it('accepte le secret de l’hébergeur, avec ou sans « Bearer »', () => {
    process.env.CRON_SECRET = 's3cr3t-de-lundi'
    expect(cronAutorise('Bearer s3cr3t-de-lundi')).toBe(true)
    expect(cronAutorise('s3cr3t-de-lundi')).toBe(true)
    expect(cronAutorise('  Bearer s3cr3t-de-lundi  ')).toBe(true)
  })

  it('refuse un secret approchant', () => {
    process.env.CRON_SECRET = 's3cr3t-de-lundi'
    expect(cronAutorise('Bearer s3cr3t')).toBe(false)
    expect(cronAutorise('Bearer S3CR3T-DE-LUNDI')).toBe(false)
    expect(cronAutorise('Basic s3cr3t-de-lundi')).toBe(false)
    expect(cronAutorise(null)).toBe(false)
  })
})

/**
 * L'ordre du lundi.
 *
 * Le budget d'un passage ne couvre pas toujours toutes les fiches. Si l'ordre
 * ne dépend que de la base, les mêmes passent devant chaque semaine et les
 * dernières ne sont jamais servies : la fiche qui attend depuis le plus
 * longtemps doit passer la première.
 */
describe('ordreDePassage', () => {
  const lundi = Date.parse('2026-09-28T06:00:00Z')
  const limite = lundi - 4 * 86400_000
  const fiche = (id: string) => ({ id })

  it('sert d’abord la fiche qui n’a jamais eu de série, puis la plus ancienne', () => {
    const { aFaire, fraiches } = ordreDePassage(
      [fiche('b'), fiche('c'), fiche('a')],
      [
        { patient_id: 'b', published_at: '2026-09-21T06:00:12.345678+00:00' },
        { patient_id: 'c', published_at: '2026-09-14T06:00:00+00:00' },
      ],
      limite,
    )
    expect(aFaire.map((f) => f.id)).toEqual(['a', 'c', 'b'])
    expect(fraiches).toBe(0)
  })

  it('saute une série plus fraîche que la limite, et la compte', () => {
    const { aFaire, fraiches } = ordreDePassage(
      [fiche('a'), fiche('b')],
      [{ patient_id: 'a', published_at: '2026-09-27T18:00:00Z' }],
      limite,
    )
    expect(aFaire.map((f) => f.id)).toEqual(['b'])
    expect(fraiches).toBe(1)
  })

  /* La base rend ses dates en « +00:00 », le serveur calcule la limite en
     « Z » : une comparaison de textes se tromperait sur la frontière. */
  it('compare des instants, pas des textes', () => {
    const pile = new Date(limite).toISOString().replace('Z', '+00:00')
    const juste = new Date(limite - 1000).toISOString().replace('Z', '+00:00')
    const { aFaire } = ordreDePassage([fiche('pile'), fiche('juste')], [
      { patient_id: 'pile', published_at: pile },
      { patient_id: 'juste', published_at: juste },
    ], limite)
    expect(aFaire.map((f) => f.id)).toEqual(['juste'])
  })

  it('ignore une date illisible ou absente plutôt que de sauter la fiche', () => {
    const { aFaire, fraiches } = ordreDePassage(
      [fiche('a'), fiche('b')],
      [
        { patient_id: 'a', published_at: null },
        { patient_id: 'b', published_at: 'pas une date' },
      ],
      limite,
    )
    expect(aFaire.map((f) => f.id)).toEqual(['a', 'b'])
    expect(fraiches).toBe(0)
  })

  it('départage deux fiches de même date par leur identifiant, quel que soit l’ordre reçu', () => {
    const un = ordreDePassage([fiche('z'), fiche('m')], [], limite).aFaire.map((f) => f.id)
    const deux = ordreDePassage([fiche('m'), fiche('z')], [], limite).aFaire.map((f) => f.id)
    expect(un).toEqual(['m', 'z'])
    expect(deux).toEqual(un)
  })

  it('ne touche pas à la liste reçue', () => {
    const recues = [fiche('b'), fiche('a')]
    ordreDePassage(recues, [], limite)
    expect(recues.map((f) => f.id)).toEqual(['b', 'a'])
  })
})
