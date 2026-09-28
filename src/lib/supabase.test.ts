import { describe, expect, it } from 'vitest'
import { requetePublique } from './supabase'

describe('requetePublique', () => {
  const { adresse, init } = requetePublique(
    'https://exemple.supabase.co/',
    'sb_publishable_test',
    'cabinet_vitrine',
    { p_slug: 'cabinet-fontaine' },
  )
  const entetes = init.headers as Record<string, string>

  it('vise la fonction par l’API REST, sans double barre', () => {
    expect(adresse).toBe('https://exemple.supabase.co/rest/v1/rpc/cabinet_vitrine')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ p_slug: 'cabinet-fontaine' })
  })

  /* Tout l'intérêt : ne rien attendre de la session. Un jeton joint ici
     supposerait de l'avoir d'abord obtenu — c'est-à-dire d'attendre la
     reprise de session, qui peut durer trente secondes. */
  it('ne porte que la clé publiable, jamais un jeton de session', () => {
    expect(entetes.apikey).toBe('sb_publishable_test')
    expect(entetes.Authorization).toBe('Bearer sb_publishable_test')
    expect(init.credentials).toBe('omit')
  })
})
