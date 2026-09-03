import { describe, expect, it } from 'vitest'
import { dnsAttendus, nettoyerDomaine } from './domaines'
import { HttpError } from './errors'

describe('nettoyerDomaine', () => {
  it("accepte ce qu'on colle vraiment : protocole, majuscules, barre finale", () => {
    expect(nettoyerDomaine('https://Espace.Cabinet-Ollivier.FR/')).toBe('espace.cabinet-ollivier.fr')
    expect(nettoyerDomaine('  cabinet-ollivier.fr.  ')).toBe('cabinet-ollivier.fr')
  })

  it('refuse une adresse électronique, et le dit', () => {
    expect(() => nettoyerDomaine('contact@cabinet.fr')).toThrow(HttpError)
    expect(() => nettoyerDomaine('contact@cabinet.fr')).toThrow(/adresse électronique/)
  })

  it("refuse ce qui n'est pas un domaine", () => {
    expect(() => nettoyerDomaine('')).toThrow(/Entrez le domaine/)
    expect(() => nettoyerDomaine('sanspoint')).toThrow(/pas valide/)
    expect(() => nettoyerDomaine('-tiret-devant.fr')).toThrow(/pas valide/)
  })

  /* Poser le domaine de la plateforme reviendrait à demander à l'hébergeur de
     rattacher notre propre adresse au cabinet d'un client. */
  it('refuse les adresses de la plateforme', () => {
    expect(() => nettoyerDomaine('klaroweb.site')).toThrow(/celui de la plateforme/)
    expect(() => nettoyerDomaine('espace.klaroweb.site')).toThrow(/celui de la plateforme/)
    expect(() => nettoyerDomaine('klaro.vercel.app')).toThrow(/celui de la plateforme/)
  })
})

describe('dnsAttendus', () => {
  /* Un domaine racine ne peut pas porter de CNAME : c'est le RFC, pas une
     limite de l'hébergeur. Dicter un CNAME sur « cabinet.fr » enverrait la
     thérapeute poser un enregistrement que son registrar refusera. */
  it('dicte un A sur un domaine racine, un CNAME sur un sous-domaine', () => {
    expect(dnsAttendus('cabinet-ollivier.fr')).toEqual([
      { type: 'A', nom: '@', valeur: '76.76.21.21' },
    ])
    expect(dnsAttendus('espace.cabinet-ollivier.fr')).toEqual([
      { type: 'CNAME', nom: 'espace', valeur: 'cname.vercel-dns.com' },
    ])
  })
})
