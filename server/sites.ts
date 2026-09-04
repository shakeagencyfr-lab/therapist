/**
 * Le site vitrine du cabinet, nourri par sa fiche Google.
 *
 * Une thérapeute a déjà une présence en ligne : sa fiche Google, avec son
 * adresse, ses horaires, ses photos et ses avis. Elle ne va pas la retaper.
 * L'import la recopie une fois ; ensuite elle corrige, parce qu'une fiche
 * Google est souvent incomplète ou datée.
 *
 * Deux points qui ne sont pas négociables :
 *
 *   1. Les PHOTOS SONT RECOPIÉES chez nous. Les adresses que Google rend
 *      expirent ; une page d'accueil dont les images disparaissent au bout de
 *      quelques jours est pire que pas de photos. On télécharge, on dépose
 *      dans le compartiment `sites`, on garde notre adresse à nous.
 *   2. L'ATTRIBUTION SUIT LA PHOTO. Google l'exige, et c'est la moindre des
 *      choses : la photo est de quelqu'un. Elle voyage avec l'image, dans la
 *      même ligne, pour qu'on ne puisse pas afficher l'une sans l'autre.
 *
 * DEUX SOURCES POSSIBLES, dans cet ordre. SerpAPI (SERPAPI_KEY) lit la fiche
 * telle qu'elle s'affiche sur Google Maps ; l'API Places de Google
 * (GOOGLE_PLACES_KEY) la lit à la source. La première se branche en une
 * variable et rend les avis et les photos sans démarche ; la seconde demande
 * un projet Google Cloud et une facturation, mais ses champs sont stables.
 *
 * L'une ou l'autre suffit. La clé est celle de la PLATEFORME, sans préfixe
 * VITE_ : l'import est un service rendu, pas une clé à demander à chaque
 * cabinet. Sans aucune des deux, tout l'écran fonctionne — à la main.
 *
 * POURQUOI LE LECTEUR SERPAPI EST AUSSI TOLÉRANT. SerpAPI recopie une page
 * qui change : un champ y est tantôt une chaîne, tantôt un objet, tantôt un
 * tableau, et il disparaît sans prévenir. Chaque champ est donc lu par une
 * fonction qui accepte plusieurs formes et rend du vide plutôt que de lever.
 * Un import amputé de ses horaires reste un import ; un import qui plante
 * n'est rien.
 */
import { adminConfigure, clientAdmin, exigerCabinet, identifier } from './auth.js'
import { droitsDuCabinet, exigerDroit } from './droits.js'
import { HttpError } from './errors.js'
import { THEME_DEFAUT, resoudreTheme, type ThemeVitrine } from '../src/lib/themeVitrine.js'

/* ------------------------------------------------------------------ *
 * La bibliothèque de modèles
 * ------------------------------------------------------------------ */

export interface ModeleSite {
  code: string
  label: string
  detail: string
}

/**
 * Trois modèles, pas trente.
 *
 * Ils ne diffèrent que par la mise en page et le ton : mêmes rubriques, mêmes
 * données, même espace patient intégré. Un choix de modèle ne doit jamais
 * faire perdre un contenu déjà écrit.
 */
export const MODELES: ModeleSite[] = [
  {
    code: 'sobre',
    label: 'Sobre',
    detail: 'Une colonne, beaucoup de blanc, la photo en bandeau. Le texte porte.',
  },
  {
    code: 'chaleur',
    label: 'Chaleur',
    detail: 'Photos en grand, teintes du cabinet, avis mis en avant. Accueillant.',
  },
  {
    code: 'clinique',
    label: 'Clinique',
    detail: 'Horaires, adresse et prise de rendez-vous en tête. Efficace.',
  },
]

const CODES = new Set(MODELES.map((m) => m.code))

/* ------------------------------------------------------------------ *
 * Ce que l'écran reçoit
 * ------------------------------------------------------------------ */

export interface PhotoSite {
  url: string
  alt: string
  /** Exigée par Google quand la photo vient de sa fiche. */
  attribution: string
}

export interface HoraireSite {
  jour: string
  heures: string
}

export interface ServiceSite {
  titre: string
  texte: string
}

export interface AvisSite {
  auteur: string
  note: number
  texte: string
  date: string
}

