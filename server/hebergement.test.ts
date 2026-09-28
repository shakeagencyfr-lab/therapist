import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')

interface ConfigVercel {
  regions?: string[]
  functions?: Record<string, { regions?: string[] }>
  crons?: Array<{ path: string; schedule: string }>
  rewrites?: Array<{ source: string; destination: string }>
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
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

/* ------------------------------------------------------------------ *
 * En-têtes
 * ------------------------------------------------------------------ */

/**
 * Un motif `source` de vercel.json, en expression régulière.
 *
 * Le sous-ensemble de path-to-regexp que ce fichier emploie : texte littéral,
 * `\\.` échappé, `:nom`, `:nom(motif)` et `(motif)`, sans barre finale
 * facultative (l'hébergeur les compile en mode strict). Un motif hors de ce
 * sous-ensemble fait échouer l'épreuve plutôt que de passer pour vrai.
 */
function motif(source: string): RegExp {
  const echapper = (c: string) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  const groupe = (debut: number): [string, number] => {
    let profondeur = 0
    for (let i = debut; i < source.length; i++) {
      if (source[i] === '\\') i++
      else if (source[i] === '(') profondeur++
      else if (source[i] === ')' && --profondeur === 0) return [source.slice(debut + 1, i), i + 1]
    }
    throw new Error(`parenthèse non refermée dans ${source}`)
  }
  let re = ''
  let i = 0
  while (i < source.length) {
    const c = source[i] as string
    if (c === '\\') {
      re += echapper(source[i + 1] ?? '')
      i += 2
    } else if (c === ':') {
      const nom = /^\w+/.exec(source.slice(i + 1))?.[0] ?? ''
      i += 1 + nom.length
      if (source[i] === '(') {
        const [g, fin] = groupe(i)
        re += `(${g})`
        i = fin
      } else re += '([^\\/#?]+?)'
    } else if (c === '(') {
      const [g, fin] = groupe(i)
      re += `(${g})`
      i = fin
    } else if ('*+?'.includes(c)) {
      throw new Error(`motif non pris en charge par l'épreuve : ${source}`)
    } else {
      re += echapper(c)
      i++
    }
  }
  return new RegExp(`^${re}$`)
}

/** Les en-têtes qu'un chemin reçoit : chaque règle qui le couvre, la dernière l'emportant. */
function entetes(chemin: string): Record<string, string> {
  const h: Record<string, string> = {}
  for (const regle of config.headers ?? []) {
    if (motif(regle.source).test(chemin)) for (const { key, value } of regle.headers) h[key.toLowerCase()] = value
  }
  return h
}

/** Une politique CSP, directive par directive. */
function politique(valeur: string | undefined): Map<string, string[]> {
  const p = new Map<string, string[]>()
  for (const morceau of (valeur ?? '').split(';')) {
    const [nom, ...sources] = morceau.trim().split(/\s+/)
    if (nom) p.set(nom, sources)
  }
  return p
}

/** Un chemin d'exemple pour chaque réécriture vers une page. */
const PAGES = [
  '/',
  '/index.html',
  '/patient.html',
  ...(config.rewrites ?? [])
    .filter((r) => r.destination.endsWith('.html') && !r.destination.includes('embed'))
    .map((r) => r.source.replace(/:\w+(\([^)]*\))?/g, 'un-cabinet')),
]
const WIDGET = ['/e/un-cabinet', '/e/un-cabinet/', '/embed.html']
const PARTOUT = [...PAGES, ...WIDGET, '/api/cabinet', '/assets/main-abc123.js', '/sw.js', '/fonts/base.css']

/* Le projet de la base, tel que supabase/README.md le nomme : la politique
   doit viser CE projet — et le jour où il change, cette épreuve le dit. */
const PROJET = /`([a-z]{20})`/.exec(readFileSync(join(racine, 'supabase', 'README.md'), 'utf8'))?.[1]
const BASE = `https://${PROJET}.supabase.co`
const HCAPTCHA = ['https://hcaptcha.com', 'https://*.hcaptcha.com']

