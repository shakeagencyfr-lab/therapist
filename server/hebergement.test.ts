import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')

interface ConfigVercel {
  regions?: string[]
  functions?: Record<string, { regions?: string[] }>
  crons?: Array<{ path: string; schedule: string }>
}

/* Le fichier tel que l'hébergeur le lira : c'est le texte déployé qu'on
   éprouve, pas une copie de ses valeurs. */
const config = JSON.parse(readFileSync(join(racine, 'vercel.json'), 'utf8')) as ConfigVercel

/**
 * PARIS, À CÔTÉ DE LA BASE.
 *
 * La base est à Paris (Supabase, eu-west-3). Sans clé `regions`, l'hébergeur
 * place les fonctions en Virginie (iad1) : chaque lecture d'une fonction
 * traversait l'Atlantique aller et retour, souvent plusieurs fois par appel,
 * et les dossiers lus par le serveur faisaient le voyage avec elle.
 * cdg1 est la région de Paris.
 *
 * UNE SEULE. L'offre gratuite n'accepte qu'une région pour les fonctions ;
 * en ajouter une seconde ferait échouer le déploiement — au moment de mettre
 * en ligne, pas avant.
 */
describe('la région des fonctions', () => {
  it('est Paris, et seulement Paris', () => {
    expect(config.regions).toEqual(['cdg1'])
  })

  it("n'est redéfinie par aucune fonction", () => {
    for (const [motif, reglage] of Object.entries(config.functions ?? {})) {
      expect(reglage.regions, `${motif} redéfinit sa région`).toBeUndefined()
    }
  })
})

/**
 * UNE FOIS PAR JOUR, AU PLUS.
 *
 * Sur l'offre gratuite, une tâche planifiée plus fréquente fait échouer le
 * déploiement. Une heure et une minute fixes garantissent au plus un passage
 * quotidien ; ce qui doit tourner plus souvent vit dans la base (pg_cron,
 * voir 0040 pour les rappels et 0044 pour les reprises du lundi).
 */
describe('les tâches planifiées de l’hébergeur', () => {
  it('ne tournent pas plus d’une fois par jour', () => {
    for (const { path, schedule } of config.crons ?? []) {
      const [minute, heure] = schedule.trim().split(/\s+/)
      expect(minute, `${path} (${schedule}) : minute non fixe`).toMatch(/^\d{1,2}$/)
      expect(heure, `${path} (${schedule}) : heure non fixe`).toMatch(/^\d{1,2}$/)
    }
  })
})
