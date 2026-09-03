/**
 * Ce que l'offre d'un cabinet ouvre.
 *
 * Un abonnement décide quatre choses, et rien d'autre : combien de fiches
 * actives, la boutique, la marque blanche (son domaine et ses courriels), le
 * site vitrine. L'analyse n'en fait pas partie — chaque cabinet branche sa
 * propre clé Anthropic et paie ses appels.
 *
 * La règle est calculée en base, par `cabinet_droits()` : l'offre, corrigée
 * des exceptions négociées pour ce cabinet. Le serveur ne la recalcule pas —
 * deux endroits qui décident du même droit finissent par ne plus être
 * d'accord, et c'est toujours l'écran qui a tort.
 *
 * Ce module ne fait donc que lire cette fonction et refuser proprement.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { exigerCabinet, identifier } from './auth.js'
import { HttpError } from './errors.js'

/** Les leviers qu'une offre ouvre ou ferme. */
export type Levier = 'shop' | 'marqueBlanche' | 'site'

export interface Droits {
  /** Fiches actives autorisées. null = sans limite. */
  maxPatients: number | null
  patientesActives: number
  shop: boolean
  marqueBlanche: boolean
  site: boolean
  /** Le nom de l'offre, tel qu'il s'affiche. */
  offre: string
  offreCode: string
}

/** La forme que rend `cabinet_droits()`. */
interface DroitsRow {
  max_patients: number | null
  patients_actives: number | null
  shop: boolean | null
  marque_blanche: boolean | null
  site: boolean | null
  offre: string | null
  offre_code: string | null
}

/** Ce que l'écran doit lire quand un levier est fermé. */
const REFUS: Record<Levier, string> = {
  shop:
    "La boutique en ligne n'est pas comprise dans votre offre. Votre revendeur peut l'ouvrir depuis son espace.",
  marqueBlanche:
    "La marque blanche totale — votre domaine et vos courriels — n'est pas comprise dans votre offre. Votre revendeur peut l'ouvrir depuis son espace.",
  site:
    "Le site vitrine n'est pas compris dans votre offre. Votre revendeur peut l'ouvrir depuis son espace.",
}

function versDroits(brut: unknown): Droits {
  const row = (brut ?? {}) as DroitsRow
  return {
    maxPatients: row.max_patients ?? null,
    patientesActives: Number(row.patients_actives ?? 0),
    shop: Boolean(row.shop),
    marqueBlanche: Boolean(row.marque_blanche),
    site: Boolean(row.site),
    offre: row.offre ?? 'Sans offre',
    offreCode: row.offre_code ?? '',
  }
}

/**
 * Les droits du cabinet de l'appelante.
 *
 * Lus sous SON jeton : `mes_droits()` part de `auth.uid()`, donc personne ne
 * peut lire les droits d'un cabinet qui n'est pas le sien.
 */
export async function mesDroits(token: string | null): Promise<Droits> {
  const appelant = await identifier(token)
  exigerCabinet(appelant)
  const { data, error } = await appelant.client.rpc('mes_droits')
  if (error) throw new HttpError(502, "Votre offre n'a pas pu être lue. Réessayez dans un instant.")
  if (data === null) {
    // Un cabinet sans abonnement : ce n'est pas une erreur technique, c'est
    // un contrat qui manque. On rend des droits fermés plutôt qu'une panne.
    return versDroits(null)
  }
  return versDroits(data)
}

/**
 * Les droits d'un cabinet nommé, sous les droits du client passé.
 *
 * Le client compte : `cabinet_droits()` refuse (et rend null) à qui n'est ni
 * membre du cabinet ni son revendeur. On ne lui passe donc JAMAIS le client
 * de service — ce serait contourner la seule barrière de la fonction.
 */
export async function droitsDuCabinet(cabinetId: string, client: SupabaseClient): Promise<Droits> {
  const { data, error } = await client.rpc('cabinet_droits', { p_cabinet: cabinetId })
  if (error) throw new HttpError(502, "L'offre de ce cabinet n'a pas pu être lue.")
  if (data === null) {
    throw new HttpError(403, "Ce cabinet n'est pas le vôtre.")
  }
  return versDroits(data)
}

/**
 * Un levier, lu par le serveur POUR LUI-MÊME, avec la clé de service.
 *
 * `cabinet_droits()` ne répond qu'à un membre du cabinet ou à son revendeur ;
 * elle ne rendrait donc rien ici, où c'est le serveur qui demande — pour le
 * compte d'un patient, par exemple, qui n'est ni l'un ni l'autre. On lit
 * alors les deux tables directement, avec la même règle : l'exception
 * négociée l'emporte sur l'offre.
 */
export async function levierDuCabinet(
  cabinetId: string,
  levier: Levier,
  admin: SupabaseClient,
): Promise<boolean> {
  const colonne = levier === 'marqueBlanche' ? 'marque_blanche' : levier
  const { data: abo } = await admin
    .from('subscriptions')
    .select(`plan_code, ${colonne}_override`)
    .eq('cabinet_id', cabinetId)
    .maybeSingle<Record<string, unknown>>()
  if (!abo) return false
  const exception = abo[`${colonne}_override`]
  if (exception === true || exception === false) return exception
  const { data: offre } = await admin
    .from('plans')
    .select(colonne)
    .eq('code', String(abo.plan_code ?? ''))
    .maybeSingle<Record<string, unknown>>()
  return offre?.[colonne] === true
}

/** Refuse si le levier est fermé, avec le message que l'écran affichera. */
export function exigerDroit(droits: Droits, levier: Levier): void {
  if (!droits[levier]) throw new HttpError(403, REFUS[levier])
}

/** Fiches actives encore disponibles. null = sans limite. */
export function placesRestantes(droits: Droits): number | null {
  if (droits.maxPatients === null) return null
  return Math.max(0, droits.maxPatients - droits.patientesActives)
}
