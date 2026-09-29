import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* Les modèles de courriels de connexion (supabase/courriels) se collent à
   la main dans Supabase : cette épreuve garde leur version de référence
   honnête avant qu'on les recopie. */
const dossier = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'courriels')
const modeles = readdirSync(dossier).filter((n) => n.endsWith('.html'))

describe('les courriels de connexion', () => {
  it('sont les quatre que Supabase envoie', () => {
    expect(modeles.sort()).toEqual(['confirmation.html', 'connexion.html', 'invitation.html', 'reinitialisation.html'])
  })

  for (const nom of modeles) {
    const html = readFileSync(join(dossier, nom), 'utf8')

    it(`${nom} : le lien ET le code, pour l'application installée`, () => {
      // Le lien mène à notre page, avec l'empreinte ; jamais au domaine de la base.
      expect(html).toMatch(/href="\{\{ if \.RedirectTo \}\}\{\{ \.RedirectTo \}\}\{\{ else \}\}\{\{ \.SiteURL \}\}\{\{ end \}\}\?token_hash=\{\{ \.TokenHash \}\}&type=(email|invite|recovery)"/)
      expect(html).not.toContain('ConfirmationURL')
      expect(html).toContain('{{ .Token }}')
    })

    it(`${nom} : rien qui se charge à l'ouverture, rien qui nomme un tiers`, () => {
      expect(html).not.toMatch(/<img|<link|<script|url\(|@import/i)
      expect(html).not.toMatch(/Shake|supabase/i)
      expect(html).toContain('lang="fr"')
    })
  }
})
