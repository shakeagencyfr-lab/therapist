import { describe, expect, it } from 'vitest'
import { estDomainePersonnalise } from '@/lib/vitrine'
import {
  entreeDeLAdresse,
  estDomaineDeLaPlateforme,
  estLaPorte,
  estLaRacine,
  refDuProjet,
  retourDeConnexion,
  sessionStockee,
  type Adresse,
} from './decision'

const racine = (hote = 'klaroweb.site', extra: Partial<Adresse> = {}): Adresse => ({
  hote,
  chemin: '/',
  recherche: '',
  fragment: '',
  ...extra,
})

/** Un stockage de navigateur en mémoire, qui peut aussi refuser d'être lu. */
function stockage(entrees: Record<string, string>, refuse = false) {
  const cles = Object.keys(entrees)
  return {
    get length() {
      return cles.length
    },
    key: (i: number) => cles[i] ?? null,
    getItem: (cle: string) => {
      if (refuse) throw new Error('SecurityError')
      return entrees[cle] ?? null
    },
  }
}

describe('la page de vente ou l’espace', () => {
  it('montre la page à la racine de la plateforme, sans session', () => {
    expect(entreeDeLAdresse(racine(), false)).toBe('vente')
    expect(entreeDeLAdresse(racine('www.klaroweb.site'), false)).toBe('vente')
    expect(entreeDeLAdresse(racine('klaro-git-main.vercel.app'), false)).toBe('vente')
    expect(entreeDeLAdresse(racine('localhost:5199'), false)).toBe('vente')
    expect(entreeDeLAdresse(racine('klaroweb.site', { chemin: '' }), false)).toBe('vente')
  })

  it('ouvre l’espace comme avant quand une session est stockée', () => {
    expect(entreeDeLAdresse(racine(), true)).toBe('application')
  })

  /* LA MARQUE BLANCHE. Le domaine d'un cabinet sert la même racine : il doit
     y trouver SA page, jamais celle de son fournisseur. */
  it('ne montre jamais la page sur le domaine d’un cabinet', () => {
    expect(entreeDeLAdresse(racine('espace.cabinet-fontaine.fr'), false)).toBe('application')
    expect(entreeDeLAdresse(racine('klaroweb.site.exemple.fr'), false)).toBe('application')
  })

  it('ne montre jamais la page ailleurs qu’à la racine', () => {
    for (const chemin of ['/sebastien-tedeschi', '/sebastien-tedeschi/', '/connexion', '/mon', '/c/x', '/confidentialite']) {
      expect(entreeDeLAdresse(racine('klaroweb.site', { chemin }), false), chemin).toBe('application')
    }
  })

  /* L'invitation d'une praticienne revient sur la racine, jeton dans le
     fragment, avant que la session soit stockée. */
  it('laisse passer un lien de connexion ou d’invitation qui revient à la racine', () => {
    const avecFragment = (fragment: string) => entreeDeLAdresse(racine('klaroweb.site', { fragment }), false)
    expect(avecFragment('#access_token=abc&refresh_token=def&type=invite')).toBe('application')
    expect(avecFragment('#error=access_denied&error_code=otp_expired&error_description=Email+link')).toBe('application')
    expect(entreeDeLAdresse(racine('klaroweb.site', { recherche: '?code=abc' }), false)).toBe('application')
    expect(entreeDeLAdresse(racine('klaroweb.site', { recherche: '?token_hash=x&type=email' }), false)).toBe('application')
  })

  it('ne prend pas une ancre de la page pour un retour de connexion', () => {
    expect(retourDeConnexion('', '#offres')).toBe(false)
    expect(retourDeConnexion('', '#essai')).toBe(false)
    expect(retourDeConnexion('?utm_source=lettre', '')).toBe(false)
    expect(entreeDeLAdresse(racine('klaroweb.site', { fragment: '#questions' }), false)).toBe('vente')
  })
})

describe('le domaine de la plateforme', () => {
  /* Écrite deux fois — ici sans le client Supabase, là-bas avec : les deux
     doivent dire la même chose, pour chaque hôte. */
  it('dit exactement l’inverse de estDomainePersonnalise', () => {
    for (const hote of [
      'klaroweb.site',
      'www.klaroweb.site',
      'klaroweb.site:443',
      'projet.vercel.app',
      'localhost',
      'localhost:5173',
      '127.0.0.1:5199',
      'espace.cabinet-fontaine.fr',
      'cabinet.fr',
      'klaroweb.site.pirate.com',
      'notklaroweb.site',
    ]) {
      expect(estDomaineDeLaPlateforme(hote), hote).toBe(!estDomainePersonnalise(hote))
    }
  })
})

describe('la racine et la porte', () => {
  it('reconnaît la racine', () => {
    expect(estLaRacine('/')).toBe(true)
    expect(estLaRacine('/index.html')).toBe(true)
    expect(estLaRacine('/accueil')).toBe(false)
  })

  it('reconnaît la porte des praticiennes', () => {
    expect(estLaPorte('/connexion')).toBe(true)
    expect(estLaPorte('/connexion/')).toBe(true)
    expect(estLaPorte('/connexions')).toBe(false)
  })
})

describe('la session stockée', () => {
  const ref = refDuProjet('https://koytgcbpeorupdklswxd.supabase.co')

  it('lit l’identifiant du projet dans l’adresse de la base', () => {
    expect(ref).toBe('koytgcbpeorupdklswxd')
    expect(refDuProjet('')).toBeNull()
    expect(refDuProjet(undefined)).toBeNull()
    expect(refDuProjet('pas une adresse')).toBeNull()
  })

  it('trouve la clé que pose supabase-js', () => {
    expect(sessionStockee(stockage({ 'sb-koytgcbpeorupdklswxd-auth-token': '{"access_token":"x"}' }), ref)).toBe(true)
  })

  it('ne confond pas une autre clé avec une session', () => {
    expect(sessionStockee(stockage({ 'sb-koytgcbpeorupdklswxd-auth-token-code-verifier': 'x' }), ref)).toBe(false)
    expect(sessionStockee(stockage({ 'sb-autreprojet-auth-token': '{"a":1}' }), ref)).toBe(false)
    expect(sessionStockee(stockage({ 'sb-koytgcbpeorupdklswxd-auth-token': 'null' }), ref)).toBe(false)
    expect(sessionStockee(stockage({ 'klaro.rappels.plusTard': '1' }), ref)).toBe(false)
  })

  it('vaut « aucune » sans base, sans stockage, ou quand le stockage refuse', () => {
    expect(sessionStockee(stockage({ 'sb-x-auth-token': '{}' }), null)).toBe(false)
    expect(sessionStockee(null, ref)).toBe(false)
    expect(sessionStockee(stockage({ 'sb-koytgcbpeorupdklswxd-auth-token': '{}' }, true), ref)).toBe(false)
  })
})
