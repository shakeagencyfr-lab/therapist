/**
 * L'en-tête du document pour la page de vente : titre, description, adresse
 * canonique, Open Graph, Twitter, et données structurées.
 *
 * POSÉ PAR LE SCRIPT, PAS ÉCRIT DANS index.html. Ce document est servi
 * identique à toutes les racines — celle de klaroweb.site ET celle du domaine
 * de chaque cabinet (src/lib/enTete.ts le dit déjà pour le titre). Une
 * balise canonique écrite en dur y enverrait les moteurs de la page d'un
 * cabinet vers la nôtre, et ferait disparaître la sienne des résultats : la
 * marque blanche paierait pour notre référencement. Google exécute le script
 * et lit ce qui est posé ici ; sur klaroweb.site seulement, vercel.json
 * double la canonique d'un en-tête HTTP `Link`, lu sans script.
 *
 * Données structurées : un logiciel, ses trois offres et leurs prix. Ni note,
 * ni avis — le produit n'en a pas, et on n'en invente pas.
 */
import { KLARO } from '@/theme/klaro'
import { poserIconesKlaro } from '@/lib/enTete'
import { MENTION_PRIX, PRIX_TTC, offres } from './contenu'

export const URL_CANONIQUE = 'https://klaroweb.site/'
export const TITRE = 'Klaro — le suivi entre les séances, pour les hypnothérapeutes'
export const DESCRIPTION =
  'Après la séance, votre note est rédigée : vous relisez. Vos patients repartent avec exercices, audios, journal et rappels, à votre marque. Vous voyez qui décroche. Essai de 14 jours sur demande.'

/** Le JSON-LD de la page : un logiciel web, ses offres mensuelles. Aucune note. */
export function donneesStructurees(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Klaro',
    url: URL_CANONIQUE,
    description: DESCRIPTION,
    inLanguage: 'fr',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Suivi des patients entre les séances',
    operatingSystem: 'Web',
    audience: { '@type': 'Audience', audienceType: 'Hypnothérapeutes en cabinet libéral' },
    offers: offres().map((o) => ({
      '@type': 'Offer',
      name: o.nom,
      description: `${o.patients}. ${MENTION_PRIX}`,
      price: o.prix.replace(/\s*€$/, '').replace(',', '.'),
      priceCurrency: 'EUR',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: o.prix.replace(/\s*€$/, '').replace(',', '.'),
        priceCurrency: 'EUR',
        unitText: 'mois',
        valueAddedTaxIncluded: PRIX_TTC,
        referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
      },
      url: `${URL_CANONIQUE}#offres`,
    })),
  }
}

/** Ce qu'on pose : [attribut, nom, contenu]. */
const META: Array<['name' | 'property', string, string]> = [
  ['name', 'description', DESCRIPTION],
  ['property', 'og:type', 'website'],
  ['property', 'og:site_name', 'Klaro'],
  ['property', 'og:locale', 'fr_FR'],
  ['property', 'og:url', URL_CANONIQUE],
  ['property', 'og:title', TITRE],
  ['property', 'og:description', DESCRIPTION],
  // L'image de partage : le logo sur crème, adresse absolue (les robots des
  // réseaux ne résolvent pas un chemin relatif).
  ['property', 'og:image', new URL(KLARO.imagePartage, URL_CANONIQUE).href],
  ['property', 'og:image:width', '1200'],
  ['property', 'og:image:height', '630'],
  ['property', 'og:image:alt', 'Klaro'],
  ['name', 'twitter:card', 'summary_large_image'],
  ['name', 'twitter:image', new URL(KLARO.imagePartage, URL_CANONIQUE).href],
  ['name', 'twitter:title', TITRE],
  ['name', 'twitter:description', DESCRIPTION],
]

/**
 * Pose l'en-tête, et rend de quoi le retirer — la page de vente peut céder la
 * place à l'espace d'une praticienne dont la session revient (Root).
 */
export function poserEnTeteDeVente(doc: Document = document): () => void {
  const posees: Element[] = []
  const anciennes: Array<[Element, string | null]> = []
  const avant = doc.title
  doc.title = TITRE
  doc.documentElement.lang = 'fr'

  for (const [attribut, nom, contenu] of META) {
    let balise = doc.head.querySelector(`meta[${attribut}="${nom}"]`)
    if (balise) {
      anciennes.push([balise, balise.getAttribute('content')])
    } else {
      balise = doc.createElement('meta')
      balise.setAttribute(attribut, nom)
      doc.head.appendChild(balise)
      posees.push(balise)
    }
    balise.setAttribute('content', contenu)
  }

  let canonique = doc.head.querySelector('link[rel="canonical"]')
  if (!canonique) {
    canonique = doc.createElement('link')
    canonique.setAttribute('rel', 'canonical')
    doc.head.appendChild(canonique)
    posees.push(canonique)
  }
  canonique.setAttribute('href', URL_CANONIQUE)

  /* Des DONNÉES, pas un script : le navigateur ne l'exécute pas, et la
     politique de contenu (script-src 'self') ne le concerne donc pas. */
  const jsonld = doc.createElement('script')
  jsonld.type = 'application/ld+json'
  jsonld.textContent = JSON.stringify(donneesStructurees())
  doc.head.appendChild(jsonld)
  posees.push(jsonld)

  // L'icône d'onglet de Klaro : la page de vente est chez elle.
  const retirerIcones = poserIconesKlaro(doc)

  return () => {
    doc.title = avant
    retirerIcones()
    for (const balise of posees) balise.remove()
    for (const [balise, contenu] of anciennes) {
      if (contenu === null) balise.removeAttribute('content')
      else balise.setAttribute('content', contenu)
    }
  }
}
