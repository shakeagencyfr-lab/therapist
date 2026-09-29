import { describe, expect, it } from 'vitest'
import { PLANS } from '@/data/reseller'
import {
  adresseValide,
  confirmation,
  OFFRES_DEMANDEES,
  premierChampEnDefaut,
  reponseAuRefus,
  SAISIE_VIDE,
  telephoneValide,
  validerDemande,
  type SaisieDemande,
} from './demandeEssai'

const BONNE: SaisieDemande = {
  nom: '  Claire Fontaine ',
  email: ' Claire@Cabinet-Fontaine.FR ',
  telephone: '',
  cabinet: 'Cabinet Claire Fontaine',
  ville: 'Nantes',
  patients: '10-25',
  offre: 'cabinet',
  message: '',
  consentement: true,
}

describe('une demande d’essai', () => {
  it('passe quand tout est en règle, et sort nettoyée', () => {
    const v = validerDemande(BONNE)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.demande.nom).toBe('Claire Fontaine')
    expect(v.demande.email).toBe('claire@cabinet-fontaine.fr')
    expect(v.demande.telephone).toBeNull()
    expect(v.demande.message).toBeNull()
  })

  it('ne passe pas sans consentement explicite', () => {
    const v = validerDemande({ ...BONNE, consentement: false })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(Object.keys(v.erreurs)).toEqual(['consentement'])
  })

  /* Un corps de requête peut porter n'importe quoi : « true » en texte n'est
     pas un consentement. */
  it('ne prend pas un texte pour un consentement', () => {
    expect(validerDemande({ ...BONNE, consentement: 'true' }).ok).toBe(false)
  })

  it('dit chaque champ manquant, dans l’ordre du formulaire', () => {
    const v = validerDemande(SAISIE_VIDE)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(Object.keys(v.erreurs).sort()).toEqual(
      ['cabinet', 'consentement', 'email', 'nom', 'offre', 'patients', 'ville'].sort(),
    )
    expect(premierChampEnDefaut(v.erreurs)).toBe('nom')
  })

  it('refuse une adresse incomplète', () => {
    for (const email of ['claire', 'claire@', 'claire@cabinet', '@cabinet.fr', 'claire @cabinet.fr']) {
      expect(validerDemande({ ...BONNE, email }).ok, email).toBe(false)
    }
    expect(adresseValide('a@b.fr')).toBe(true)
  })

  it('accepte un téléphone facultatif, lisible', () => {
    expect(validerDemande({ ...BONNE, telephone: '06 12 34 56 78' }).ok).toBe(true)
    expect(validerDemande({ ...BONNE, telephone: '+33 (0)6.12.34.56.78' }).ok).toBe(true)
    expect(telephoneValide('abc')).toBe(false)
    expect(telephoneValide('+ + + + + +')).toBe(false)
    expect(validerDemande({ ...BONNE, telephone: 'appelez-moi' }).ok).toBe(false)
  })

  it('tient les longueurs de la base', () => {
    expect(validerDemande({ ...BONNE, nom: 'C' }).ok).toBe(false)
    expect(validerDemande({ ...BONNE, nom: 'C'.repeat(121) }).ok).toBe(false)
    expect(validerDemande({ ...BONNE, ville: 'V'.repeat(81) }).ok).toBe(false)
    expect(validerDemande({ ...BONNE, message: 'm'.repeat(2000) }).ok).toBe(true)
    expect(validerDemande({ ...BONNE, message: 'm'.repeat(2001) }).ok).toBe(false)
  })

  it('refuse un caractère de contrôle dans un nom', () => {
    expect(validerDemande({ ...BONNE, nom: 'Claire\u0000Fontaine' }).ok).toBe(false)
    expect(validerDemande({ ...BONNE, cabinet: 'Cabinet\nFontaine' }).ok).toBe(false)
  })

  it('ne connaît que les fourchettes et les offres de la liste', () => {
    expect(validerDemande({ ...BONNE, patients: '1000' }).ok).toBe(false)
    expect(validerDemande({ ...BONNE, offre: 'premium' }).ok).toBe(false)
    expect(validerDemande({ ...BONNE, offre: 'a-voir' }).ok).toBe(true)
  })

  it('résiste à un corps qui n’est pas un objet', () => {
    expect(validerDemande(null).ok).toBe(false)
    expect(validerDemande('nom=Claire').ok).toBe(false)
    expect(validerDemande({ ...BONNE, nom: 42 }).ok).toBe(false)
  })
})

describe('les offres proposées au formulaire', () => {
  /* Les codes de la table `plans` : le revendeur pré-remplit l'ouverture du
     cabinet avec, et la base les refuse s'ils divergent. */
  it('sont celles du catalogue, plus « je ne sais pas »', () => {
    const codes = OFFRES_DEMANDEES.map((o) => o.valeur).filter((c) => c !== 'a-voir')
    expect(codes).toEqual(PLANS.map((p) => p.code))
  })
})

describe('ce qu’on dit après l’envoi', () => {
  it('confirme sans promettre de délai', () => {
    const texte = confirmation({ nom: 'Claire Fontaine', email: 'claire@cabinet.fr' })
    expect(texte).toContain('Claire')
    expect(texte).toContain('claire@cabinet.fr')
    expect(texte).not.toMatch(/\d+\s*h/)
  })

  it('traduit chaque refus de la base', () => {
    expect(reponseAuRefus('adresse').status).toBe(429)
    expect(reponseAuRefus('heure').status).toBe(429)
    expect(reponseAuRefus('fermee').status).toBe(503)
    expect(reponseAuRefus('champ').status).toBe(400)
    expect(reponseAuRefus(undefined).status).toBe(400)
  })
})
