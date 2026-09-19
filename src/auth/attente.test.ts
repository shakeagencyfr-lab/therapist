import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * RIEN NE DOIT RETENIR LA PAGE SANS FIN.
 *
 * L'application s'arrêtait sur « Vérification de votre accès… », page
 * blanche, jusqu'à une demi-minute — puis montrait la porte d'entrée. La
 * cause n'est pas chez nous : la reprise de session appartient à
 * @supabase/auth-js, et quand le rafraîchissement du jeton échoue pour une
 * raison réseau, `_refreshAccessToken()` réessaie avec un recul qui double à
 * chaque fois, tant que le prochain essai tient dans les trente secondes de
 * `AUTO_REFRESH_TICK_DURATION_MS`. `getSession()` ne rend pas la main de tout
 * ce temps, et l'événement `INITIAL_SESSION` n'arrive pas davantage : les
 * deux voies qui décident de la phase étaient donc bloquées ensemble.
 *
 * La parade tient en un minuteur : passé le délai, on montre la porte. Elle
 * est fragile à la relecture — l'effet est court, le minuteur y ressemble à
 * du décor, et le défaut qu'il évite ne se voit qu'avec un réseau en panne.
 * D'où cette épreuve sur le texte du fichier : elle ne vérifie pas le
 * comportement, elle empêche de retirer la garde sans s'en apercevoir.
 *
 * Ce fichier est en .ts et non en .tsx à dessein : le banc de Vitest ne
 * ramasse que les .ts, et monter un fournisseur React n'apprendrait rien de
 * plus que ce qui est vérifié ici.
 */
const ici = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(ici, 'session.tsx'), 'utf8')

describe('la reprise de session a une fin', () => {
  it('se donne un délai, et court', () => {
    const delai = /const DELAI_VERIFICATION_MS = ([\d_]+)/.exec(source)
    expect(delai).not.toBeNull()
    const ms = Number(delai?.[1].replace(/_/g, ''))
    // Assez long pour qu'une reprise saine aboutisse, assez court pour qu'on
    // n'ait pas l'impression que la page est morte.
    expect(ms).toBeGreaterThanOrEqual(2_000)
    expect(ms).toBeLessThanOrEqual(6_000)
    expect(source).toContain('setTimeout(')
    expect(source).toContain('DELAI_VERIFICATION_MS')
  })

  it('montre la porte plutôt que de rester en chargement', () => {
    expect(source).toMatch(/p === 'chargement' \? 'deconnecte' : p/)
  })

  /* Le minuteur doit mourir avec l'effet, et dès que la reprise a parlé :
     sinon il renverrait une praticienne déjà connectée sur la porte. */
  it('désarme le minuteur au démontage comme à la réponse', () => {
    expect(source.match(/clearTimeout\(minuteur\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  /* Sans ce mot, la porte s'affiche sans rien dire, et qui était connectée
     croit l'avoir été déconnectée. */
  it('dit à la porte que la vérification court encore', () => {
    expect(source).toContain('verificationLente')
    const porte = readFileSync(join(ici, 'SignIn.tsx'), 'utf8')
    expect(porte).toContain('verificationLente')
    expect(porte).toMatch(/s'ouvrira tout seul/)
  })
})
