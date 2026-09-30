/**
 * Ce que la praticienne a demandé à l'IA de retenir (0066, `preferences_ia`).
 *
 * Après une retouche réussie, elle peut cocher « Retenir cette préférence » :
 * sa réponse à « Que se serait-il dû passer ? » rejoint les préférences du
 * cabinet pour ce type de texte. Chaque génération du même type les relit
 * ici, avec la clé de service, et les pose À LA FIN DE LA DEMANDE — jamais
 * dans les règles du système, qui restent celles du métier. Elles s'y disent
 * pour ce qu'elles sont : des préférences, à suivre tant qu'elles ne
 * contredisent pas les règles.
 *
 * Une lecture en échec ne fait échouer aucune génération : le texte s'écrit
 * alors comme avant les préférences, et le journal le dit.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { clientAdmin } from './auth.js'
import { neutraliser } from './prompts.js'
import {
  BORNE_PREFERENCE,
  LIBELLE_CIBLE,
  PREFERENCES_LUES,
  estCibleRetouche,
  type CibleRetouche,
} from '../src/lib/retouche.js'

/** Rend le bloc de préférences à ajouter à la demande — vide s'il n'y en a pas. */
export type Preferences = (cibles: readonly CibleRetouche[]) => Promise<string>

/** Hors cabinet, en maquette : rien à relire. */
export const SANS_PREFERENCES: Preferences = async () => ''

export interface LignePreference {
  cible: CibleRetouche
  consigne: string
}

export const TITRE_PREFERENCES =
  "Préférences exprimées par la praticienne pour ce type de contenu (à suivre tant qu'elles ne contredisent pas les règles ci-dessus)"

/**
 * Le bloc posé à la fin de la demande, délimité par des balises.
 *
 * Dix au plus, les plus récentes d'abord (la lecture les range ainsi), 400
 * caractères chacune : la base les borne déjà, on ne se fie pas à elle
 * pour ce qui part vers le modèle. Chacune dit son type — une génération de
 * séance en relit trois (synthèse, message, propositions).
 */
export function blocDePreferences(lignes: readonly LignePreference[]): string {
  const retenues = lignes
    .filter((l) => estCibleRetouche(l.cible) && typeof l.consigne === 'string')
    .map((l) => ({ cible: l.cible, consigne: neutraliser(l.consigne.trim().slice(0, BORNE_PREFERENCE)) }))
    .filter((l) => l.consigne)
    .slice(0, PREFERENCES_LUES)
  if (!retenues.length) return ''
  return (
    '\n\n' +
    TITRE_PREFERENCES +
    ' :\n<preferences_de_la_praticienne>\n' +
    retenues.map((l) => '— [' + LIBELLE_CIBLE[l.cible] + '] ' + l.consigne).join('\n') +
    '\n</preferences_de_la_praticienne>'
  )
}

/**
 * Les préférences actives d'un cabinet, lues à la demande.
 *
 * La lecture n'a lieu qu'au moment d'écrire la demande — après la lecture du
 * corps, jamais pour une requête refusée ni en maquette —, et une seule fois
 * par demande.
 */
export function preferencesDuCabinet(
  cabinetId: string | null,
  db: SupabaseClient | null = clientAdmin(),
): Preferences {
  if (!cabinetId || !db) return SANS_PREFERENCES
  return async (cibles) => {
    if (!cibles.length) return ''
    try {
      const { data, error } = await db
        .from('preferences_ia')
        .select('cible, consigne')
        .eq('cabinet_id', cabinetId)
        .eq('actif', true)
        .in('cible', [...cibles])
        .order('cree_le', { ascending: false })
        .limit(PREFERENCES_LUES)
      if (error) {
        console.warn(`[ia] préférences non relues — ${error.message}`)
        return ''
      }
      return blocDePreferences((data ?? []) as LignePreference[])
    } catch (err) {
      console.warn(`[ia] préférences non relues — ${(err as Error).message}`)
      return ''
    }
  }
}
