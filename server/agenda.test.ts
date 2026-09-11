import { describe, expect, it } from 'vitest'
import {
  adresseDuFormulaire,
  adresseSondable,
  pageExiste,
  racineNue,
  signatureTrafft,
  type Sondeur,
} from './agenda.js'

const Q = 't=s&uuid=5d2561e0-6e31-4816-9586-577a42763298'
const RACINE = `https://lohypnose.bookrdv.com/?${Q}`
const NU = `https://lohypnose.bookrdv.com/booking-embedded?${Q}`
const HABILLE = `https://lohypnose.bookrdv.com/booking?${Q}`
const TEMOIN = `https://lohypnose.bookrdv.com/klaro-verification-adresse-qui-nexiste-pas?${Q}`

/** Un agenda qui répond ce qu'on lui dit, sans réseau. Absent = 404. */
function agenda(codes: Record<string, number>): Sondeur {
  return async (url) => ({ code: codes[url] ?? 404, vers: null })
}

/** Un agenda muet : injoignable, ou derrière un pare-feu. */
const silence: Sondeur = async () => null

describe("l'adresse du formulaire, chez un agenda Trafft", () => {
  it('préfère le formulaire nu quand il répond', async () => {
    const choix = await adresseDuFormulaire(RACINE, agenda({ [NU]: 200, [HABILLE]: 200 }))
    expect(choix).toEqual({ cadre: NU, page: HABILLE, verifie: true })
  })

  it('se rabat sur la page habillée quand le formulaire nu est absent', async () => {
    const choix = await adresseDuFormulaire(RACINE, agenda({ [HABILLE]: 200 }))
    expect(choix).toEqual({ cadre: HABILLE, page: HABILLE, verifie: true })
  })

  /* LE POINT DE TOUT CE FICHIER.
     Un chemin inventé serait pire que le défaut qu'on corrige : la racine, au
     moins, s'affiche. Quand l'agenda se tait, on garde ce qu'on avait. */
  it("garde l'adresse déduite du code quand l'agenda ne répond pas", async () => {
    const choix = await adresseDuFormulaire(RACINE, silence)
    expect(choix).toEqual({ cadre: RACINE, page: RACINE, verifie: false })
  })

  it("garde l'adresse déduite du code quand l'agenda dit non", async () => {
    const choix = await adresseDuFormulaire(RACINE, agenda({}))
    expect(choix).toEqual({ cadre: RACINE, page: RACINE, verifie: false })
  })

  /* Beaucoup de sites rendent la même page à tous les chemins. Chez eux,
     « /booking-embedded répond » ne prouve rien — et on enregistrerait une
     adresse inexistante, qui ne s'afficherait même pas. */
  it("ne conclut rien d'un agenda qui répond oui à tout", async () => {
    const choix = await adresseDuFormulaire(
      RACINE,
      agenda({ [NU]: 200, [HABILLE]: 200, [TEMOIN]: 200 }),
    )
    expect(choix).toEqual({ cadre: RACINE, page: RACINE, verifie: false })
  })

  /* Un agenda qui renvoie ses chemins inconnus vers /404 ne doit pas
     disqualifier le témoin : sinon la résolution devient impossible chez lui,
     alors même que le formulaire nu, lui, répond franchement. */
  it("conclut quand même si le témoin n'est que renvoyé vers une page d'erreur", async () => {
    const sonde: Sondeur = async (url) =>
      url === TEMOIN
        ? { code: 302, vers: '/404' }
        : url === NU
          ? { code: 200, vers: null }
          : { code: 404, vers: null }
    const choix = await adresseDuFormulaire(RACINE, sonde)
    expect(choix).toEqual({ cadre: NU, page: NU, verifie: true })
  })

  it('accepte une redirection qui prolonge le chemin demandé', async () => {
    const sonde: Sondeur = async (url) =>
      url === NU
        ? { code: 302, vers: `/booking-embedded/fr?${Q}` }
        : url === HABILLE
          ? { code: 200, vers: null }
          : { code: 404, vers: null }
    const choix = await adresseDuFormulaire(RACINE, sonde)
    expect(choix).toEqual({ cadre: NU, page: HABILLE, verifie: true })
  })

  it('ne touche pas à une adresse qui désigne déjà une page', async () => {
    const posee = 'https://lohypnose.bookrdv.com/reserver?t=s&uuid=abc'
    let sonde = 0
    const choix = await adresseDuFormulaire(posee, async () => {
      sonde += 1
      return { code: 200, vers: null }
    })
    expect(choix).toEqual({ cadre: posee, page: posee, verifie: false })
    expect(sonde).toBe(0)
  })

  /* Inventer un chemin chez un agenda qu'on ne connaît pas, c'est fabriquer
     une page absente. Sans la signature de Trafft, on ne propose rien. */
  it("n'invente pas de chemin chez un agenda inconnu", async () => {
    const autre = 'https://agenda.exemple.fr/?calendar=12'
    let sonde = 0
    const choix = await adresseDuFormulaire(autre, async () => {
      sonde += 1
      return { code: 200, vers: null }
    })
    expect(choix.cadre).toBe(autre)
    expect(sonde).toBe(0)
  })

  it('ne se casse pas sur ce qui n’est pas une adresse', async () => {
    const choix = await adresseDuFormulaire('pas une adresse', silence)
    expect(choix).toEqual({ cadre: 'pas une adresse', page: 'pas une adresse', verifie: false })
  })
})

