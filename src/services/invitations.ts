/**
 * Demande au serveur d'envoyer une invitation.
 *
 * Le client ne peut pas l'envoyer lui-même : il faudrait la clé de service,
 * qui contourne la RLS et n'a rien à faire dans un navigateur. Il transmet
 * donc son propre jeton, et le serveur vérifie le droit d'inviter avec ce
 * jeton avant d'envoyer quoi que ce soit.
 */
import { supabase } from '@/lib/supabase'

export interface DemandeInvitation {
  email: string
  cabinetId: string
  kind: 'praticienne' | 'patient'
}

export interface RetourInvitation {
  ok: boolean
  message: string
}

export async function demanderInvitation(input: DemandeInvitation): Promise<RetourInvitation> {
  const db = supabase()
  if (!db) return { ok: false, message: '' }

  const { data } = await db.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, message: '' }

  try {
    const reponse = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    })
    const corps = (await reponse.json()) as { ok?: boolean; message?: string }
    return { ok: Boolean(corps.ok), message: corps.message ?? '' }
  } catch {
    return {
      ok: false,
      message:
        "Le courriel n'a pas pu être envoyé. La personne peut se connecter en entrant son adresse sur le site.",
    }
  }
}
