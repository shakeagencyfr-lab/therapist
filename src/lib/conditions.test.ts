import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { textesDe, PAGES_LEGALES } from '@/legal/contenu'
import { DOCUMENTS_ACCEPTES, ECHECS_AVANT_PASSAGE, etatDesConditions, LECTURES_AVANT_OUVERTURE, LIBELLE_CASE } from './conditions'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const lire = (chemin: string) => readFileSync(join(racine, chemin), 'utf8')

const V = '30 septembre 2026'

describe('l’état des conditions d’un compte', () => {
  it('est accepté quand les deux documents le sont dans la version en cours', () => {
    expect(etatDesConditions([{ document: 'cgv', version: V }, { document: 'cgu', version: V }], V)).toEqual({
      acceptee: true,
      miseAJour: false,
    })
  })

  it('redemande un accord incomplet', () => {
    expect(etatDesConditions([{ document: 'cgv', version: V }], V).acceptee).toBe(false)
  })

  it('distingue la première fois de la mise à jour', () => {
    expect(etatDesConditions([], V)).toEqual({ acceptee: false, miseAJour: false })
    const avant = [
      { document: 'cgv', version: '1er juin 2026' },
      { document: 'cgu', version: '1er juin 2026' },
    ]
    expect(etatDesConditions(avant, V)).toEqual({ acceptee: false, miseAJour: true })
  })

  it('couvre exactement les deux documents que la base pose', () => {
    expect([...DOCUMENTS_ACCEPTES].sort()).toEqual(['cgu', 'cgv'])
    expect(lire('supabase/migrations/0067_les_conditions_acceptees.sql')).toMatch(
      /values \(v_user, 'cgv', v_version\), \(v_user, 'cgu', v_version\)/,
    )
  })
})

describe('la garde des conditions', () => {
  /* Une panne de lecture ne doit pas enfermer dehors : elle se retente, puis
     laisse entrer. */
  it('se retente, puis s’ouvre, et ne bloque jamais sans fin', () => {
    expect(LECTURES_AVANT_OUVERTURE).toBeGreaterThanOrEqual(2)
    expect(ECHECS_AVANT_PASSAGE).toBeGreaterThanOrEqual(2)
    const garde = lire('src/auth/GardeConditions.tsx')
    expect(garde).toMatch(/console\.error\(`\[conditions\] lecture impossible/)
    expect(garde).toMatch(/Continuer pour l’instant/)
  })

  it('dit la case mot pour mot comme les conditions de vente', () => {
    expect(textesDe(PAGES_LEGALES.cgv).join('\n')).toContain(`« ${LIBELLE_CASE} »`)
    expect(lire('src/vente/Formulaire.tsx')).toMatch(/J’ai lu et j’accepte les/)
  })

  /* L'espace patient est une autre application (src/patient) : la garde n'y
     entre jamais. */
  it('n’est posée que devant l’espace des cabinets et des revendeurs', () => {
    expect(lire('src/Root.tsx')).toMatch(/<GardeConditions>\s*<App \/>\s*<\/GardeConditions>/)
    for (const fichier of ['src/patient-main.tsx', 'src/patient/PatientSpace.tsx', 'src/embed-main.tsx']) {
      expect(lire(fichier), fichier).not.toMatch(/GardeConditions/)
    }
  })
})
