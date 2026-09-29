/**
 * La charge d'un jeton d'accès, LUE sans être vérifiée.
 *
 * Écrite une fois : le changement de mot de passe (`amr`, motDePasse.ts) et
 * la double authentification (`aal`, doubleAuthentification.ts) la lisaient
 * chacun à sa façon. Rien n'est décidé sur cette seule lecture : côté
 * serveur, le jeton a déjà été éprouvé par la base ; côté écran, ce qu'on lit
 * ne décide que de l'affichage.
 *
 * Sans aucun import : le serveur charge ce module tel quel.
 */
export function chargeDuJeton(jeton: string | null | undefined): Record<string, unknown> | null {
  if (!jeton) return null
  const partie = jeton.split('.')[1]
  if (!partie) return null
  try {
    const base64 = partie.replace(/-/g, '+').replace(/_/g, '/')
    const complet = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const charge = JSON.parse(atob(complet)) as unknown
    return charge && typeof charge === 'object' ? (charge as Record<string, unknown>) : null
  } catch {
    return null
  }
}
