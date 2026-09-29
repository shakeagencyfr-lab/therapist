/**
 * Ce que le serveur va chercher ailleurs, sans jamais viser l'intérieur.
 *
 * Trois gestes font sortir le serveur vers une adresse qu'il ne choisit pas :
 * le sondage de l'agenda collé par la thérapeute (agenda.ts), la recopie des
 * photos d'une fiche Google (sites.ts), le serveur d'envoi du cabinet
 * (courriel.ts). Depuis l'hébergeur, une adresse interne — 127.0.0.1,
 * 10.0.0.5, 169.254.169.254 où les nuages servent les jetons d'instance —
 * est joignable ; elle ne doit jamais l'être par nous.
 *
 * VÉRIFIER AU MOMENT DE SE CONNECTER, PAS AVANT. Un contrôle fait sur le nom
 * avant la requête se contourne : le nom se résout une seconde fois à la
 * connexion, et peut alors pointer ailleurs (« DNS rebinding »). Ici, c'est le
 * résolveur même de la connexion qui refuse (`lookupPublic`), à chaque
 * connexion et à chaque redirection ; pour le SMTP, l'adresse vérifiée est
 * épinglée (`resoudrePublic`).
 *
 * Pentest du 29 septembre 2026 : P6, P7, P18.
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { lookup as dnsLookupAsync } from 'node:dns/promises'
import { request } from 'node:https'
import type { IncomingHttpHeaders } from 'node:http'
import { isIP, type LookupFunction } from 'node:net'

/** Une IPv6 écrite en entier : huit groupes de seize bits, en nombres. */
function groupesV6(ip: string): number[] | null {
  const [tete, queue, ...reste] = ip.toLowerCase().split('::')
  if (reste.length) return null
  const lire = (s: string | undefined) => (s ? s.split(':') : [])
  const avant = lire(tete)
  const apres = lire(queue)
  // Une IPv4 en fin d'adresse (« ::ffff:1.2.3.4 ») compte pour deux groupes.
  const dernier = apres.length ? apres[apres.length - 1] : avant[avant.length - 1]
  const v4 = dernier && dernier.includes('.') ? dernier.split('.').map(Number) : null
  const hex = (liste: string[]) => liste.filter((g) => !g.includes('.')).map((g) => parseInt(g, 16))
  const debut = hex(avant)
  const fin = hex(apres)
  const v4Groupes = v4 ? [((v4[0] ?? 0) << 8) | (v4[1] ?? 0), ((v4[2] ?? 0) << 8) | (v4[3] ?? 0)] : []
  if (queue === undefined) {
    const tout = [...debut, ...v4Groupes]
    return tout.length === 8 && tout.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? tout : null
  }
  fin.push(...v4Groupes)
  const manque = 8 - debut.length - fin.length
  if (manque < 0) return null
  const tout = [...debut, ...Array<number>(manque).fill(0), ...fin]
  return tout.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? tout : null
}

function v4Interne(a: number, b: number): boolean {
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // lien-local, jetons d'instance
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multidiffusion et réservé
  )
}

/**
 * Une adresse qu'on ne vise jamais : privée, locale, lien-local, réservée.
 *
 * En IPv6 aussi, et sous ses déguisements : une IPv4 « mappée »
 * (::ffff:127.0.0.1, ou ::ffff:7f00:1 en hexadécimal), le préfixe NAT64
 * (64:ff9b::/96), qui traduit vers de l'IPv4. Une adresse illisible est
 * traitée comme interne : dans le doute, on ne sort pas.
 */
export function priveOuLocal(ip: string): boolean {
  const o = ip.split('.').map(Number)
  if (o.length === 4 && o.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return v4Interne(o[0] as number, o[1] as number)
  }
  const g = groupesV6(ip)
  if (!g) return true
  // ::ffff:a.b.c.d (mappée) et 64:ff9b::a.b.c.d (NAT64) : on juge l'IPv4.
  const mappee = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff
  const nat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)
  if (mappee || nat64) return v4Interne((g[6] as number) >> 8, (g[6] as number) & 0xff)
  const premier = g[0] as number
  if (g.every((x) => x === 0)) return true // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true // ::1
  if (g.slice(0, 6).every((x) => x === 0)) return true // ::a.b.c.d, compatible, obsolète
  return (
    (premier & 0xfe00) === 0xfc00 || // fc00::/7, adresses uniques locales
    (premier & 0xffc0) === 0xfe80 || // fe80::/10, lien-local
    (premier & 0xff00) === 0xff00 || // ff00::/8, multidiffusion
    (premier === 0x2001 && g[1] === 0x0db8) // documentation
  )
}

