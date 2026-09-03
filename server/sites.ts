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
 * La clé Google est celle de la PLATEFORME (GOOGLE_PLACES_KEY, sans préfixe
 * VITE_) : l'import est un service rendu, pas une clé à demander à chaque
 * cabinet. Sans elle, tout l'écran fonctionne — à la main.
 */
import { adminConfigure, clientAdmin, exigerCabinet, identifier } from './auth.js'
import { droitsDuCabinet, exigerDroit } from './droits.js'
import { HttpError } from './errors.js'

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
 * données, même espace patiente intégré. Un choix de modèle ne doit jamais
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
  'modele, publie, titre, sous_titre, presentation, adresse, telephone, site_web, horaires, photos, services, avis, google_place_id, google_note, google_avis, importe_le'

function versSite(row: SiteRow | null): Site {
  if (!row) return VIDE
  return {
    modele: CODES.has(row.modele ?? '') ? (row.modele as string) : 'sobre',
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
  if (error) throw new HttpError(502, `Votre site n'a pas pu être enregistré : ${error.message}`)
  return etatSite(token)
}

/* ------------------------------------------------------------------ *
 * La fiche Google
 * ------------------------------------------------------------------ */

const GOOGLE_KEY = (process.env.GOOGLE_PLACES_KEY ?? '').trim()

export function googleConfigure(): boolean {
  return Boolean(GOOGLE_KEY)
}

function exigerGoogle(): string {
  if (!GOOGLE_KEY) {
    throw new HttpError(
      503,
      "L'import depuis Google n'est pas configuré sur ce serveur. Vous pouvez remplir votre page à la main : tout y est modifiable.",
    )
  }
  return GOOGLE_KEY
}

async function google(chemin: string, champs: string, corps?: unknown): Promise<Record<string, unknown>> {
  const cle = exigerGoogle()
  let reponse: Response
  try {
    reponse = await fetch(`https://places.googleapis.com/v1/${chemin}`, {
      method: corps ? 'POST' : 'GET',
      headers: {
        'X-Goog-Api-Key': cle,
        'X-Goog-FieldMask': champs,
        ...(corps ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corps ? JSON.stringify(corps) : undefined,
    })
  } catch {
    throw new HttpError(504, 'Google est injoignable depuis le serveur. Réessayez dans un instant.')
  }
  const lu = (await reponse.json().catch(() => ({}))) as Record<string, unknown>
  if (!reponse.ok) {
    const message = ((lu.error as { message?: string } | undefined)?.message ?? '').slice(0, 200)
    if (reponse.status === 403 || reponse.status === 401) {
      throw new HttpError(502, "Google refuse la clé de la plateforme. Prévenez votre revendeur.")
    }
    if (reponse.status === 429) {
      throw new HttpError(429, 'Google a reçu trop de demandes. Réessayez dans quelques minutes.')
    }
    throw new HttpError(502, `Google a refusé la demande${message ? ` : ${message}` : '.'}`)
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

  const lu = await google(`${nom}/media?maxWidthPx=1600&skipHttpRedirect=true`, '*')
  const source = String((lu as { photoUri?: string }).photoUri ?? '')
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
  const placeId = texte(body.placeId, 200)
  if (!placeId) throw new HttpError(400, 'Choisissez la fiche à importer.')

  const p = (await google(
    `places/${encodeURIComponent(placeId)}?languageCode=fr`,
    'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,editorialSummary,regularOpeningHours.weekdayDescriptions,reviews,photos',
  )) as PlaceGoogle

  const { data: existant } = await appelant.client
    .from('cabinet_sites')
    .select(COLONNES)
    .eq('cabinet_id', cabinetId)
    .maybeSingle<SiteRow>()
  const actuel = versSite(existant ?? null)

  const horaires = (p.regularOpeningHours?.weekdayDescriptions ?? []).slice(0, 7).map((ligne) => {
    const coupe = ligne.indexOf(':')
    return coupe === -1
      ? { jour: texte(ligne, 40), heures: '' }
      : { jour: texte(ligne.slice(0, coupe), 40), heures: texte(ligne.slice(coupe + 1), 80) }
  })

  const avis = (p.reviews ?? [])
    .slice(0, 5)
    .map((r) => ({
      auteur: texte(r.authorAttribution?.displayName, 80),
      note: Math.max(0, Math.min(5, Number(r.rating ?? 0))),
      texte: texte(r.text?.text, 800),
      date: texte(r.relativePublishTimeDescription, 40),
    }))
    .filter((a) => a.texte)

  /* Les photos ne sont recopiées que la première fois : reprendre l'import
     pour rafraîchir les avis ne doit pas redéposer six fichiers. */
  let photos = actuel.photos
  if (!photos.length) {
    const noms = (p.photos ?? []).slice(0, 6)
    const recopiees: PhotoSite[] = []
    for (const [rang, ph] of noms.entries()) {
      if (!ph.name) continue
      const url = await recopierPhoto(cabinetId, ph.name, rang + 1)
      if (!url) continue
      const auteurs = (ph.authorAttributions ?? []).map((a) => a.displayName).filter(Boolean)
      recopiees.push({
        url,
        alt: `${p.displayName?.text ?? 'Cabinet'} — photo ${rang + 1}`,
        attribution: auteurs.length ? `Photo : ${auteurs.join(', ')} (Google)` : 'Photo : Google',
      })
    }
    photos = recopiees
  }

  const ligne = {
    cabinet_id: cabinetId,
    modele: actuel.modele,
    publie: actuel.publie,
    titre: actuel.titre || texte(p.displayName?.text, 120),
    sous_titre: actuel.sousTitre,
    presentation: actuel.presentation || texte(p.editorialSummary?.text, 3000),
    adresse: actuel.adresse || texte(p.formattedAddress, 240),
    telephone: actuel.telephone || texte(p.nationalPhoneNumber, 40),
    site_web: actuel.siteWeb || lien(p.websiteUri),
    horaires: horaires.length ? horaires : actuel.horaires,
    photos,
    services: actuel.services,
    avis: avis.length ? avis : actuel.avis,
    google_place_id: p.id ?? placeId,
    google_note: typeof p.rating === 'number' ? Number(p.rating.toFixed(1)) : null,
    google_avis: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    importe_le: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error } = await appelant.client
    .from('cabinet_sites')
    .upsert(ligne, { onConflict: 'cabinet_id' })
  if (error) throw new HttpError(502, `La fiche n'a pas pu être enregistrée : ${error.message}`)
  return etatSite(token)
}
