/**
 * Effacer une image du cabinet de NOTRE stockage, depuis le navigateur.
 *
 * Pour les fichiers déposés dans un brouillon puis retirés avant d'avoir été
 * enregistrés, et pour l'ancien logo une fois le nouveau publié. Le fichier
 * est public tant qu'il existe : le retirer de l'écran sans l'effacer le
 * laissait en ligne pour toujours, à une adresse qui a pu circuler.
 *
 * Sous la RLS de la personne connectée : les politiques du compartiment ne la
 * laissent toucher qu'au dossier de son cabinet, et `cheminStockage` ne rend
 * rien pour une autre adresse. Un échec n'arrête rien — le geste de l'écran a
 * eu lieu, et un fichier orphelin ne se voit de nulle part.
 */
import { cheminStockage, type Compartiment } from './photosSite'
import { supabase } from './supabase'

const env = import.meta.env ?? {}
const BASE = String(env.VITE_SUPABASE_URL ?? '')

export async function effacerDuStockage(
  compartiment: Compartiment,
  url: string | null | undefined,
  cabinetId: string,
): Promise<void> {
  const db = supabase()
  const chemin = cheminStockage(url, BASE, compartiment, cabinetId)
  if (!db || !chemin) return
  const { error } = await db.storage.from(compartiment).remove([chemin])
  if (error) console.warn(`[stockage] ${compartiment} — ${error.message}`)
}
