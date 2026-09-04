import { describe, expect, it } from 'vitest'
import {
  CHEMINS_RESERVES,
  estDomainePersonnalise,
  slugDuChemin,
  versSiteVitrine,
} from './vitrine'

describe('adresse de cabinet', () => {
  it('reconnaît /<slug> à la racine, avec ou sans barre finale', () => {
    expect(slugDuChemin('/cabinet-fontaine')).toBe('cabinet-fontaine')
    expect(slugDuChemin('/cabinet-fontaine/')).toBe('cabinet-fontaine')
  })

  /* /c/... a circulé avant le déplacement à la racine. Une redirection peut
     manquer — un signet, une capture, `vercel dev` — et il vaut mieux
     comprendre l'ancienne forme que montrer Klaro à qui a suivi un lien du
     cabinet. */
  it("comprend encore l'ancienne forme /c/<slug>", () => {
    expect(slugDuChemin('/c/cabinet-fontaine')).toBe('cabinet-fontaine')
    expect(slugDuChemin('/c/cabinet-fontaine/')).toBe('cabinet-fontaine')
  })

  it('ramène le slug en minuscules', () => {
    expect(slugDuChemin('/Cabinet-Fontaine')).toBe('cabinet-fontaine')
    expect(slugDuChemin('/c/Cabinet-Fontaine')).toBe('cabinet-fontaine')
  })

  it('ignore les chemins qui ne sont pas une vitrine', () => {
    expect(slugDuChemin('/')).toBeNull()
    expect(slugDuChemin('/c/')).toBeNull()
    expect(slugDuChemin('/c/cabinet/autre-chose')).toBeNull()
    expect(slugDuChemin('/cabinet/autre-chose')).toBeNull()
    expect(slugDuChemin('/-tiret-devant')).toBeNull()
    expect(slugDuChemin('/point.interdit')).toBeNull()
  })

  /* C'est le prix de la racine : sans cette liste, un cabinet nommé « mon »
     ou « api » masquerait une route du produit — et le cabinet lui-même
     deviendrait injoignable. */
  it("ne prend jamais un mot réservé pour un cabinet", () => {
    for (const reserve of CHEMINS_RESERVES) {
      expect(slugDuChemin(`/${reserve}`)).toBeNull()
      expect(slugDuChemin(`/${reserve}/`)).toBeNull()
    }
    expect(slugDuChemin('/mon')).toBeNull()
    expect(slugDuChemin('/api')).toBeNull()
    expect(slugDuChemin('/tarifs')).toBeNull()
  })

  /* Sous /c/, le préfixe isole déjà : un cabinet historiquement nommé comme
     un mot réservé doit continuer d'ouvrir par son ancienne adresse. */
  it('ne réserve rien sous /c/, où le préfixe suffit', () => {
    expect(slugDuChemin('/c/tarifs')).toBe('tarifs')
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

/**
 * La conversion de la ligne rendue par site_vitrine().
 *
 * Elle existe parce qu'elle a déjà menti : elle oubliait de recopier le thème,
 * pendant que le banc de rendu vérifiait sagement que la page sait afficher
 * un thème qu'on lui donne. Les deux passaient, et le réglage ne servait à
 * rien. L'épreuve porte donc sur CHAQUE champ, pas sur un échantillon.
 */
describe('versSiteVitrine', () => {
  const LIGNE = {
    slug: 'cabinet-fontaine',
    name: 'Cabinet Fontaine',
    tagline: 'Hypnose',
    branding: { accent: '#A17A45', logo: 'CF' },
    modele: 'chaleur',
    theme: { preset: 'atelier', titres: 'fraunces' },
    titre: 'Retrouver le sommeil',
    sous_titre: 'À Nantes',
    presentation: 'Deux mots.',
    adresse: '12 rue des Halles',
    telephone: '02 40 00 00 00',
    site_web: 'https://exemple.fr',
    horaires: [{ jour: 'Lundi', heures: '9h – 18h' }],
    photos: [{ url: 'https://x.test/a.jpg', alt: '', attribution: '' }],
    services: [{ titre: 'Sommeil', texte: '' }],
    avis: [{ auteur: 'Claire', note: 5, texte: 'Merci', date: '' }],
    google_note: 4.9,
    google_avis: 37,
  }

  it('ne perd aucun champ de la ligne', () => {
    const site = versSiteVitrine(LIGNE, 'cabinet-fontaine')
    expect(site).not.toBeNull()
    for (const [clef, valeur] of Object.entries(LIGNE)) {
      expect({ [clef]: site![clef as keyof typeof site] }).toEqual({ [clef]: valeur })
    }
  })

  it('rend null sans nom : une page sans cabinet ne se montre pas', () => {
    expect(versSiteVitrine({}, 'x')).toBeNull()
    expect(versSiteVitrine(null, 'x')).toBeNull()
    expect(versSiteVitrine({ titre: 'orphelin' }, 'x')).toBeNull()
  })

  it('comble les absences sans inventer', () => {
    const site = versSiteVitrine({ name: 'Seul' }, 'seul')!
    expect(site.slug).toBe('seul')
    expect(site.modele).toBe('sobre')
    expect(site.horaires).toEqual([])
    expect(site.photos).toEqual([])
    expect(site.avis).toEqual([])
    expect(site.google_note).toBeNull()
  })
})