export interface Site {
  modele: string
  /* L'habillage : polices, fond, cartes, angles. Les couleurs n'y sont pas —
     elles viennent de la marque du cabinet, qui habille déjà l'espace des
     patients vers lequel cette page mène. */
  theme: ThemeVitrine
  publie: boolean
  titre: string
  sousTitre: string
  presentation: string
  adresse: string
  telephone: string
  siteWeb: string
  horaires: HoraireSite[]
  photos: PhotoSite[]
  services: ServiceSite[]
  avis: AvisSite[]
  googlePlaceId: string | null
  googleNote: number | null
  googleAvis: number | null
  importeLe: string | null
}

export interface EtatSite {
  site: Site
  /** L'offre du cabinet ouvre-t-elle le site vitrine ? */
  droit: boolean
  offre: string
  /** L'import depuis Google est-il configuré sur ce serveur ? */
  google: boolean
  /** Laquelle des deux sources répond — pour que l'écran puisse le dire. */
  source: SourceFiche
  modeles: ModeleSite[]
}

/** Une fiche Google trouvée, telle qu'on la propose au choix. */
export interface FicheTrouvee {
  placeId: string
  nom: string
  adresse: string
  note: number | null
  avis: number | null
}

const VIDE: Site = {
  modele: 'sobre',
  theme: THEME_DEFAUT,
  publie: false,
  titre: '',
  sousTitre: '',
  presentation: '',
  adresse: '',
  telephone: '',
  siteWeb: '',
  horaires: [],
  photos: [],
  services: [],
  avis: [],
  googlePlaceId: null,
  googleNote: null,
  googleAvis: null,
  importeLe: null,
}

interface SiteRow {
  modele: string | null
  theme: unknown
  publie: boolean | null
  titre: string | null
  sous_titre: string | null
  presentation: string | null
  adresse: string | null
  telephone: string | null
  site_web: string | null
  horaires: HoraireSite[] | null
  photos: PhotoSite[] | null
  services: ServiceSite[] | null
  avis: AvisSite[] | null
  google_place_id: string | null
  google_note: number | null
  google_avis: number | null
  importe_le: string | null
}

const COLONNES =
  'modele, theme, publie, titre, sous_titre, presentation, adresse, telephone, site_web, horaires, photos, services, avis, google_place_id, google_note, google_avis, importe_le'

function versSite(row: SiteRow | null): Site {
  if (!row) return VIDE
  return {
    modele: CODES.has(row.modele ?? '') ? (row.modele as string) : 'sobre',
    /* Relu par la liste blanche à CHAQUE lecture, pas seulement à
       l'écriture : une ligne écrite avant qu'une police soit retirée de la
       liste rendrait sinon un code que plus rien ne connaît. */
    theme: resoudreTheme(row.theme),
    publie: Boolean(row.publie),
    titre: row.titre ?? '',
    sousTitre: row.sous_titre ?? '',
    presentation: row.presentation ?? '',
    adresse: row.adresse ?? '',
    telephone: row.telephone ?? '',
    siteWeb: row.site_web ?? '',
    horaires: row.horaires ?? [],
    photos: row.photos ?? [],
    services: row.services ?? [],
    avis: row.avis ?? [],
    googlePlaceId: row.google_place_id,
    googleNote: row.google_note === null ? null : Number(row.google_note),
    googleAvis: row.google_avis === null ? null : Number(row.google_avis),
    importeLe: row.importe_le,
  }
}

/* ------------------------------------------------------------------ *
 * Lecture
 * ------------------------------------------------------------------ */

export async function etatSite(token: string | null): Promise<EtatSite> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const droits = await droitsDuCabinet(cabinetId, appelant.client)
  const { data, error } = await appelant.client
    .from('cabinet_sites')
    .select(COLONNES)
    .eq('cabinet_id', cabinetId)
    .maybeSingle<SiteRow>()
  if (error) throw new HttpError(502, "Votre site n'a pas pu être lu.")
  return {
    site: versSite(data ?? null),
    droit: droits.site,
    offre: droits.offre,
    google: googleConfigure(),
    source: sourceFiche(),
    modeles: MODELES,
  }
}

/* ------------------------------------------------------------------ *
 * Écriture
 * ------------------------------------------------------------------ */

