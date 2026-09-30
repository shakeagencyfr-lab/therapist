/**
 * Lire et enregistrer l'acceptation des conditions générales (0067).
 *
 * La lecture passe par la table, sous la RLS : un compte ne voit que ses
 * propres lignes. L'écriture passe par `accepter_conditions()`, qui pose les
 * deux documents pour le compte connecté et pour lui seul — la table n'est
 * ouverte en écriture à personne depuis le navigateur.
 *
 * Chaque geste rend `{ ok, … }` ou `{ ok: false, message }` : l'écran n'a
 * jamais à lire une erreur de la base. Aucun contenu n'est journalisé — un
 * code d'erreur suffit à comprendre une panne.
 */
import {
  DELAI_LECTURE_CONDITIONS_MS,
  etatDesConditions,
  type EtatDesConditions,
  type LigneAcceptation,
} from '@/lib/conditions'
import { supabase } from '@/lib/supabase'

export type Lecture = ({ ok: true } & EtatDesConditions) | { ok: false; message: string }

const SANS_BASE = "L'application n'est pas reliée à sa base."

/** Une promesse bornée : au-delà du délai, elle rend l'échec prévu. */
function borne<T>(promesse: PromiseLike<T>, delaiMs: number, echec: T): Promise<T> {
  return new Promise<T>((resoudre) => {
    const minuteur = setTimeout(() => resoudre(echec), delaiMs)
    Promise.resolve(promesse).then(
      (valeur) => {
        clearTimeout(minuteur)
        resoudre(valeur)
      },
      () => {
        clearTimeout(minuteur)
        resoudre(echec)
      },
    )
  })
}

/** Les acceptations du compte connecté, et ce qu'elles disent de la version en cours. */
export async function lireConditions(version: string): Promise<Lecture> {
  const db = supabase()
  if (!db) return { ok: false, message: SANS_BASE }
  const echec: Lecture = { ok: false, message: 'délai dépassé' }
  return borne(
    db
      .from('conditions_acceptees')
      .select('document, version')
      .limit(200)
      .then(({ data, error }): Lecture => {
        if (error) return { ok: false, message: `${error.code ?? ''} ${error.message}`.trim() }
        return { ok: true, ...etatDesConditions((data ?? []) as LigneAcceptation[], version) }
      }),
    DELAI_LECTURE_CONDITIONS_MS,
    echec,
  )
}

/** Enregistre l'acceptation des deux documents, dans cette version. */
export async function accepterConditions(version: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = supabase()
  if (!db) return { ok: false, message: SANS_BASE }
  return borne(
    db.rpc('accepter_conditions', { p_version: version }).then(({ error }) =>
      error
        ? { ok: false as const, message: `${error.code ?? ''} ${error.message}`.trim() }
        : { ok: true as const },
    ),
    DELAI_LECTURE_CONDITIONS_MS,
    { ok: false as const, message: 'délai dépassé' },
  )
}
