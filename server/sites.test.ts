import { describe, expect, it } from 'vitest'
import { avisSouples, chaineSouple, horairesSouples, imagesSouples, nombreSouple } from './sites'

/**
 * Les lecteurs de la fiche SerpAPI.
 *
 * SerpAPI recopie une page qui bouge : un champ y arrive tantôt en chaîne,
 * tantôt en objet, tantôt en tableau, et il disparaît sans prévenir. Ces
 * épreuves fixent le contrat qui compte — chaque forme rencontrée se lit, et
 * une forme inconnue rend du vide au lieu de lever. Un import amputé de ses
 * horaires reste un import ; un import qui plante n'est rien.
 */
describe('chaineSouple', () => {
  it('lit une chaîne nue, un { snippet }, un { text }', () => {
    expect(chaineSouple('Cabinet Fontaine', 40)).toBe('Cabinet Fontaine')
    expect(chaineSouple({ snippet: 'Hypnothérapie à Nantes' }, 40)).toBe('Hypnothérapie à Nantes')
    expect(chaineSouple({ text: 'Séances individuelles' }, 40)).toBe('Séances individuelles')
  })

  it('rend du vide sur une forme inconnue, et ne lève jamais', () => {
    expect(chaineSouple(null, 40)).toBe('')
    expect(chaineSouple(undefined, 40)).toBe('')
    expect(chaineSouple([1, 2, 3], 40)).toBe('')
    expect(chaineSouple({ inattendu: { profond: 'x' } }, 40)).toBe('')
  })

  it('coupe à la longueur demandée', () => {
    expect(chaineSouple('a'.repeat(50), 10)).toHaveLength(10)
  })
})

describe('nombreSouple', () => {
  it("lit un nombre, et une note écrite à la française", () => {
    expect(nombreSouple(4.8)).toBe(4.8)
    expect(nombreSouple('4,8')).toBe(4.8)
    expect(nombreSouple('127 avis')).toBe(127)
  })

  it('rend null plutôt que NaN', () => {
    expect(nombreSouple('—')).toBeNull()
    expect(nombreSouple(null)).toBeNull()
    expect(nombreSouple({})).toBeNull()
  })
})

describe('horairesSouples', () => {
  it("lit la forme courante : un tableau d'objets à une seule clé", () => {
    expect(horairesSouples([{ lundi: '09:00–19:00' }, { mardi: '09:00–19:00' }])).toEqual([
      { jour: 'lundi', heures: '09:00–19:00' },
      { jour: 'mardi', heures: '09:00–19:00' },
    ])
  })

  it('lit la forme { day, times } et recolle les créneaux', () => {
    expect(horairesSouples([{ day: 'mercredi', times: ['09:00–12:00', '14:00–19:00'] }])).toEqual([
      { jour: 'mercredi', heures: '09:00–12:00, 14:00–19:00' },
    ])
  })

  it("lit un objet unique, et s'arrête à sept jours", () => {
    expect(horairesSouples({ jeudi: '09:00–19:00' })).toEqual([{ jour: 'jeudi', heures: '09:00–19:00' }])
    expect(horairesSouples(Array.from({ length: 12 }, (_, i) => ({ [`j${i}`]: '9h' })))).toHaveLength(7)
  })

  it('rend un tableau vide sur une forme inconnue', () => {
    expect(horairesSouples('lundi 9h-19h')).toEqual([])
    expect(horairesSouples(null)).toEqual([])
  })
})

describe('avisSouples', () => {
  it('lit user_reviews.most_relevant', () => {
    const lus = avisSouples({
      most_relevant: [
        { username: 'Claire', rating: 5, description: 'Écoute juste.', date: 'il y a 2 mois' },
        { username: 'Marc', rating: 4, description: 'Très professionnel.', date: 'il y a un an' },
      ],
    })
    expect(lus).toHaveLength(2)
    expect(lus[0]).toEqual({ auteur: 'Claire', note: 5, texte: 'Écoute juste.', date: 'il y a 2 mois' })
  })

  it('lit un tableau nu, et borne la note à cinq', () => {
    expect(avisSouples([{ user: 'Ana', rating: 9, snippet: 'Parfait.' }])[0].note).toBe(5)
  })

  /* Un avis sans texte est une étoile sans mot : il n'a rien à faire sur une
     page d'accueil, où il occuperait la place d'un vrai. */
  it('écarte les avis sans texte', () => {
    expect(avisSouples([{ username: 'Sans mot', rating: 5 }])).toEqual([])
  })

  it("s'arrête à cinq avis", () => {
    const beaucoup = Array.from({ length: 9 }, (_, i) => ({ username: `A${i}`, rating: 5, description: 'Bien.' }))
    expect(avisSouples(beaucoup)).toHaveLength(5)
  })
})

describe('imagesSouples', () => {
  it('lit un tableau de chaînes ou d’objets, sans doublon', () => {
    expect(
      imagesSouples(
        ['https://a.test/1.jpg', { thumbnail: 'https://a.test/2.jpg' }, { image: 'https://a.test/1.jpg' }],
        null,
      ),
    ).toEqual(['https://a.test/1.jpg', 'https://a.test/2.jpg'])
  })

  /* Une adresse en http simple serait bloquée par la page, qui est servie en
     https : autant ne pas la recopier du tout. */
  it("n'accepte que le https", () => {
    expect(imagesSouples(['http://a.test/1.jpg', 'data:image/png;base64,xx'], null)).toEqual([])
  })

  it('retombe sur la vignette quand il n’y a aucune photo', () => {
    expect(imagesSouples(null, 'https://a.test/vignette.jpg')).toEqual(['https://a.test/vignette.jpg'])
    expect(imagesSouples([], null)).toEqual([])
  })

  it("s'arrête à six images", () => {
    const beaucoup = Array.from({ length: 10 }, (_, i) => `https://a.test/${i}.jpg`)
    expect(imagesSouples(beaucoup, null)).toHaveLength(6)
  })
})