/** Coupe un texte, sans le tronquer au milieu d'un mot quand c'est évitable. */
function texte(valeur: unknown, max: number): string {
  const brut = String(valeur ?? '').trim()
  return brut.length <= max ? brut : brut.slice(0, max).replace(/\s+\S*$/, '')
}

/** Une adresse de site web, ou rien : on n'affiche pas un lien cassé. */
function lien(valeur: unknown): string {
  const brut = String(valeur ?? '').trim()
  if (!brut) return ''
  const avecSchema = /^https?:\/\//i.test(brut) ? brut : `https://${brut}`
  try {
    const url = new URL(avecSchema)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : ''
  } catch {
    return ''
  }
}

/**
 * Une photo acceptable.
 *
 * L'adresse doit être la nôtre ou celle d'un stockage public : une page qui
 * chargerait une image depuis n'importe où laisserait fuir la visite de la
 * page vers ce tiers.
 */
function photo(brut: unknown): PhotoSite | null {
  const p = (brut ?? {}) as Partial<PhotoSite>
  const url = lien(p.url)
  if (!url || !url.startsWith('https://')) return null
  return { url, alt: texte(p.alt, 160), attribution: texte(p.attribution, 160) }
}

export interface SiteBody {
  modele?: string
  theme?: unknown
  publie?: boolean
  titre?: string
  sousTitre?: string
  presentation?: string
  adresse?: string
  telephone?: string
  siteWeb?: string
  horaires?: unknown[]
  photos?: unknown[]
  services?: unknown[]
  avis?: unknown[]
}

/**
 * Enregistrer le site.
 *
 * Écrit sous la RLS de l'appelante : `cabinet_sites` a une politique complète
 * pour les membres du cabinet, donc la clé de service n'a rien à faire ici.
 */
export async function enregistrerSite(token: string | null, raw: unknown): Promise<EtatSite> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const droits = await droitsDuCabinet(cabinetId, appelant.client)
  exigerDroit(droits, 'site')

  const body = (raw && typeof raw === 'object' ? raw : {}) as SiteBody
  const modele = CODES.has(String(body.modele ?? '')) ? String(body.modele) : 'sobre'

  const ligne = {
    cabinet_id: cabinetId,
    modele,
    /* La même liste blanche qu'à la lecture : ce qui entre en base est déjà
       propre, et rien d'inconnu ne s'y accumule. */
    theme: resoudreTheme(body.theme),
    publie: Boolean(body.publie),
    titre: texte(body.titre, 120),
    sous_titre: texte(body.sousTitre, 200),
    presentation: texte(body.presentation, 3000),
    adresse: texte(body.adresse, 240),
    telephone: texte(body.telephone, 40),
    site_web: lien(body.siteWeb),
    horaires: (body.horaires ?? [])
      .slice(0, 7)
      .map((h) => h as Partial<HoraireSite>)
      .map((h) => ({ jour: texte(h.jour, 40), heures: texte(h.heures, 80) }))
      .filter((h) => h.jour),
    photos: (body.photos ?? []).slice(0, 12).map(photo).filter((p): p is PhotoSite => p !== null),
    services: (body.services ?? [])
      .slice(0, 12)
      .map((s) => s as Partial<ServiceSite>)
      .map((s) => ({ titre: texte(s.titre, 80), texte: texte(s.texte, 600) }))
      .filter((s) => s.titre),
    avis: (body.avis ?? [])
      .slice(0, 8)
      .map((a) => a as Partial<AvisSite>)
      .map((a) => ({
        auteur: texte(a.auteur, 80),
        note: Math.max(0, Math.min(5, Number(a.note ?? 0))),
        texte: texte(a.texte, 800),
        date: texte(a.date, 40),
      }))
      .filter((a) => a.texte),
    updated_at: new Date().toISOString(),
  }

  const { error } = await appelant.client
    .from('cabinet_sites')
    .upsert(ligne, { onConflict: 'cabinet_id' })
  if (error) {
    console.error(`[site] enregistrement — ${error.message}`)
    throw new HttpError(502, "Votre site n'a pas pu être enregistré. Réessayez dans un instant.")
  }
  return etatSite(token)
}

/* ------------------------------------------------------------------ *
 * La fiche Google
 * ------------------------------------------------------------------ */

