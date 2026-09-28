import { describe, expect, it } from 'vitest'
import {
  adressePlausible,
  echeanceDite,
  etiquetteEquipe,
  invitationExpiree,
  libelleRole,
  messageRetrait,
  motifExact,
  nouvelleEcheance,
  peutRetirer,
  refusInvitation,
} from './equipe'

const MAINTENANT = Date.parse('2026-09-28T10:00:00Z')

describe('l’échéance d’une invitation', () => {
  /* `expires_at` était lu, jamais comparé : une invitation morte depuis des
     semaines s'affichait « Invitation envoyée ». */
  it('reconnaît une invitation échue', () => {
    expect(invitationExpiree('2026-09-27T10:00:00Z', MAINTENANT)).toBe(true)
    expect(invitationExpiree('2026-09-28T10:00:00Z', MAINTENANT)).toBe(true)
    expect(invitationExpiree('2026-10-28T10:00:00Z', MAINTENANT)).toBe(false)
  })

  it('ne déclare pas expirée une date absente ou illisible', () => {
    expect(invitationExpiree(null, MAINTENANT)).toBe(false)
    expect(invitationExpiree('pas une date', MAINTENANT)).toBe(false)
  })

  it('dit l’échéance en toutes lettres, et le passé au passé', () => {
    expect(echeanceDite('2026-10-12T12:00:00Z', MAINTENANT)).toBe('expire le 12 octobre 2026')
    expect(echeanceDite('2026-09-03T12:00:00Z', MAINTENANT)).toBe('expirée depuis le 3 septembre 2026')
    expect(echeanceDite(null, MAINTENANT)).toBe('')
  })

  it('relance pour trente jours, dans la borne des soixante que tient la base', () => {
    const echeance = Date.parse(nouvelleEcheance(MAINTENANT))
    expect(echeance - MAINTENANT).toBe(30 * 86_400_000)
  })
})

describe('le portefeuille du revendeur', () => {
  it('nomme la titulaire, puis compte les autres', () => {
    expect(etiquetteEquipe([{ display_name: 'Claire Fontaine', role: 'owner' }], null)).toBe('Claire Fontaine')
    expect(
      etiquetteEquipe(
        [
          { display_name: 'Chloé Martin', role: 'therapist' },
          { display_name: 'Claire Fontaine', role: 'owner' },
          { display_name: 'Rose Lambert', role: 'therapist' },
        ],
        null,
      ),
    ).toBe('Claire Fontaine et 2 autres praticiennes')
    expect(
      etiquetteEquipe(
        [
          { display_name: 'Claire Fontaine', role: 'owner' },
          { display_name: 'Chloé Martin', role: 'therapist' },
        ],
        null,
      ),
    ).toBe('Claire Fontaine et 1 autre praticienne')
  })

  it('distingue l’invitation qui court de celle qui a expiré', () => {
    expect(etiquetteEquipe([], null)).toBe('Aucune praticienne')
    expect(etiquetteEquipe([], { expires_at: '2026-10-20T00:00:00Z' }, MAINTENANT)).toBe('Invitation envoyée')
    expect(etiquetteEquipe([], { expires_at: '2026-09-01T00:00:00Z' }, MAINTENANT)).toBe('Invitation expirée')
  })
})

describe('retirer quelqu’un de l’équipe', () => {
  const titulaire = { user_id: 'moi', titulaire: true }

  it('ne propose jamais de se retirer soi-même', () => {
    expect(peutRetirer({ user_id: 'moi', role: 'owner' }, titulaire, 2)).toBe(false)
  })

  it('ne propose pas de retirer la dernière titulaire', () => {
    expect(peutRetirer({ user_id: 'autre', role: 'owner' }, titulaire, 1)).toBe(false)
    expect(peutRetirer({ user_id: 'autre', role: 'owner' }, titulaire, 2)).toBe(true)
  })

  it('ne propose rien à qui n’est pas titulaire', () => {
    expect(peutRetirer({ user_id: 'autre', role: 'therapist' }, { user_id: 'moi', titulaire: false }, 1)).toBe(false)
    expect(peutRetirer({ user_id: 'autre', role: 'therapist' }, { user_id: null, titulaire: true }, 1)).toBe(false)
    expect(peutRetirer({ user_id: 'autre', role: 'therapist' }, titulaire, 1)).toBe(true)
  })

  it('traduit chaque réponse de la base, sans jamais peindre un refus en succès', () => {
    expect(messageRetrait('ok', 'Chloé Martin')).toEqual({
      ok: true,
      message: expect.stringContaining("Chloé Martin ne fait plus partie de l'équipe"),
    })
    for (const code of ['pas_titulaire', 'soi_meme', 'derniere_titulaire', 'inconnue', null, 'imprévu']) {
      expect(messageRetrait(code, 'Chloé Martin').ok).toBe(false)
    }
    expect(messageRetrait('soi_meme', 'x').message).toMatch(/vous-même/)
  })
})

describe('les refus d’écriture d’une invitation', () => {
  it('dit au revendeur que le cabinet tenu appartient à sa titulaire', () => {
    expect(refusInvitation('42501', 'revendeur')).toMatch(/déjà sa praticienne/)
    expect(refusInvitation('42501', 'titulaire')).toMatch(/Seule la titulaire/)
  })

  it('nomme la cause plutôt qu’un échec muet', () => {
    expect(refusInvitation('23505', 'titulaire')).toMatch(/attend déjà cette adresse/)
    expect(refusInvitation('23514', 'revendeur')).toMatch(/120 caractères/)
    expect(refusInvitation(undefined, 'revendeur')).toMatch(/Réessayez/)
  })
})

describe('les adresses', () => {
  it('refuse ce qui ne ressemble pas à une adresse, comme le serveur', () => {
    expect(adressePlausible('claire@cabinet-fontaine.fr')).toBe(true)
    expect(adressePlausible('  claire@cabinet-fontaine.fr ')).toBe(true)
    expect(adressePlausible('claire@cabinet')).toBe(false)
    expect(adressePlausible('claire cabinet.fr')).toBe(false)
  })

  /* `_` et `%` sont des jokers de `ilike` : sans échappement, relancer
     jean_dupont pouvait toucher l'invitation de jeanXdupont. */
  it('échappe les jokers du motif de recherche', () => {
    expect(motifExact('jean_dupont@exemple.fr')).toBe('jean\\_dupont@exemple.fr')
    expect(motifExact('100%@exemple.fr')).toBe('100\\%@exemple.fr')
    expect(motifExact('claire@exemple.fr')).toBe('claire@exemple.fr')
  })
})

describe('les rôles', () => {
  it('parle au neutre de qui l’on ne connaît pas', () => {
    expect(libelleRole('owner')).toBe('Titulaire')
    expect(libelleRole('therapist')).toBe("Membre de l'équipe")
    expect(libelleRole('assistant')).toBe('Assistance')
  })
})