/** L'erreur que rend un résolveur qui refuse : reconnaissable, sans rien dire du réseau. */
export class AdresseInterne extends Error {
  code = 'EADRESSEINTERNE'
  constructor(hote: string) {
    super(`adresse interne refusée pour ${hote}`)
  }
}

/**
 * Le résolveur des connexions sortantes : il résout, puis refuse si UNE des
 * adresses est interne. Passé à `https.request` (option `lookup`), il est
 * appelé par la connexion elle-même.
 */
export const lookupPublic: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, adresses) => {
    if (err) return callback(err, '', 0)
    const liste = adresses as unknown as LookupAddress[]
    if (!liste.length || liste.some((a) => priveOuLocal(a.address))) {
      return callback(new AdresseInterne(hostname), '', 0)
    }
    if (options.all) return callback(null, liste as never)
    const premiere = liste[0] as LookupAddress
    callback(null, premiere.address, premiere.family)
  })
}

/**
 * Résout un nom et rend UNE adresse publique à épingler — ou lève.
 * Pour les connexions qu'on ne crée pas soi-même (le SMTP de nodemailer).
 */
export async function resoudrePublic(hote: string): Promise<string> {
  const liste = await dnsLookupAsync(hote, { all: true })
  if (!liste.length || liste.some((a) => priveOuLocal(a.address))) throw new AdresseInterne(hote)
  return (liste[0] as LookupAddress).address
}

/** Ce qu'une requête sortante rend. `corps` n'est lu que si on l'a demandé. */
export interface ReponseSortante {
  code: number
  entetes: IncomingHttpHeaders
  corps: Buffer | null
}

export interface OptionsSortantes {
  /** Délai total, en millisecondes. */
  delai: number
  /** Lire le corps, au plus ce nombre d'octets (au-delà : null). 0 : ne pas le lire. */
  octetsMax?: number
  /** Redirections suivies, chacune revérifiée. 0 : aucune. */
  redirections?: number
  entetes?: Record<string, string>
}

/**
 * Une requête GET en https vers l'Internet public, et lui seul.
 *
 * Pas de fetch : son résolveur n'est pas le nôtre. `https.request` accepte
 * un `lookup`, et c'est lui qui tient la porte, à chaque connexion.
 */
export async function obtenirPublic(adresse: string, options: OptionsSortantes): Promise<ReponseSortante> {
  const fin = Date.now() + options.delai
  let url = new URL(adresse)
  for (let saut = 0; ; saut++) {
    if (url.protocol !== 'https:') throw new Error('seul https est suivi')
    if (url.username || url.password) throw new Error('identifiants dans l’adresse refusés')
    /* Une adresse IP écrite telle quelle ne passe pas par le résolveur : la
       connexion la joint directement. On la juge donc ici. */
    const hote = url.hostname.replace(/^\[|\]$/g, '')
    if (isIP(hote) && priveOuLocal(hote)) throw new AdresseInterne(hote)
    const reponse = await uneRequete(url, options, Math.max(1, fin - Date.now()))
    const vers = reponse.entetes.location
    if (reponse.code >= 300 && reponse.code < 400 && vers && saut < (options.redirections ?? 0)) {
      url = new URL(vers, url)
      continue
    }
    return reponse
  }
}

function uneRequete(url: URL, options: OptionsSortantes, delai: number): Promise<ReponseSortante> {
  return new Promise((resoudre, rejeter) => {
    const req = request(
      url,
      { method: 'GET', lookup: lookupPublic, headers: options.entetes, timeout: delai, signal: AbortSignal.timeout(delai) },
      (res) => {
        const code = res.statusCode ?? 0
        const max = options.octetsMax ?? 0
        const redirection = code >= 300 && code < 400
        if (!max || redirection || code >= 400) {
          res.resume()
          res.destroy()
          return resoudre({ code, entetes: res.headers, corps: null })
        }
        const annonce = Number(res.headers['content-length'] ?? 0)
        if (annonce > max) {
          res.destroy()
          return resoudre({ code, entetes: res.headers, corps: null })
        }
        const morceaux: Buffer[] = []
        let lus = 0
        res.on('data', (m: Buffer) => {
          lus += m.length
          if (lus > max) {
            res.destroy()
            resoudre({ code, entetes: res.headers, corps: null })
            return
          }
          morceaux.push(m)
        })
        res.on('end', () => resoudre({ code, entetes: res.headers, corps: Buffer.concat(morceaux) }))
        res.on('error', rejeter)
      },
    )
    req.on('timeout', () => req.destroy(new Error('délai dépassé')))
    req.on('error', rejeter)
    req.end()
  })
}