const GOOGLE_KEY = (process.env.GOOGLE_PLACES_KEY ?? '').trim()
const SERPAPI_KEY = (process.env.SERPAPI_KEY ?? '').trim()

/** Quelle source lit la fiche. SerpAPI d'abord : elle demande moins. */
export type SourceFiche = 'serpapi' | 'places' | 'aucune'

export function sourceFiche(): SourceFiche {
  if (SERPAPI_KEY) return 'serpapi'
  if (GOOGLE_KEY) return 'places'
  return 'aucune'
}

export function googleConfigure(): boolean {
  return sourceFiche() !== 'aucune'
}

/*
 * UNE LIGNE AU DÉMARRAGE DE LA FONCTION, ET JAMAIS UNE CLÉ.
 *
 * Une variable d'environnement absente est la panne la plus difficile à
 * diagnostiquer d'ici : l'écran dit « pas configuré », et cela peut vouloir
 * dire que la clé n'a pas été posée, qu'elle l'a été sur le mauvais
 * environnement, que le déploiement est antérieur, ou que le code ne la lit
 * pas. Vue du navigateur, ces quatre causes sont identiques.
 *
 * Ce journal les sépare : il dit ce que la fonction voit réellement, au
 * moment où elle démarre. Il n'écrit que le NOM de la source — jamais la
 * clé, ni sa longueur, ni son début, qui suffiraient à la reconstituer par
 * recoupements.
 */
console.log(`[site] fiches Google — source active : ${sourceFiche()}`)

function exigerGoogle(): string {
  if (!GOOGLE_KEY) {
    throw new HttpError(
      503,
      "L'import depuis Google n'est pas configuré sur ce serveur. Vous pouvez remplir votre page à la main : tout y est modifiable.",
    )
  }
  return GOOGLE_KEY
}

/* ------------------------------------------------------------------ *
 * SerpAPI
 * ------------------------------------------------------------------ */

/**
 * Un appel à SerpAPI.
 *
 * La clé passe en paramètre d'URL : c'est ce que l'API demande. Elle ne sort
 * jamais d'ici — ni vers le navigateur, ni dans un message d'erreur, ni dans
 * le journal, où l'URL complète serait recopiée avec.
 */
async function serpapi(parametres: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL('https://serpapi.com/search.json')
  for (const [clef, valeur] of Object.entries(parametres)) url.searchParams.set(clef, valeur)
  url.searchParams.set('api_key', SERPAPI_KEY)

  let reponse: Response
  try {
    reponse = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new HttpError(504, 'Le service de recherche est injoignable depuis le serveur. Réessayez dans un instant.')
  }
  const lu = (await reponse.json().catch(() => ({}))) as Record<string, unknown>
  if (!reponse.ok || typeof lu.error === 'string') {
    const motif = String(lu.error ?? reponse.status).slice(0, 200)
    // Le motif est en anglais et technique : journal, pas écran. Et jamais
    // l'URL, qui porte la clé.
    console.error(`[site] serpapi ${reponse.status} — ${motif}`)
    if (reponse.status === 401 || /api_key|invalid key/i.test(motif)) {
      throw new HttpError(502, 'La clé de recherche de la plateforme est refusée. Prévenez votre revendeur.')
    }
    if (reponse.status === 429 || /run out|limit/i.test(motif)) {
      throw new HttpError(429, 'Le quota de recherche de la plateforme est atteint. Réessayez plus tard, ou prévenez votre revendeur.')
    }
    throw new HttpError(502, "La recherche n'a rien rendu. Réessayez dans un instant, ou remplissez votre page à la main.")
  }
  return lu
}

/* Les lecteurs tolérants ------------------------------------------------ *
 * SerpAPI recopie une page qui bouge. Un champ peut arriver en chaîne, en
 * objet, en tableau, ou pas du tout — et le jour où il change de forme, un
 * import doit perdre ce champ, pas s'arrêter.                             */

/** Une chaîne, d'où qu'elle vienne : chaîne nue, `{ snippet }`, `{ text }`. */
export function chaineSouple(brut: unknown, max: number): string {
  if (typeof brut === 'string') return texte(brut, max)
  if (typeof brut === 'number') return texte(String(brut), max)
  if (brut && typeof brut === 'object') {
    const o = brut as Record<string, unknown>
    for (const clef of ['snippet', 'text', 'description', 'name', 'title', 'value']) {
      if (typeof o[clef] === 'string') return texte(o[clef] as string, max)
    }
  }
  return ''
}

