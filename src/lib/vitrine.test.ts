import { describe, expect, it } from 'vitest'
import { estDomainePersonnalise, slugDuChemin } from './vitrine'

describe('adresse de cabinet', () => {
  it('reconnaît /c/<slug>, avec ou sans barre finale', () => {
    expect(slugDuChemin('/c/cabinet-fontaine')).toBe('cabinet-fontaine')
    expect(slugDuChemin('/c/cabinet-fontaine/')).toBe('cabinet-fontaine')
  })
  it('ramène le slug en minuscules', () => {
    expect(slugDuChemin('/c/Cabinet-Fontaine')).toBe('cabinet-fontaine')
  })
  it('ignore les chemins qui ne sont pas une vitrine', () => {
    expect(slugDuChemin('/')).toBeNull()
    expect(slugDuChemin('/mon')).toBeNull()
    expect(slugDuChemin('/c/')).toBeNull()
    expect(slugDuChemin('/c/cabinet/autre-chose')).toBeNull()
    expect(slugDuChemin('/c/-tiret-devant')).toBeNull()
    expect(slugDuChemin('/c/point.interdit')).toBeNull()
  })
})

describe('estDomainePersonnalise', () => {
  /* Interroger la base à chaque chargement de notre propre domaine pour
     s'entendre répondre « non » coûte un aller-retour à chaque visite. */
  it('ne reconnaît pas les adresses de la plateforme', () => {
    expect(estDomainePersonnalise('klaroweb.site')).toBe(false)
    expect(estDomainePersonnalise('www.klaroweb.site')).toBe(false)
    expect(estDomainePersonnalise('klaro-abc.vercel.app')).toBe(false)
    expect(estDomainePersonnalise('localhost:5173')).toBe(false)
  })

  it("reconnaît le domaine d'un cabinet", () => {
    expect(estDomainePersonnalise('espace.cabinet-ollivier.fr')).toBe(true)
    expect(estDomainePersonnalise('Cabinet-Ollivier.FR')).toBe(true)
  })
})
