/**
 * L'envoi d'une demande d'essai, depuis la page de vente.
 *
 * Par le serveur (api/invitations, geste « demande-essai »), jamais par la
 * base directement : c'est lui qui vérifie le CAPTCHA, et la fonction de
 * dépôt n'est ouverte qu'à lui (0060, server/demandes.ts).
 */
import type { ChampDemande, SaisieDemande } from '@/lib/demandeEssai'

export interface IssueEnvoi {
  ok: boolean
  message: string
  erreurs?: Partial<Record<ChampDemande, string>>
}

export async function envoyerDemande(
  demande: SaisieDemande,
  options: { piege: string; captcha?: string },
): Promise<IssueEnvoi> {
  try {
    const reponse = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geste: 'demande-essai', demande, piege: options.piege, captcha: options.captcha }),
      credentials: 'omit',
    })
    const lu = (await reponse.json().catch(() => ({}))) as Partial<IssueEnvoi>
    if (reponse.ok && lu.ok) return { ok: true, message: lu.message ?? 'Votre demande est bien arrivée.' }
    return {
      ok: false,
      message: lu.message ?? 'Votre demande n’a pas pu être enregistrée. Réessayez dans un instant.',
      erreurs: lu.erreurs,
    }
  } catch {
    return {
      ok: false,
      message: 'Le serveur n’a pas répondu. Vérifiez votre connexion, puis réessayez : rien n’a été enregistré.',
    }
  }
}