export function nombreSouple(brut: unknown): number | null {
  /* `Number(null)` vaut ZÉRO, et `Number('')` aussi : sans ces deux gardes,
     une fiche sans note s'importait notée 0 sur 5 et l'affichait en tête de
     la page d'accueil du cabinet. Une note absente est absente. */
  if (typeof brut === 'number') return Number.isFinite(brut) ? brut : null
  if (typeof brut !== 'string') return null
  const propre = brut.replace(',', '.').replace(/[^\d.]/g, '')
  if (!propre) return null
  const n = Number(propre)
  return Number.isFinite(n) ? n : null
}

/**
 * Les horaires, dans les trois formes rencontrées :
 *   [{ "lundi": "09:00–19:00" }, …]         — la plus courante
 *   [{ day: "lundi", times: ["09:00–19:00"] }, …]
 *   { "lundi": "09:00–19:00", … }
 */
export function horairesSouples(brut: unknown): Array<{ jour: string; heures: string }> {
  const sortie: Array<{ jour: string; heures: string }> = []
  const pousser = (jour: string, heures: unknown) => {
    const j = texte(jour, 40)
    const h = Array.isArray(heures) ? heures.map((x) => chaineSouple(x, 40)).filter(Boolean).join(', ') : chaineSouple(heures, 80)
    if (j) sortie.push({ jour: j, heures: texte(h, 80) })
  }
  if (Array.isArray(brut)) {
    for (const entree of brut) {
      if (!entree || typeof entree !== 'object') continue
      const o = entree as Record<string, unknown>
      if (typeof o.day === 'string') {
        pousser(o.day, o.times ?? o.hours ?? o.time)
        continue
      }
      for (const [jour, heures] of Object.entries(o)) pousser(jour, heures)
    }
  } else if (brut && typeof brut === 'object') {
    for (const [jour, heures] of Object.entries(brut as Record<string, unknown>)) pousser(jour, heures)
  }
  return sortie.slice(0, 7)
}

/** Les avis, depuis `user_reviews.most_relevant` ou un tableau `reviews`. */
export function avisSouples(brut: unknown): Array<{ auteur: string; note: number; texte: string; date: string }> {
  const source = Array.isArray(brut)
    ? brut
    : brut && typeof brut === 'object'
      ? ((brut as Record<string, unknown>).most_relevant ?? (brut as Record<string, unknown>).reviews ?? [])
      : []
  if (!Array.isArray(source)) return []
  return source
    .slice(0, 5)
    .map((brute) => {
      const r = (brute ?? {}) as Record<string, unknown>
      return {
        auteur: chaineSouple(r.username ?? r.user ?? r.author, 80),
        note: Math.max(0, Math.min(5, nombreSouple(r.rating) ?? 0)),
        texte: chaineSouple(r.description ?? r.snippet ?? r.extracted_snippet ?? r.text, 800),
        date: chaineSouple(r.date ?? r.iso_date ?? r.relative_date, 40),
      }
    })
    .filter((a) => a.texte)
}

/** Les adresses d'images, depuis `images`, `photos` ou une simple vignette. */
export function imagesSouples(brut: unknown, secours: unknown): string[] {
  const urls: string[] = []
  const ajouter = (valeur: unknown) => {
    const u = typeof valeur === 'string' ? valeur : chaineSouple(valeur, 600)
    if (u.startsWith('https://') && !urls.includes(u)) urls.push(u)
  }
  if (Array.isArray(brut)) {
    for (const entree of brut) {
      if (typeof entree === 'string') ajouter(entree)
      else if (entree && typeof entree === 'object') {
        const o = entree as Record<string, unknown>
        ajouter(o.image ?? o.thumbnail ?? o.serpapi_thumbnail ?? o.original ?? o.link)
      }
    }
  }
  if (!urls.length) ajouter(secours)
  return urls.slice(0, 6)
}

/** Ce que les deux sources rendent, une fois mises à la même forme. */
interface FicheLue {
  placeId: string
  nom: string
  adresse: string
  telephone: string
  siteWeb: string
  presentation: string
  note: number | null
  avisNombre: number | null
  horaires: Array<{ jour: string; heures: string }>
  avis: Array<{ auteur: string; note: number; texte: string; date: string }>
  /** Adresses d'images à recopier chez nous, ou noms de photos Places. */
  images: string[]
}