describe('le motif des règles de vercel.json', () => {
  it('reconnaît ce que reconnaît l’hébergeur', () => {
    expect(motif('/:slug([a-z0-9][a-z0-9-]*)').test('/sebastien-tedeschi')).toBe(true)
    expect(motif('/:slug([a-z0-9][a-z0-9-]*)').test('/sebastien-tedeschi/')).toBe(false)
    expect(motif('/:slug([a-z0-9][a-z0-9-]*)').test('/index.html')).toBe(false)
    expect(motif('/e/:slug').test('/e/cabinet')).toBe(true)
    expect(motif('/fonts/(.*)\\.woff2').test('/fonts/inter-cf3eb50fb2.woff2')).toBe(true)
    expect(motif('/fonts/(.*)\\.woff2').test('/fonts/base.css')).toBe(false)
    expect(motif('/(.*)').test('/api/cabinet')).toBe(true)
  })
})

/**
 * LA DÉFENSE EN PROFONDEUR, SUR TOUTE RÉPONSE.
 *
 * Une application qui porte des données de santé n'avait, au-delà du refus
 * d'encadrement, aucune défense contre un script injecté ni contre le
 * reniflage de type. Ces en-têtes ne changent rien pour qui s'en sert.
 *
 * - nosniff : un fichier servi comme texte n'est jamais exécuté comme script.
 * - Referrer-Policy : une page d'un cabinet ne dit à un tiers que l'origine
 *   d'où l'on vient, jamais le chemin (/son-cabinet/mon).
 * - Permissions-Policy : le micro pour la dictée, sur nos pages seulement ;
 *   ni caméra, ni position, ni paiement — le paiement passe par la page de
 *   Stripe, hors de chez nous.
 */
describe('les en-têtes de sécurité', () => {
  it('accompagnent toute réponse, page, fonction ou fichier', () => {
    for (const chemin of PARTOUT) {
      const h = entetes(chemin)
      expect(h['x-content-type-options'], chemin).toBe('nosniff')
      expect(h['referrer-policy'], chemin).toBe('strict-origin-when-cross-origin')
      const permis = (h['permissions-policy'] ?? '').split(',').map((s) => s.trim())
      expect(permis, chemin).toEqual(expect.arrayContaining(['microphone=(self)', 'camera=()', 'geolocation=()', 'payment=()']))
    }
  })
})

/**
 * LA POLITIQUE DE CONTENU, EN DEUX TEMPS.
 *
 * APPLIQUÉE (`Content-Security-Policy`) : ce qui ne peut rien casser et
 * ferme le plus gros — aucun script d'ailleurs que de chez nous et de
 * hCaptcha (la porte d'entrée), aucun `eval`, aucun plugin, aucune balise
 * <base> détournée, aucun formulaire posté ailleurs. Les scripts du build
 * sont tous des fichiers : le build ne produit aucun script en ligne.
 *
 * OBSERVÉE (`Content-Security-Policy-Report-Only`) : la politique complète,
 * `default-src 'self'` et ce que les pages chargent vraiment — la base
 * (lectures, logos, photos, audios signés), hCaptcha, l'agenda tiers encadré
 * dans l'espace patient (n'importe quel agenda en https, le cabinet le
 * choisit), les audios en blob: de l'atelier. Éprouvée sans une violation
 * sur la porte, la vitrine, la porte patient, le widget et un espace patient
 * ouvert (audio, agenda, rappels) ; l'espace cabinet, lui, ne s'éprouve
 * qu'avec une session réelle. Elle signale sans bloquer : c'est elle qui
 * deviendra la politique appliquée, une fois l'espace cabinet vu sans
 * signalement.
 */
