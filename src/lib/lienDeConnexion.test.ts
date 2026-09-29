import { describe, expect, it } from 'vitest'
import { lienVersLaPage, lireJetonDeLien, retirerJetonDeLien } from './lienDeConnexion'

const EMPREINTE = 'pkce_0a1b2c3d4e5f60718293a4b5c6d7e8f9'

describe('le lien des courriels', () => {
  it('mène à la page d’arrivée, sur notre domaine, avec l’empreinte', () => {
    expect(lienVersLaPage('https://klaroweb.site/cabinet-x/mon', EMPREINTE, 'invite')).toBe(
      `https://klaroweb.site/cabinet-x/mon?token_hash=${EMPREINTE}&type=invite`,
    )
  })

  it('se lit à l’arrivée, et seulement s’il se tient', () => {
    expect(lireJetonDeLien(`?token_hash=${EMPREINTE}&type=email`)).toEqual({ tokenHash: EMPREINTE, type: 'email' })
    expect(lireJetonDeLien(`?token_hash=${EMPREINTE}&type=admin`)).toBeNull()
    expect(lireJetonDeLien('?token_hash=<script>&type=email')).toBeNull()
    expect(lireJetonDeLien('?type=email')).toBeNull()
    expect(lireJetonDeLien('')).toBeNull()
  })

  it('s’efface de l’adresse une fois échangé, sans toucher au reste', () => {
    expect(retirerJetonDeLien(`https://klaroweb.site/mon?token_hash=${EMPREINTE}&type=email`)).toBe('/mon')
    expect(retirerJetonDeLien(`https://klaroweb.site/?onglet=journal&token_hash=${EMPREINTE}&type=email#haut`)).toBe(
      '/?onglet=journal#haut',
    )
  })
})