/** La recherche, par SerpAPI. */
async function chercherParSerpapi(requete: string): Promise<FicheTrouvee[]> {
  const lu = await serpapi({ engine: 'google_maps', type: 'search', q: requete, hl: 'fr', gl: 'fr' })
  /* Une requête très précise renvoie parfois LA fiche au lieu d'une liste :
     c'est le même écran de choix, avec un seul choix. */
  const uniques = lu.place_results ? [lu.place_results] : []
  const liste = Array.isArray(lu.local_results) ? lu.local_results : uniques
  return (liste as Array<Record<string, unknown>>)
    .map((r) => ({
      placeId: chaineSouple(r.place_id, 300),
      nom: chaineSouple(r.title, 120),
      adresse: chaineSouple(r.address, 240),
      note: nombreSouple(r.rating),
      avis: nombreSouple(r.reviews),
    }))
    .filter((f) => f.placeId && f.nom)
    .slice(0, 6)
}

/** Le détail d'une fiche, par SerpAPI. */
async function lireParSerpapi(placeId: string): Promise<FicheLue> {
  const lu = await serpapi({ engine: 'google_maps', type: 'place', place_id: placeId, hl: 'fr', gl: 'fr' })
  const p = ((lu.place_results ?? {}) as Record<string, unknown>)
  return {
    placeId: chaineSouple(p.place_id, 300) || placeId,
    nom: chaineSouple(p.title, 120),
    adresse: chaineSouple(p.address, 240),
    telephone: chaineSouple(p.phone, 40),
    siteWeb: lien(p.website),
    presentation: chaineSouple(p.description, 3000),
    note: nombreSouple(p.rating),
    avisNombre: nombreSouple(p.reviews),
    horaires: horairesSouples(p.hours ?? p.operating_hours),
    avis: avisSouples(p.user_reviews ?? p.reviews_results),
    images: imagesSouples(p.images ?? p.photos, p.thumbnail),
  }
}

/**
 * Un appel à l'API Places.
 *
 * `champs` est le masque de champs, obligatoire sur la recherche et sur le
 * détail — Google refuse une demande qui ne dit pas ce qu'elle veut. Sur le
 * point d'accès des photos, en revanche, il n'a pas de sens : on ne l'envoie
 * donc pas plutôt que d'envoyer une étoile qui se ferait refuser.
 */