describe('la politique de contenu appliquée', () => {
  it('ne laisse passer aucun script étranger, sur aucune page', () => {
    for (const chemin of [...PAGES, ...WIDGET]) {
      const p = politique(entetes(chemin)['content-security-policy'])
      expect(p.get('script-src'), chemin).toEqual(["'self'", ...HCAPTCHA])
      expect(p.get('object-src'), chemin).toEqual(["'none'"])
      expect(p.get('base-uri'), chemin).toEqual(["'self'"])
      expect(p.get('form-action'), chemin).toEqual(["'self'"])
    }
  })

  /* Tout refuse l'encadrement, sauf le widget, que les cabinets posent sur
     leur propre site. */
  it("refuse l'encadrement partout sauf au widget", () => {
    for (const chemin of PAGES) {
      const h = entetes(chemin)
      expect(politique(h['content-security-policy']).get('frame-ancestors'), chemin).toEqual(["'self'"])
      expect(h['x-frame-options'], chemin).toBe('SAMEORIGIN')
    }
    for (const chemin of WIDGET) {
      const h = entetes(chemin)
      expect(politique(h['content-security-policy']).has('frame-ancestors'), chemin).toBe(false)
      expect(h['x-frame-options'], chemin).toBeUndefined()
    }
  })

  it('se lit pareil sur chaque page, au refus d’encadrement près', () => {
    const sans = (v: string | undefined) => (v ?? '').replace(/;\s*frame-ancestors [^;]*/, '')
    const reference = sans(entetes('/e/un-cabinet')['content-security-policy'])
    for (const chemin of PAGES) expect(sans(entetes(chemin)['content-security-policy']), chemin).toBe(reference)
  })
})

describe('la politique de contenu observée', () => {
  const observee = politique(entetes('/')['content-security-policy-report-only'])

  it('vise le projet de la base, et lui seul', () => {
    expect(PROJET).toBeTruthy()
    expect(observee.get('connect-src')).toEqual(["'self'", BASE, ...HCAPTCHA])
    expect(observee.get('img-src')).toEqual(["'self'", 'data:', BASE])
    expect(observee.get('media-src')).toEqual(["'self'", 'blob:', BASE])
  })

  it('part de « rien d’ailleurs » et n’ouvre que ce qui sert', () => {
    expect(observee.get('default-src')).toEqual(["'self'"])
    expect(observee.get('font-src')).toEqual(["'self'"])
    // L'agenda tiers encadré dans l'espace patient : le cabinet choisit le sien.
    expect(observee.get('frame-src')).toEqual(["'self'", 'https:'])
    const tout = [...observee.values()].flat()
    expect(tout).not.toContain("'unsafe-eval'")
    expect(tout).not.toContain('*')
  })

  /* La promouvoir ne doit rien changer aux scripts : ce sont les mêmes. */
  it('laisse passer les mêmes scripts que la politique appliquée', () => {
    const appliquee = politique(entetes('/')['content-security-policy'])
    expect(observee.get('script-src')).toEqual(appliquee.get('script-src'))
  })

  it('accompagne chaque page et le widget', () => {
    for (const chemin of [...PAGES, ...WIDGET]) {
      expect(entetes(chemin)['content-security-policy-report-only'], chemin).toBe(
        entetes('/')['content-security-policy-report-only'],
      )
    }
  })
})

/**
 * « IMMUTABLE » SEULEMENT POUR UN NOM QUI PORTE SON EMPREINTE.
 *
 * Les .woff2 changent de nom quand leur contenu change (scripts/
 * telecharger-polices.mjs y met une empreinte) : on peut les garder un an.
 * base.css et vitrine.css, non — la règle `/fonts/(.*)` les gardait pourtant
 * un an aussi, et la prochaine police ajoutée n'aurait atteint les visiteurs
 * déjà venus qu'au bout de ce délai.
 */
describe('le cache des polices', () => {
  const fichiers = readdirSync(join(racine, 'public', 'fonts'))

  it('ne fige que les fichiers dont le nom change avec le contenu', () => {
    for (const nom of fichiers) {
      const cache = entetes(`/fonts/${nom}`)['cache-control'] ?? ''
      if (cache.includes('immutable')) expect(nom).toMatch(/-[0-9a-f]{10}\.woff2$/)
    }
  })

  it('fait revalider les feuilles à chaque visite', () => {
    for (const nom of fichiers.filter((n) => n.endsWith('.css'))) {
      expect(entetes(`/fonts/${nom}`)['cache-control'], nom).toBe('no-cache')
    }
  })

  it('garde un an les polices elles-mêmes', () => {
    const polices = fichiers.filter((n) => n.endsWith('.woff2'))
    expect(polices.length).toBeGreaterThan(0)
    for (const nom of polices) expect(entetes(`/fonts/${nom}`)['cache-control'], nom).toContain('immutable')
  })
})
