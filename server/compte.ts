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

export async function supprimerCompte(token: string | null): Promise<RetourCompte> {
  const appelant = await identifier(token)
  if (!appelant.patientId) {
    throw new HttpError(403, "Ce geste est réservé à l'espace d'un patient.")
  }
  const db = clientAdmin()
  if (!db) {
    throw new HttpError(503, "Le serveur n'est pas configuré pour ce geste. Prévenez votre cabinet.")
  }
  const patientId = appelant.patientId
  const userId = appelant.userId

  // 1. Son journal, qui est à elle.
  const { error: eJournal } = await db.from('journal_pages').delete().eq('patient_id', patientId)
  if (eJournal) {
    console.error(`[compte] journal — ${eJournal.message}`)
    throw new HttpError(502, "Votre journal n'a pas pu être effacé. Rien n'a été supprimé ; réessayez.")
  }

  // 2. La fiche est détachée, pas supprimée : elle reste le dossier du cabinet.
  const { error: eFiche } = await db
    .from('patients')
    .update({ auth_user_id: null })
    .eq('id', patientId)
  if (eFiche) {
    console.error(`[compte] détachement — ${eFiche.message}`)
    throw new HttpError(502, "Votre compte n'a pas pu être détaché. Réessayez dans un instant.")
  }

  // 3. Le compte lui-même, en dernier — SAUF s'il porte un autre rôle.
  //
  // Un même compte peut être praticienne (ou revendeur) ET patient : une
  // thérapeute qui essaie l'espace de ses patients avec sa propre adresse, par
  // exemple. Supprimer le compte emporterait alors, par cascade, son
  // appartenance au cabinet — donc l'accès à tous ses dossiers. Ce bouton
  // ferme l'espace PATIENT : on s'arrête à la fiche détachée et au journal
  // effacé, et on le dit.
  if (appelant.cabinetId || appelant.resellerId) {
    return {
      ok: true,
      message:
        "Votre espace patient est refermé et votre journal effacé. Votre compte, lui, reste ouvert : il porte aussi votre espace professionnel.",
    }
  }
  if (userId) {
    const { error } = await db.auth.admin.deleteUser(userId)
    if (error) {
      // La fiche est déjà détachée : l'espace est fermé, le compte survit.
      // Mieux vaut le dire que laisser croire à une suppression complète.
      console.error(`[compte] suppression — ${error.message}`)
      throw new HttpError(
        502,
        "Votre espace est refermé et votre journal effacé, mais votre compte n'a pas pu être supprimé. Prévenez votre cabinet.",
      )
    }
  }

  return { ok: true, message: 'Votre compte est supprimé.' }
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