describe('lire une réponse', () => {
  it('tient un 200 pour un oui', () => {
    expect(pageExiste(NU, { code: 200, vers: null })).toBe(true)
  })

  /* Un renvoi vers l'accueil est un « non » déguisé : c'est ce que fait un
     agenda d'un chemin qu'il ne connaît pas. */
  it('tient un renvoi vers la page d’accueil pour un non', () => {
    expect(pageExiste(NU, { code: 302, vers: '/' })).toBe(false)
    expect(pageExiste(NU, { code: 301, vers: 'https://lohypnose.bookrdv.com/' })).toBe(false)
  })

  it('refuse un renvoi vers un autre domaine', () => {
    expect(pageExiste(NU, { code: 302, vers: 'https://ailleurs.example/booking' })).toBe(false)
  })

  /* Le cœur de la règle : un renvoi ne dit « cette page existe » que s'il
     PROLONGE le chemin demandé. Tout le reste — l'accueil, une page
     d'erreur, un écran de connexion, une page de langue — est un « non »
     que seule la forme distingue d'un oui. */
  it('refuse un renvoi qui ne prolonge pas le chemin demandé', () => {
    for (const vers of ['/home', '/404', '/fr', '/login?next=/x', '/booking', '/booking-embeddedX']) {
      expect({ [vers]: pageExiste(NU, { code: 302, vers }) }).toEqual({ [vers]: false })
    }
  })

  it('accepte un renvoi qui prolonge le chemin demandé', () => {
    for (const vers of ['/booking-embedded', '/booking-embedded/fr', '/booking-embedded/etape/1']) {
      expect({ [vers]: pageExiste(NU, { code: 301, vers }) }).toEqual({ [vers]: true })
    }
  })

  it('refuse un 404, un 403, un 500 et le silence', () => {
    expect(pageExiste(NU, { code: 404, vers: null })).toBe(false)
    expect(pageExiste(NU, { code: 403, vers: null })).toBe(false)
    expect(pageExiste(NU, { code: 500, vers: null })).toBe(false)
    expect(pageExiste(NU, null)).toBe(false)
  })
})

describe('les gardes du sondage', () => {
  it('reconnaît la racine, avec ou sans barre, avec ou sans paramètres', () => {
    for (const brut of [
      'https://a.bookrdv.com',
      'https://a.bookrdv.com/',
      'https://a.bookrdv.com/?t=s&uuid=1',
    ]) {
      expect({ [brut]: racineNue(new URL(brut)) }).toEqual({ [brut]: true })
    }
    expect(racineNue(new URL('https://a.bookrdv.com/booking'))).toBe(false)
  })

  it('exige les deux paramètres de Trafft, pas un seul', () => {
    expect(signatureTrafft(new URL('https://a.bookrdv.com/?t=s&uuid=1'))).toBe(true)
    expect(signatureTrafft(new URL('https://a.bookrdv.com/?uuid=1'))).toBe(false)
    expect(signatureTrafft(new URL('https://a.bookrdv.com/?t=s'))).toBe(false)
  })

  /* Le domaine vient de la thérapeute, et le serveur voit des adresses qu'un
     navigateur ne voit pas. On refuse tout ce qui n'est pas un agenda sur
     l'Internet public. */
  it("refuse ce qu'un serveur ne doit pas aller chercher", () => {
    for (const brut of [
      'http://agenda.exemple.fr/booking',
      'https://127.0.0.1/booking',
      'https://192.168.1.10/booking',
      'https://[::1]/booking',
      'https://localhost/booking',
      'https://base.internal/booking',
      'https://nas.local/booking',
      'https://serveur/booking',
      'https://2130706433/booking',
      'https://interne@agenda.exemple.fr/booking',
      'https://agenda.exemple.fr:22/booking',
      'https://nas.local./booking',
      'https://db.svc.cluster.local./booking',
      'https://metadata.google.internal./booking',
      'https://localhost./booking',
      'pas une adresse',
    ]) {
      expect({ [brut]: adresseSondable(brut) }).toEqual({ [brut]: false })
    }
  })

  it('accepte un agenda ordinaire', () => {
    expect(adresseSondable('https://lohypnose.bookrdv.com/booking')).toBe(true)
    expect(adresseSondable('https://cabinet.trafft.com/booking-embedded?t=s&uuid=1')).toBe(true)
  })
})
