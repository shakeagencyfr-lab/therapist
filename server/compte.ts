/**
 * Le compte : ce que chacun peut en faire lui-même.
 *
 * Deux gestes. Changer son mot de passe, pour tous les rôles (plus bas).
 * Supprimer son compte, pour un patient — le plus délicat du produit :
 *
 * SUPPRIMER SON COMPTE N'EFFACE PAS SON DOSSIER. Le dossier de suivi — les
 * séances, le profil, ce que la thérapeute y a noté — appartient au cabinet,
 * qui en est le détenteur et a l'obligation de le conserver. Ce que ce geste
 * supprime, c'est l'ACCÈS : le compte d'authentification disparaît, la fiche
 * est détachée de lui, l'espace se referme. La thérapeute retrouve une fiche
 * sans compte lié, exactement comme avant la première connexion.
 *
 * LE JOURNAL PART AVEC LE COMPTE. Il n'est pas au cabinet : c'est ce que
 * cette personne a écrit pour elle, et les pages qu'elle avait partagées
 * l'étaient à sa main. On les efface avec le reste.
 *
 * L'ordre compte, et il n'est pas négociable : d'abord effacer le journal et
 * détacher la fiche, ENSUITE supprimer le compte. Dans l'autre sens, un échec
 * à mi-parcours laisserait une fiche rattachée à un compte qui n'existe plus
 * — donc un dossier que plus personne ne peut ouvrir, et que la thérapeute ne
 * pourrait pas rendre à sa patiente.
 */
import { entreeParLienRecente, lireEntrees, refusDuNouveau } from '../src/lib/motDePasse.js'
import { clientAdmin, identifier } from './auth.js'
import { HttpError } from './errors.js'

export interface RetourCompte {
  ok: true
  message: string
}

/**
 * Ce que la suppression demande à la base — séparé pour s'éprouver sans elle.
 *
 * Chaque écriture rend le motif technique de son échec, ou null : le motif va
 * au journal du serveur, l'écran reçoit une phrase française.
 */
export interface PorteSuppression {
  /**
   * La fiche rattachée à ce compte, ACTIVE OU CLOSE, ou null s'il n'en a pas.
   * Lève si elle n'a pas pu être cherchée : dans le doute, on ne supprime rien.
   */
  ficheRattachee(userId: string): Promise<string | null>
  effacerJournal(patientId: string): Promise<string | null>
  detacher(patientId: string): Promise<string | null>
  supprimerCompte(userId: string): Promise<string | null>
}

/** Qui demande, tel que la base le reconnaît. */
export interface QuiSupprime {
  userId: string
  /** La fiche ACTIVE que `my_context` a vue, ou null. */
  patientId: string | null
  /** Le compte porte-t-il aussi un espace de cabinet ou de revendeur ? */
  autreRole: boolean
}

/**
 * La suppression elle-même, une fois l'appelant reconnu.
 *
 * UN SUIVI CLOS N'EMPÊCHE PAS DE PARTIR. `my_context` ne voit que les fiches
 * actives : quand la thérapeute clôt le suivi, l'espace se ferme et le compte
 * ne « voyait » plus de fiche — le geste répondait 403, et la personne restait
 * avec un compte et un journal qu'elle ne pouvait plus effacer. La fiche close
 * reste pourtant rattachée à ce compte, journal compris : on la retrouve par
 * la clé de service, et on fait le même chemin qu'avec une fiche active.
 *
 * Un compte sans aucune fiche ni autre rôle — la fiche a été supprimée par le
 * cabinet, ou l'adresse n'a jamais été attendue — peut aussi partir : il n'y
 * a rien à détacher, seulement un compte vide à fermer.
 */
