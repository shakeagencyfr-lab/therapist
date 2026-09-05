import { afterEach, describe, expect, it } from 'vitest'
import { cronAutorise } from './affirmationsHebdo.js'

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