async function google(chemin: string, champs: string | null, corps?: unknown): Promise<Record<string, unknown>> {
  const cle = exigerGoogle()
  let reponse: Response
  try {
    reponse = await fetch(`https://places.googleapis.com/v1/${chemin}`, {
      method: corps ? 'POST' : 'GET',
      headers: {
        'X-Goog-Api-Key': cle,
        ...(champs ? { 'X-Goog-FieldMask': champs } : {}),
        ...(corps ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corps ? JSON.stringify(corps) : undefined,
      // L'hébergeur coupe la fonction à soixante secondes : mieux vaut
      // abandonner avant et le dire, qu'être coupé sans explication.
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new HttpError(504, 'Google est injoignable depuis le serveur. Réessayez dans un instant.')
  }
  const lu = (await reponse.json().catch(() => ({}))) as Record<string, unknown>
  if (!reponse.ok) {
    const message = ((lu.error as { message?: string } | undefined)?.message ?? '').slice(0, 200)
    // Le motif de Google est en anglais et technique : journal, pas écran.
    console.error(`[site] google ${reponse.status} — ${message}`)
    if (reponse.status === 403 || reponse.status === 401) {
      throw new HttpError(502, "Google refuse la clé de la plateforme. Prévenez votre revendeur.")
    }
    if (reponse.status === 429) {
      throw new HttpError(429, 'Google a reçu trop de demandes. Réessayez dans quelques minutes.')
    }
    throw new HttpError(502, "Google n'a pas répondu à cette recherche. Réessayez dans un instant, ou remplissez votre page à la main.")
  }
  return lu
}

interface PlaceGoogle {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  nationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  userRatingCount?: number
  editorialSummary?: { text?: string }
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  reviews?: Array<{
    rating?: number
    text?: { text?: string }
    relativePublishTimeDescription?: string
    authorAttribution?: { displayName?: string }
  }>
  photos?: Array<{
    name?: string
    authorAttributions?: Array<{ displayName?: string }>
  }>
}

/** Chercher la fiche du cabinet, par son nom et sa ville. */
export async function chercherFicheGoogle(token: string | null, raw: unknown): Promise<FicheTrouvee[]> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const droits = await droitsDuCabinet(cabinetId, appelant.client)
  exigerDroit(droits, 'site')

  const body = (raw && typeof raw === 'object' ? raw : {}) as { requete?: string }
  const requete = texte(body.requete, 120)
  if (requete.length < 3) {
    throw new HttpError(400, 'Cherchez avec le nom de votre cabinet et votre ville.')
  }

  if (sourceFiche() === 'serpapi') return chercherParSerpapi(requete)

  const lu = await google(
    'places:searchText',
    'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount',
    { textQuery: requete, languageCode: 'fr', regionCode: 'FR', maxResultCount: 6 },
  )
  const places = (lu.places ?? []) as PlaceGoogle[]
  return places
    .filter((p) => p.id)
    .map((p) => ({
      placeId: String(p.id),
      nom: p.displayName?.text ?? '',
      adresse: p.formattedAddress ?? '',
      note: typeof p.rating === 'number' ? p.rating : null,
      avis: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    }))
}

/** Le détail d'une fiche, par l'API Places. */
async function lireParPlaces(placeId: string): Promise<FicheLue> {
  const p = (await google(
    `places/${encodeURIComponent(placeId)}?languageCode=fr`,
    'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,editorialSummary,regularOpeningHours.weekdayDescriptions,reviews,photos',
  )) as PlaceGoogle

  const horaires = (p.regularOpeningHours?.weekdayDescriptions ?? []).slice(0, 7).map((ligne) => {
    const coupe = ligne.indexOf(':')
    return coupe === -1
      ? { jour: texte(ligne, 40), heures: '' }
      : { jour: texte(ligne.slice(0, coupe), 40), heures: texte(ligne.slice(coupe + 1), 80) }
  })

  return {
    placeId: p.id ?? placeId,
    nom: texte(p.displayName?.text, 120),
    adresse: texte(p.formattedAddress, 240),
    telephone: texte(p.nationalPhoneNumber, 40),
    siteWeb: lien(p.websiteUri),
    presentation: texte(p.editorialSummary?.text, 3000),
    note: typeof p.rating === 'number' ? p.rating : null,
    avisNombre: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    horaires,
    avis: (p.reviews ?? [])
      .slice(0, 5)
      .map((r) => ({
        auteur: texte(r.authorAttribution?.displayName, 80),
        note: Math.max(0, Math.min(5, Number(r.rating ?? 0))),
        texte: texte(r.text?.text, 800),
        date: texte(r.relativePublishTimeDescription, 40),
      }))
      .filter((a) => a.texte),
    /* Places ne rend pas d'adresse d'image mais un NOM de photo, à échanger
       contre une adresse éphémère. `recopierPhoto` reconnaît les deux. */
    images: (p.photos ?? []).slice(0, 6).map((ph) => ph.name ?? '').filter(Boolean),
  }
}

/**
 * Recopier une photo de Google chez nous.
 *
 * L'adresse rendue par Google expire ; celle-ci non. Le dépôt passe par la
 * clé de service parce que le serveur agit ici pour le cabinet, sans session
 * de navigateur — le chemin commence par l'identifiant du cabinet, ce qui est
 * exactement ce que vérifient les politiques du compartiment.
 */
async function recopierPhoto(cabinetId: string, nom: string, rang: number): Promise<string | null> {
  const client = clientAdmin()
  if (!client || !adminConfigure()) return null

  /* Une photo qui ne se recopie pas ne doit pas emporter tout l'import : la
     fiche vaut d'être importée même amputée d'une image.

     SerpAPI rend directement une adresse ; Places rend un NOM de photo qu'il
     faut d'abord échanger contre une adresse éphémère. */
  let source = ''
  if (nom.startsWith('https://')) {
    source = nom
  } else {
    try {
      const lu = await google(`${nom}/media?maxWidthPx=1600&skipHttpRedirect=true`, null)
      source = String((lu as { photoUri?: string }).photoUri ?? '')
    } catch {
      return null
    }
  }
  if (!source.startsWith('https://')) return null

  let octets: ArrayBuffer
  let type = 'image/jpeg'
  try {
    const image = await fetch(source)
    if (!image.ok) return null
    type = image.headers.get('content-type') ?? 'image/jpeg'
    octets = await image.arrayBuffer()
  } catch {
    return null
  }
  // Le compartiment plafonne à 5 Mo, et une photo de cabinet n'en fait pas
  // tant : au-delà, on passe plutôt que de faire échouer tout l'import.
  if (octets.byteLength > 5_000_000) return null
  if (!/^image\/(png|jpeg|webp)$/.test(type)) type = 'image/jpeg'

  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
  const chemin = `${cabinetId}/site/google-${rang}.${extension}`
  const { error } = await client.storage
    .from('sites')
    .upload(chemin, new Uint8Array(octets), { contentType: type, upsert: true })
  if (error) return null

  const { data } = client.storage.from('sites').getPublicUrl(chemin)
  return data.publicUrl
}

/**
 * Importer la fiche : remplir ce qui est vide, laisser ce qui est écrit.
 *
 * C'est la règle qui rend l'import réutilisable. Une thérapeute qui a corrigé
 * sa présentation et réimporte pour récupérer ses nouveaux avis ne doit pas
 * retrouver le texte de Google à la place du sien.
 */
export async function importerFicheGoogle(token: string | null, raw: unknown): Promise<EtatSite> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const droits = await droitsDuCabinet(cabinetId, appelant.client)
  exigerDroit(droits, 'site')

  const body = (raw && typeof raw === 'object' ? raw : {}) as { placeId?: string }
  const placeId = texte(body.placeId, 300)
  if (!placeId) throw new HttpError(400, 'Choisissez la fiche à importer.')

  // Une seule lecture, quelle que soit la source : la suite ne sait plus d'où
  // vient la fiche, et n'a pas à le savoir.
  const fiche = sourceFiche() === 'serpapi' ? await lireParSerpapi(placeId) : await lireParPlaces(placeId)

  const { data: existant } = await appelant.client
    .from('cabinet_sites')
    .select(COLONNES)
    .eq('cabinet_id', cabinetId)
    .maybeSingle<SiteRow>()
  const actuel = versSite(existant ?? null)

  /* Les photos ne sont recopiées que la première fois : reprendre l'import
     pour rafraîchir les avis ne doit pas redéposer six fichiers. */
  let photos = actuel.photos
  if (!photos.length) {
    const recopiees: PhotoSite[] = []
    for (const [rang, reference] of fiche.images.entries()) {
      const url = await recopierPhoto(cabinetId, reference, rang + 1)
      if (!url) continue
      recopiees.push({
        url,
        alt: `${fiche.nom || 'Cabinet'} — photo ${rang + 1}`,
        attribution: 'Photo : Google',
      })
    }
    photos = recopiees
  }

  const ligne = {
    cabinet_id: cabinetId,
    modele: actuel.modele,
    publie: actuel.publie,
    titre: actuel.titre || fiche.nom,
    sous_titre: actuel.sousTitre,
    presentation: actuel.presentation || fiche.presentation,
    adresse: actuel.adresse || fiche.adresse,
    telephone: actuel.telephone || fiche.telephone,
    site_web: actuel.siteWeb || fiche.siteWeb,
    horaires: fiche.horaires.length ? fiche.horaires : actuel.horaires,
    photos,
    services: actuel.services,
    avis: fiche.avis.length ? fiche.avis : actuel.avis,
    google_place_id: fiche.placeId,
    google_note: fiche.note === null ? null : Number(fiche.note.toFixed(1)),
    google_avis: fiche.avisNombre === null ? null : Math.round(fiche.avisNombre),
    importe_le: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error } = await appelant.client
    .from('cabinet_sites')
    .upsert(ligne, { onConflict: 'cabinet_id' })
  if (error) {
    console.error(`[site] import — ${error.message}`)
    throw new HttpError(502, "La fiche importée n'a pas pu être enregistrée. Réessayez dans un instant.")
  }
  return etatSite(token)
}