export async function appliquerSuppression(qui: QuiSupprime, porte: PorteSuppression): Promise<RetourCompte> {
  const patientId = qui.patientId ?? (await porte.ficheRattachee(qui.userId))

  // Un compte professionnel sans fiche : ce bouton n'a rien à fermer, et
  // supprimer le compte emporterait l'espace professionnel.
  if (!patientId && qui.autreRole) {
    throw new HttpError(403, "Ce geste est réservé à l'espace d'un patient.")
  }

  if (patientId) {
    // 1. Son journal, qui est à elle ou à lui.
    const eJournal = await porte.effacerJournal(patientId)
    if (eJournal) {
      console.error(`[compte] journal — ${eJournal}`)
      throw new HttpError(502, "Votre journal n'a pas pu être effacé. Rien n'a été supprimé ; réessayez.")
    }

    // 2. La fiche est détachée, pas supprimée : elle reste le dossier du cabinet.
    const eFiche = await porte.detacher(patientId)
    if (eFiche) {
      console.error(`[compte] détachement — ${eFiche}`)
      throw new HttpError(502, "Votre compte n'a pas pu être détaché. Réessayez dans un instant.")
    }
  }

  // 3. Le compte lui-même, en dernier — SAUF s'il porte un autre rôle.
  //
  // Un même compte peut être praticienne (ou revendeur) ET patient : une
  // thérapeute qui essaie l'espace de ses patients avec sa propre adresse, par
  // exemple. Supprimer le compte emporterait alors, par cascade, son
  // appartenance au cabinet — donc l'accès à tous ses dossiers. Ce bouton
  // ferme l'espace PATIENT : on s'arrête à la fiche détachée et au journal
  // effacé, et on le dit.
  if (qui.autreRole) {
    return {
      ok: true,
      message:
        "Votre espace patient est refermé et votre journal effacé. Votre compte, lui, reste ouvert : il porte aussi votre espace professionnel.",
    }
  }
  const eCompte = await porte.supprimerCompte(qui.userId)
  if (eCompte) {
    console.error(`[compte] suppression — ${eCompte}`)
    // La fiche est déjà détachée : l'espace est fermé, le compte survit.
    // Mieux vaut le dire que laisser croire à une suppression complète.
    throw new HttpError(
      502,
      patientId
        ? "Votre espace est refermé et votre journal effacé, mais votre compte n'a pas pu être supprimé. Prévenez votre cabinet."
        : "Votre compte n'a pas pu être supprimé. Réessayez dans un instant.",
    )
  }

  return {
    ok: true,
    message: patientId ? 'Votre compte est supprimé, et votre journal effacé.' : 'Votre compte est supprimé.',
  }
}

/** La porte réelle : la clé de service, qui voit aussi les fiches closes. */
function porteDeSuppression(db: NonNullable<ReturnType<typeof clientAdmin>>): PorteSuppression {
  return {
    async ficheRattachee(userId) {
      // `auth_user_id` est unique : un compte tient une fiche au plus.
      const { data, error } = await db
        .from('patients')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle<{ id: string }>()
      if (error) {
        console.error(`[compte] recherche de la fiche — ${error.message}`)
        throw new HttpError(502, "Votre fiche n'a pas pu être retrouvée. Rien n'a été supprimé ; réessayez.")
      }
      return data?.id ?? null
    },
    async effacerJournal(patientId) {
      const { error } = await db.from('journal_pages').delete().eq('patient_id', patientId)
      return error?.message ?? null
    },
    async detacher(patientId) {
      const { error } = await db.from('patients').update({ auth_user_id: null }).eq('id', patientId)
      return error?.message ?? null
    },
    async supprimerCompte(userId) {
      const { error } = await db.auth.admin.deleteUser(userId)
      return error?.message ?? null
    },
  }
}

export async function supprimerCompte(token: string | null): Promise<RetourCompte> {
  const appelant = await identifier(token)
  const db = clientAdmin()
  if (!db) {
    throw new HttpError(503, "Le serveur n'est pas configuré pour ce geste. Prévenez votre cabinet.")
  }
  return appliquerSuppression(
    {
      userId: appelant.userId,
      patientId: appelant.patientId,
      autreRole: Boolean(appelant.cabinetId || appelant.resellerId),
    },
    porteDeSuppression(db),
  )
}

/* ------------------------------------------------------------------ *
 * Changer son mot de passe
 * ------------------------------------------------------------------ */

/**
 * Ce que le changement demande au service d'authentification — séparé pour
 * s'éprouver sans lui.
 */
export interface PorteMotDePasse {
  /** Le mot de passe actuel est-il le bon ? (fonction réservée au serveur) */
  verifier(userId: string, motDePasse: string): Promise<'ok' | 'faux' | 'trop' | 'inconnu'>
  /** Pose le nouveau mot de passe ; rend un refus lisible, ou null. */
  remplacer(userId: string, motDePasse: string): Promise<string | null>
  /** Ferme toutes les sessions du compte sauf celle qui porte ce jeton. */
  fermerLesAutres(jeton: string): Promise<boolean>
}

export interface DemandeMotDePasse {
  ancien: string
  nouveau: string
}

/** Le corps de la requête, lu sans lui faire confiance. */
export function lireDemandeMotDePasse(corps: unknown): DemandeMotDePasse {
  const c = (corps ?? {}) as { ancien?: unknown; nouveau?: unknown }
  return {
    ancien: typeof c.ancien === 'string' ? c.ancien : '',
    nouveau: typeof c.nouveau === 'string' ? c.nouveau : '',
  }
}

export const ANCIEN_REQUIS =
  "Entrez votre mot de passe actuel. Vous l'avez oublié, ou n'en avez jamais choisi ? Reconnectez-vous par un lien reçu par courriel : pendant 24 heures, vous pourrez en choisir un sans l'ancien."

