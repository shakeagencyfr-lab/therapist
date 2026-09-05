import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  CHEMINS_RESERVES,
  estDomainePersonnalise,
  lienSortant,
  slugEmbed,
  marqueSure,
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
const STOCKAGE = 'https://projet-temoin.supabase.co'

/**
 * Le LOGO du cabinet, filtré comme les photos.
 *
 * Le lot précédent a fermé les photos de la vitrine et laissé passer le logo,
 * c'est-à-dire l'image la plus visible de la page — présente aussi sur la
 * porte patient et dans le widget. `branding` s'écrit en jsonb brut depuis le
 * navigateur, sans contrainte en base : le nettoyage n'a lieu qu'ici.
 */
describe('marqueSure', () => {
  beforeAll(() => vi.stubEnv('VITE_SUPABASE_URL', STOCKAGE))
  afterAll(() => vi.unstubAllEnvs())

  it('garde un logo venu de notre stockage', () => {
    const url = `${STOCKAGE}/storage/v1/object/public/logos/cf.png`
    expect(marqueSure({ accent: '#A17A45', logoUrl: url })).toEqual({ accent: '#A17A45', logoUrl: url })
  })

  it('écarte un logo venu d’ailleurs, sans perdre le reste de la marque', () => {
    expect(marqueSure({ accent: '#A17A45', logo: 'CF', logoUrl: 'https://tiers.test/cf.png' })).toEqual({
      accent: '#A17A45',
      logo: 'CF',
      logoUrl: null,
    })
  })

  it('n’invente pas de logo là où il n’y en a pas', () => {
    expect(marqueSure({ accent: '#A17A45' })).toEqual({ accent: '#A17A45' })
    expect(marqueSure(null)).toEqual({})
    expect(marqueSure({ logoUrl: 42 })).toEqual({ logoUrl: null })
  })
})

describe('versSiteVitrine', () => {
  beforeAll(() => vi.stubEnv('VITE_SUPABASE_URL', STOCKAGE))
  afterAll(() => vi.unstubAllEnvs())

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
    site_web: 'https://exemple.fr/',
    horaires: [{ jour: 'Lundi', heures: '9h – 18h' }],
    photos: [{ url: `${STOCKAGE}/storage/v1/object/public/sites/a.jpg`, alt: '', attribution: '' }],
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

  /* LA PAGE PUBLIQUE NE CHARGE RIEN CHEZ UN TIERS. C'est l'invariant que le
     produit tient partout — polices auto-hébergées, logo Google en SVG inline.
     Une image venue d'ailleurs signalerait à ce tiers qu'un patient a ouvert
     la page de son cabinet, avant même d'avoir pris rendez-vous. Le serveur
     filtre à l'écriture ; ici on filtre à l'AFFICHAGE, parce que la page
     publique lit la base sans passer par le serveur. */
  it('écarte les images qui ne viennent pas de notre stockage', () => {
    const site = versSiteVitrine(
      {
        ...LIGNE,
        photos: [
          { url: `${STOCKAGE}/storage/v1/object/public/sites/ok.jpg`, alt: '', attribution: '' },
          { url: 'https://tiers.test/pixel.gif', alt: '', attribution: '' },
          { url: `${STOCKAGE}.evil.test/storage/v1/object/public/x.jpg`, alt: '', attribution: '' },
        ],
      },
      'x',
    )!
    expect(site.photos.map((p) => p.url)).toEqual([
      `${STOCKAGE}/storage/v1/object/public/sites/ok.jpg`,
    ])
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

/**
 * Le lien sortant de la vitrine.
 *
 * `site_web` repartait de la base droit dans un `href`. Le serveur le nettoie
 * à l'écriture, mais la page publique ne passe pas par le serveur : elle lit
 * `site_vitrine()` directement. Un `href` en `javascript:` s'exécuterait au
 * clic, sur la page d'un cabinet, dans le navigateur d'un patient.
 */
describe('lienSortant', () => {
  it('garde une adresse web ordinaire', () => {
    expect(lienSortant('https://cabinet-fontaine.fr/')).toBe('https://cabinet-fontaine.fr/')
    expect(lienSortant('http://www.exemple.fr/rdv')).toBe('http://www.exemple.fr/rdv')
  })

  it('écarte tout ce qui n’est pas http ou https', () => {
    for (const brut of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)  ',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'cabinet-fontaine.fr',
      '',
      null,
      undefined,
      42,
    ]) {
      expect({ [String(brut)]: lienSortant(brut) }).toEqual({ [String(brut)]: null })
    }
  })
})

/**
 * Le cabinet d'un widget.
 *
 * `slugDuChemin` ne connaît que la racine, et `e` est un chemin réservé : le
 * widget recevait donc null pour sa propre adresse et s'affichait « Votre
 * espace », initiales KL, aux couleurs de Klaro — sur le site d'une
 * thérapeute qui l'a collé POUR sa marque.
 */
describe('slugEmbed', () => {
  it('reconnaît /e/<identifiant>, avec ou sans barre finale', () => {
    expect(slugEmbed('/e/cabinet-fontaine')).toBe('cabinet-fontaine')
    expect(slugEmbed('/e/cabinet-fontaine/')).toBe('cabinet-fontaine')
    expect(slugEmbed('/e/Cabinet-Fontaine')).toBe('cabinet-fontaine')
    expect(slugEmbed('  /e/cabinet-fontaine  ')).toBe('cabinet-fontaine')
  })

  it('ne reconnaît rien d’autre', () => {
    for (const chemin of ['/e/', '/e', '/cabinet-fontaine', '/c/cabinet-fontaine', '/e/a/b', '/']) {
      expect({ [chemin]: slugEmbed(chemin) }).toEqual({ [chemin]: null })
    }
  })
})
