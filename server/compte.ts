/**
 * Le compte d'un patient : ce qu'il peut en faire lui-même.
 *
 * Un seul geste pour l'instant, et c'est le plus délicat du produit.
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

  // 3. Le compte lui-même, en dernier.
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