/**
 * Le changement lui-même, une fois l'appelant reconnu.
 *
 * Deux preuves valent (voir src/lib/motDePasse.ts) : le mot de passe actuel,
 * ou une entrée par lien de moins de vingt-quatre heures. Quand l'ancien est
 * saisi, il est éprouvé même si le lien suffisait : un mot de passe faux ne
 * doit jamais passer, d'où qu'on vienne.
 *
 * Le mot de passe changé, les AUTRES appareils sont déconnectés. C'est ce
 * qu'on attend d'un changement fait parce qu'on craint qu'il ait fuité : une
 * session ouverte ailleurs par quelqu'un d'autre se ferme avec l'ancien.
 */
export async function appliquerChangementDeMotDePasse(
  qui: { userId: string; email: string | null; jeton: string },
  demande: DemandeMotDePasse,
  porte: PorteMotDePasse,
  maintenant: number,
): Promise<RetourCompte> {
  const refus = refusDuNouveau(demande.nouveau, qui.email)
  if (refus) throw new HttpError(400, refus)

  if (demande.ancien) {
    if (demande.ancien === demande.nouveau) {
      throw new HttpError(400, "Le nouveau mot de passe est identique à l'actuel : choisissez-en un autre.")
    }
    const verdict = await porte.verifier(qui.userId, demande.ancien)
    if (verdict === 'trop') {
      throw new HttpError(429, 'Trop d’essais manqués. Patientez un quart d’heure, ou reconnectez-vous par un lien reçu par courriel.')
    }
    if (verdict === 'inconnu') {
      throw new HttpError(409, "Votre mot de passe actuel ne peut pas être vérifié ici. Reconnectez-vous par un lien reçu par courriel : vous pourrez alors en choisir un nouveau.")
    }
    if (verdict !== 'ok') throw new HttpError(403, 'Mot de passe actuel incorrect.')
  } else if (!entreeParLienRecente(lireEntrees(qui.jeton), maintenant)) {
    throw new HttpError(403, ANCIEN_REQUIS)
  }

  const refusDuService = await porte.remplacer(qui.userId, demande.nouveau)
  if (refusDuService) throw new HttpError(422, refusDuService)

  const fermes = await porte.fermerLesAutres(qui.jeton)
  return {
    ok: true,
    message: fermes
      ? 'Mot de passe enregistré. Vos autres appareils ont été déconnectés.'
      : "Mot de passe enregistré. Vos autres appareils n'ont pas pu être déconnectés : faites-le depuis cet écran.",
  }
}

/** La porte réelle : la fonction SQL réservée au serveur, et l'API d'administration. */
function porteDe(db: NonNullable<ReturnType<typeof clientAdmin>>): PorteMotDePasse {
  return {
    async verifier(userId, motDePasse) {
      const { data, error } = await db.rpc('verifier_mot_de_passe', {
        p_user: userId,
        p_mot_de_passe: motDePasse,
      })
      if (error) {
        console.error(`[compte] vérification — ${error.message}`)
        throw new HttpError(502, "Votre mot de passe actuel n'a pas pu être vérifié. Réessayez dans un instant.")
      }
      return data === 'ok' || data === 'trop' || data === 'inconnu' ? data : 'faux'
    },
    async remplacer(userId, motDePasse) {
      const { error } = await db.auth.admin.updateUserById(userId, { password: motDePasse })
      if (!error) return null
      console.error(`[compte] mot de passe — ${error.status ?? '?'} ${error.code ?? ''} ${error.message}`)
      if (error.code === 'weak_password' || /weak|pwned|leaked|characters/i.test(error.message)) {
        return 'Ce mot de passe est trop faible, ou il circule déjà dans des fuites connues. Allongez-le, ou assemblez trois mots sans rapport.'
      }
      throw new HttpError(502, "Le mot de passe n'a pas pu être enregistré. Réessayez dans un instant.")
    },
    async fermerLesAutres(jeton) {
      const { error } = await db.auth.admin.signOut(jeton, 'others')
      if (error) console.error(`[compte] déconnexion des autres — ${error.message}`)
      return !error
    },
  }
}

export async function changerMotDePasse(token: string | null, corps: unknown): Promise<RetourCompte> {
  const appelant = await identifier(token)
  const db = clientAdmin()
  if (!db) {
    throw new HttpError(503, "Le serveur n'est pas configuré pour ce geste. Réessayez plus tard.")
  }
  return appliquerChangementDeMotDePasse(
    { userId: appelant.userId, email: appelant.email, jeton: token as string },
    lireDemandeMotDePasse(corps),
    porteDe(db),
    Date.now(),
  )
}

/**
 * Les gestes du compte, aiguillés au même endroit pour les deux enveloppes
 * (Express en local, fonction Vercel en production) : un geste ajouté ici
 * existe partout, jamais dans l'une seulement.
 */
export async function gesteDuCompte(token: string | null, corps: unknown): Promise<RetourCompte> {
  const geste = String((corps as { geste?: unknown } | undefined)?.geste ?? '')
  if (geste === 'supprimer') return supprimerCompte(token)
  if (geste === 'mot-de-passe') return changerMotDePasse(token, corps)
  throw new HttpError(400, 'Geste inconnu.')
}
