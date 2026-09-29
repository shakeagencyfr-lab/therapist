import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/*
 * Le câblage de la sécurité du compte, lu dans le source.
 *
 * La logique est éprouvée ailleurs (src/lib/doubleAuthentification.test.ts,
 * src/lib/inactivite.test.ts). Ici, les quelques lignes qui la branchent : un
 * remaniement de Root.tsx qui ouvrirait l'espace avant de demander le code,
 * ou un état renommé qui ferait fermer la session sous une captation, ne
 * lèverait aucune erreur de compilation.
 */
const src = join(dirname(fileURLToPath(import.meta.url)), '..')
const lire = (chemin: string) => readFileSync(join(src, chemin), 'utf8')

describe('la porte du second facteur', () => {
  const root = lire('Root.tsx')

  it("est demandée pour l'espace de la praticienne et du revendeur", () => {
    expect(root).toContain('<SessionProvider doubleAuthentification>')
  })

  it("passe avant l'espace : rien du dossier ne se monte derrière elle", () => {
    const porte = root.indexOf('codeADemander(niveau')
    const attente = root.indexOf("secondFacteur === 'attente'")
    const espace = root.indexOf('<AppStoreProvider\n')
    expect(attente).toBeGreaterThan(-1)
    expect(porte).toBeGreaterThan(attente)
    expect(espace).toBeGreaterThan(porte)
  })

  it("ne touche pas l'espace patient", () => {
    const patient = lire('patient-main.tsx')
    expect(patient).not.toContain('doubleAuthentification')
    expect(patient).not.toContain('GardeInactivite')
  })
})

describe("la garde d'inactivité", () => {
  it("est montée dans l'espace connecté, sous le magasin d'état", () => {
    const root = lire('Root.tsx')
    const garde = root.indexOf('<GardeInactivite')
    expect(garde).toBeGreaterThan(root.indexOf('<AppStoreProvider\n'))
    // La dernière fermeture : la première est celle du mode démonstration.
    expect(garde).toBeLessThan(root.lastIndexOf('</AppStoreProvider>'))
    expect(root.slice(0, root.indexOf('<AppStoreProvider\n'))).not.toContain('<GardeInactivite')
  })

  it('lit le drapeau que la séance pose quand le micro est ouvert', () => {
    // La garde ne ferme jamais pendant une captation : elle le sait par
    // `recording`, que l'étape d'enregistrement allume et éteint.
    expect(lire('auth/Inactivite.tsx')).toMatch(/const \{ recording \} = useAppState\(\)/)
    expect(lire('state/state.ts')).toMatch(/recording: boolean/)
    const etape = lire('views/session/RecordStep.tsx')
    expect(etape).toContain('set({ recording: true')
    expect(etape).toContain('set({ recording: false')
  })
})

describe('le QR code', () => {
  it("s'affiche dans une image, jamais injecté dans la page", () => {
    const carte = lire('views/compte/DoubleAuthentification.tsx')
    expect(carte).not.toContain('dangerouslySetInnerHTML')
    expect(carte).toMatch(/<img[\s\S]*?src=\{etape\.inscription\.image\}/)
    expect(lire('services/securiteDuCompte.ts')).toContain('adresseImageQr(data.totp.qr_code)')
  })
})
