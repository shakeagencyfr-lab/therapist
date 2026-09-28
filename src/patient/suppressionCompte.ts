/**
 * Supprimer son compte, vu du navigateur.
 *
 * Deux écrans y mènent : « Moi », dans l'espace ouvert, et l'avis « Aucun
 * suivi en cours » qu'on lit une fois le suivi clos — où, jusqu'ici, rien ne
 * permettait de partir. Le geste est le même des deux côtés, et le serveur
 * retrouve lui-même la fiche close (server/compte.ts) : il ne vit donc qu'ici.
 */
import { oublierLesBrouillons } from '@/lib/brouillon'
import { cheminDeLEspace } from '@/lib/rappels'
import { supabase } from '@/lib/supabase'
import { oublierCeTelephone } from './rappelsNavigateur'

/**
 * Demande la suppression, puis referme tout ce que cet appareil garde.
 *
 * Rend le message d'échec à afficher, ou null — et alors la page est déjà
 * en train de repartir vers la porte.
 */
export async function supprimerCeCompte(seDeconnecter: () => Promise<void>): Promise<string | null> {
  const db = supabase()
  if (!db) return "L'application n'est pas reliée à sa base. Réessayez plus tard."
  const { data } = await db.auth.getSession()
  const jeton = data.session?.access_token ?? ''
  try {
    const reponse = await fetch('/api/compte', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ geste: 'supprimer' }),
    })
    const lu = (await reponse.json().catch(() => ({}))) as { message?: string }
    if (!reponse.ok) return lu.message ?? "La suppression n'a pas abouti. Réessayez."
  } catch {
    return 'Le serveur est injoignable. Réessayez dans un instant.'
  }
  // Le compte n'existe plus : la session qui reste ouverte n'ouvre rien.
  // Ses inscriptions aux rappels sont parties avec lui en base ; le
  // navigateur, lui, garderait la sienne sans ce geste — et les brouillons
  // de l'onglet, sans l'autre.
  await oublierCeTelephone()
  oublierLesBrouillons()
  await seDeconnecter()
  // On reste à la porte du cabinet (/son-cabinet/mon, ou /mon sur son
  // domaine) : /mon tout court aurait perdu sa marque.
  window.location.replace(cheminDeLEspace(window.location.pathname))
  return null
}
