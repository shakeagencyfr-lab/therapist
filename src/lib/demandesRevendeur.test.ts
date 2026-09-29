import { describe, expect, it } from 'vitest'
import {
  compterNouvelles,
  invitationPourLaDemande,
  libelleFourchette,
  libelleOffre,
  libelleOnglet,
  libelleStatut,
  preremplissage,
  trierDemandes,
  type DemandeEssai,
} from './demandesRevendeur'

function demande(id: string, statut: DemandeEssai['statut'], le: string): DemandeEssai {
  return {
    id,
    created_at: le,
    nom: 'Claire Fontaine',
    email: 'claire@cabinet.fr',
    telephone: null,
    cabinet: 'Cabinet Fontaine',
    ville: 'Nantes',
    patients: '10-25',
    offre: 'cabinet',
    message: null,
    consentement_le: le,
    statut,
    statut_le: null,
    note_interne: '',
  }
}

describe('la liste des demandes', () => {
  it('met les nouvelles d’abord, puis la plus récente', () => {
    const liste = trierDemandes([
      demande('a', 'contactee', '2026-09-28T10:00:00Z'),
      demande('b', 'nouvelle', '2026-09-20T10:00:00Z'),
      demande('c', 'nouvelle', '2026-09-27T10:00:00Z'),
      demande('d', 'sans-suite', '2026-09-29T10:00:00Z'),
    ])
    expect(liste.map((d) => d.id)).toEqual(['c', 'b', 'd', 'a'])
  })

  it('compte les nouvelles pour le badge', () => {
    const liste = [demande('a', 'nouvelle', '2026-09-28T10:00:00Z'), demande('b', 'ouverte', '2026-09-28T10:00:00Z')]
    expect(compterNouvelles(liste)).toBe(1)
    expect(libelleOnglet(1)).toBe('Demandes · 1')
    expect(libelleOnglet(0)).toBe('Demandes')
  })

  it('dit chaque statut, fourchette et offre en français', () => {
    expect(libelleStatut('ouverte')).toBe('Cabinet ouvert')
    expect(libelleStatut('sans-suite')).toBe('Sans suite')
    expect(libelleFourchette('26-80')).toBe('De 26 à 80')
    expect(libelleOffre('a-voir')).toBe('Je ne sais pas encore')
  })
})

describe('ouvrir le cabinet depuis la demande', () => {
  it('pré-remplit le nom, la praticienne, l’adresse et l’offre', () => {
    const d = demande('a', 'nouvelle', '2026-09-28T10:00:00Z')
    expect(preremplissage(d, ['essentiel', 'cabinet', 'reseau'])).toEqual({
      rNewName: 'Cabinet Fontaine',
      rNewTherapist: 'Claire Fontaine',
      rNewEmail: 'claire@cabinet.fr',
      rNewSlug: '',
      rNewPlan: 'cabinet',
    })
  })

  it('laisse l’offre du formulaire quand la demande n’en choisit pas', () => {
    const d = { ...demande('a', 'nouvelle', '2026-09-28T10:00:00Z'), offre: 'a-voir' }
    expect(preremplissage(d, ['essentiel', 'cabinet', 'reseau'])).not.toHaveProperty('rNewPlan')
  })

  it('reconnaît l’invitation d’ouverture partie vers la même adresse', () => {
    const d = demande('a', 'nouvelle', '2026-09-28T10:00:00Z')
    expect(invitationPourLaDemande(d, [{ email: 'Claire@Cabinet.fr', role: 'owner' }])).toBe(true)
    expect(invitationPourLaDemande(d, [{ email: 'claire@cabinet.fr', role: 'therapist' }])).toBe(false)
    expect(invitationPourLaDemande(d, [])).toBe(false)
  })
})
