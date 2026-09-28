import { describe, expect, it } from 'vitest'
import {
  adresseValide,
  etatAcces,
  libelleAcces,
  messageCreation,
  normaliserAdresse,
  refusAdresse,
} from './accesPatient'

describe("l'état de son espace, lu sur la fiche", () => {
  it('distingue la fiche sans adresse, celle qui attend, celle qui est ouverte', () => {
    expect(etatAcces({})).toBe('sans-adresse')
    expect(etatAcces({ email: '   ' })).toBe('sans-adresse')
    expect(etatAcces({ email: 'marc@exemple.fr' })).toBe('en-attente')
    expect(etatAcces({ email: 'marc@exemple.fr', compteActif: true })).toBe('active')
  })

  /* Un compte rattaché ouvre l'espace, même si l'écran n'a pas l'adresse. */
  it('dit « activé » dès qu’un compte est rattaché', () => {
    expect(etatAcces({ email: '', compteActif: true })).toBe('active')
  })

  it('nomme l’adresse quand il y en a une', () => {
    expect(libelleAcces('active', 'marc@exemple.fr')).toContain('marc@exemple.fr')
    expect(libelleAcces('en-attente', 'marc@exemple.fr')).toMatch(/pas encore activé.*marc@exemple\.fr/)
    expect(libelleAcces('sans-adresse', '')).toMatch(/Aucune adresse/)
  })
})

describe("l'adresse, telle qu'on l'écrit", () => {
  it('se range en minuscules, sans espaces autour', () => {
    expect(normaliserAdresse('  Marc.D@Exemple.FR ')).toBe('marc.d@exemple.fr')
  })

  it('se contrôle comme le serveur et la base la contrôlent', () => {
    expect(adresseValide('marc@exemple.fr')).toBe(true)
    expect(adresseValide('marc@exemple')).toBe(false)
    expect(adresseValide('marc exemple.fr')).toBe(false)
    expect(adresseValide('marc@@exemple.fr')).toBe(false)
    expect(adresseValide('')).toBe(false)
  })

  it('dit la collision en toutes lettres', () => {
    expect(refusAdresse({ code: '23505', message: 'duplicate key' }, 'marc@exemple.fr')).toBe(
      "Une autre fiche de votre cabinet porte déjà l'adresse marc@exemple.fr.",
    )
  })

  /* La base écrit ses refus pour être lus (0045) : on ne les réécrit pas. */
  it('rend tel quel le refus que la base a écrit', () => {
    const msg = 'Son espace est activé : sa fiche garde une adresse.'
    expect(refusAdresse({ code: '23514', message: msg }, 'x@y.fr')).toBe(msg)
  })

  it('ne montre pas une panne comme un code', () => {
    expect(refusAdresse({ code: '08006', message: 'connection failure' }, 'x@y.fr')).toBe(
      "L'adresse n'a pas pu être enregistrée. Réessayez.",
    )
  })
})

describe('la phrase qui suit la création', () => {
  /* On ne sait rien de la personne en créant sa fiche : ni « ajoutée », ni
     « elle ». La fiche, et son espace. */
  it('ne présume pas du genre du patient', () => {
    const cas = [
      messageCreation('Marc', '', null),
      messageCreation('Marc', 'marc@exemple.fr', { ok: true, message: '' }),
      messageCreation('Marc', 'marc@exemple.fr', { ok: false, message: '' }),
    ]
    for (const { message } of cas) {
      expect(message).toMatch(/^La fiche de Marc est créée\./)
      expect(message).not.toMatch(/ajoutée|\bElle\b|\bIl\b/)
    }
  })

  it('renvoie aux réglages de la fiche quand il manque l’adresse', () => {
    const r = messageCreation('Marc', '', null)
    expect(r.partiel).toBe(false)
    expect(r.message).toMatch(/Réglages de la fiche/)
  })

  it('reprend la phrase du serveur, et sa couleur', () => {
    const parti = messageCreation('Marc', 'marc@exemple.fr', { ok: true, message: 'Invitation envoyée.' })
    expect(parti).toEqual({ message: 'La fiche de Marc est créée. Invitation envoyée.', partiel: false })
    const rate = messageCreation('Marc', 'marc@exemple.fr', { ok: false, message: 'Rien n’est parti.' })
    expect(rate.partiel).toBe(true)
  })

  it('dit comment rattraper un lien qui n’est pas parti', () => {
    const r = messageCreation('Marc', 'marc@exemple.fr', { ok: false, message: '' })
    expect(r.partiel).toBe(true)
    expect(r.message).toMatch(/renvoyez-le/)
  })
})
