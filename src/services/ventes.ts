/**
 * Le livre des recettes, lu en base sous les droits du cabinet (0058).
 *
 * TOUTES LES VENTES DE LA PÉRIODE, PAS LES DERNIÈRES. La liste de la
 * boutique n'en montre que vingt ; un livre de recettes à qui il manque une
 * ligne est faux. On lit donc la période page par page, jusqu'au bout.
 *
 * La page suivante commence après le dernier identifiant lu (pagination par
 * clé, pas par rang) : une vente encaissée ou remboursée pendant la lecture
 * ne décale rien, et aucune ligne n'est lue deux fois ni sautée. L'ordre du
 * temps est rétabli ensuite, sur l'appareil (`ecrituresDuLivre`).
 */
import { supabase } from '@/lib/supabase'
import type { CommandeLue } from '@/lib/ventes'

/** Ce qu'une page rapporte au plus. Sous le plafond de l'API (1 000 lignes). */
export const PAGE_DU_LIVRE = 500

/** Au-delà, on s'arrête et on le dit : 100 000 ventes, ce n'est plus une boutique de cabinet. */
const PAGES_MAX = 200

export const SELECTION_DU_LIVRE =
  'id, title, amount_cents, currency, status, paid_at, rembourse_at, stripe_session_id, stripe_payment_intent, stripe_livemode, patient:patients (display_name)'

export type LectureDuLivre =
  | { ok: true; commandes: CommandeLue[] }
  | { ok: false; message: string }

/**
 * Les commandes encaissées OU remboursées entre `debut` (compris) et `fin`
 * (exclu), du cabinet nommé. Le cabinet est nommé et pas laissé à la RLS :
 * un compte à la fois membre d'un cabinet et patient d'un autre lirait, par
 * la politique du patient, ses propres achats avec.
 */
export async function lireLeLivre(
  cabinetId: string,
  bornes: { debut: string; fin: string },
): Promise<LectureDuLivre> {
  const db = supabase()
  if (!db) return { ok: false, message: "L'application n'est pas reliée à sa base." }
  const commandes: CommandeLue[] = []
  let apres: string | null = null
  for (let page = 0; page < PAGES_MAX; page++) {
    let requete = db
      .from('orders')
      .select(SELECTION_DU_LIVRE)
      .eq('cabinet_id', cabinetId)
      .in('status', ['payee', 'remboursee'])
      /* Les instants entre guillemets : « . » et « : » ont un sens dans la
         syntaxe du filtre, et une date ISO en contient. */
      .or(
        `and(paid_at.gte."${bornes.debut}",paid_at.lt."${bornes.fin}"),` +
          `and(rembourse_at.gte."${bornes.debut}",rembourse_at.lt."${bornes.fin}")`,
      )
      .order('id')
      .limit(PAGE_DU_LIVRE)
    if (apres) requete = requete.gt('id', apres)
    const { data, error } = await requete
    if (error) {
      // Journal technique : la cause, jamais une ligne du livre.
      console.warn('[ventes] livre illisible', error.message)
      return {
        ok: false,
        message: 'Les ventes n’ont pas pu être lues en entier. Aucun fichier n’a été fait : un livre incomplet se lirait comme complet. Réessayez dans un instant.',
      }
    }
    const lues = (data ?? []) as unknown as CommandeLue[]
    commandes.push(...lues)
    if (lues.length < PAGE_DU_LIVRE) return { ok: true, commandes }
    apres = lues[lues.length - 1].id
  }
  return {
    ok: false,
    message: 'Cette période compte trop de ventes pour un seul fichier : choisissez une période plus courte.',
  }
}

/**
 * Inscrit l'export au journal d'accès du cabinet (0058) : qui, quand, quelle
 * période, noms complets ou initiales — aucune ligne du livre. Appelée AVANT
 * de fabriquer le fichier : un export sans trace est justement celui qu'on
 * ne pourrait pas expliquer.
 */
export async function tracerExportDuLivre(
  cabinetId: string,
  periode: { du: string; au: string },
  nomsComplets: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = supabase()
  if (!db) return { ok: false, message: "L'application n'est pas reliée à sa base." }
  const { error } = await db.rpc('cabinet_tracer_export_ventes', {
    p_cabinet: cabinetId,
    p_du: periode.du,
    p_au: periode.au,
    p_noms_complets: nomsComplets,
  })
  if (error) {
    console.warn('[ventes] export non tracé', error.code)
    return {
      ok: false,
      message: 'L’export n’a pas pu être inscrit au journal de votre cabinet : le fichier n’a pas été fait. Réessayez dans un instant.',
    }
  }
  return { ok: true }
}
