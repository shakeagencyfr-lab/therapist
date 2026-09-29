import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { problemeIdentifiant } from '@/lib/identifiant'
import { CHEMINS_RESERVES, slugDuChemin } from '@/lib/vitrine'

/**
 * LA PORTE DES PRATICIENNES N'EST PAS UN CABINET.
 *
 * /connexion vit à la racine, là où vivent les adresses des cabinets. Le mot
 * doit donc être réservé des deux côtés : à l'écran (src/lib/vitrine.ts), et
 * en base, par la contrainte `cabinets_slug_forme` (0037) — relevée en
 * production le 29 septembre 2026, identique au fichier. Les mots voisins
 * qu'une page produit réclamera un jour le sont aussi.
 */
const MOTS = ['connexion', 'espace', 'inscription', 'login']

const migration = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations', '0037_un_seul_identifiant.sql'),
  'utf8',
)

describe('les chemins de la porte', () => {
  it('sont réservés à l’écran', () => {
    for (const mot of MOTS) {
      expect(CHEMINS_RESERVES.has(mot), mot).toBe(true)
      expect(problemeIdentifiant(mot), mot).toBeTruthy()
    }
  })

  it('ne sont jamais lus comme l’adresse d’un cabinet', () => {
    for (const mot of MOTS) {
      expect(slugDuChemin(`/${mot}`), mot).toBeNull()
      expect(slugDuChemin(`/${mot}/`), mot).toBeNull()
    }
  })

  it('sont refusés par la base', () => {
    const contrainte = /add constraint cabinets_slug_forme check \(([\s\S]*?)\);/.exec(migration)?.[1] ?? ''
    for (const mot of MOTS) expect(contrainte, mot).toContain(`'${mot}'`)
  })
})
