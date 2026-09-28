import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { corpsInvitation, courrielNonParti, dejaInscrit, modeleSelonRole } from './invitations.js'

/**
 * « Ce compte existe déjà » n'est pas « ça n'a pas marché ».
 *
 * Les deux appels qui ouvrent un compte — `generateLink` puis, en repli,
 * `inviteUserByEmail` — posent la même question, et la posaient chacun à sa
 * manière : l'un cherchait trois mots, l'autre un seul. Une panne lue comme
 * un compte existant devient un bandeau vert à l'écran.
 */
describe('dejaInscrit', () => {
  it('reconnaît le compte existant, quel que soit le mot employé', () => {
    for (const cas of [
      { message: 'A user with this email address has already been registered' },
      { message: 'Email address already registered by another user' },
      { message: 'User already exists' },
      { message: 'Database error', status: 422 },
    ]) {
      expect({ ...cas, vu: dejaInscrit(cas) }).toEqual({ ...cas, vu: true })
    }
  })

  it('ne prend pas une panne pour un compte existant', () => {
    expect(dejaInscrit(null)).toBe(false)
    expect(dejaInscrit({ message: 'fetch failed' })).toBe(false)
    expect(dejaInscrit({ message: 'Internal server error', status: 500 })).toBe(false)
    expect(dejaInscrit({ message: 'Too many requests', status: 429 })).toBe(false)
    expect(dejaInscrit({ message: null, status: null })).toBe(false)
  })
})

/**
 * Le courriel qui n'est pas parti ne s'annonce pas en vert.
 *
 * `generateLink` ouvre le compte au moment où il fabrique le lien. Si le
 * serveur du cabinet refuse ensuite l'envoi, le service de la plateforme ne
 * peut plus rien : il n'invite qu'un compte neuf, et répond « déjà inscrite »
 * sur celui que nous venons d'ouvrir. C'est cette réponse qui remontait à
 * l'écran, en succès, pendant que personne ne recevait rien.
 */
describe('courrielNonParti', () => {
  const r = courrielNonParti('marie@exemple.fr')

  it("n'est pas un succès", () => {
    expect(r.status).toBe(502)
    expect(r.body.ok).toBeUndefined()
  })

  it('dit ce qui est vrai : rien n’est parti, mais le compte est ouvert', () => {
    expect(r.body.message).toMatch(/n'est pas parti/)
    expect(r.body.message).toContain('marie@exemple.fr')
    expect(r.body.message).toMatch(/ouvert/)
    expect(r.body.message).not.toMatch(/déjà un compte/)
  })
})

/**
 * Le repli de la plateforme est INTERDIT une fois le lien fabriqué.
 *
 * Ce n'est pas une préférence : `inviteUserByEmail` appelé après
 * `generateLink` répond forcément 422, que le code d'à côté traduit en « elle
 * a déjà un compte ». Le chemin doit donc s'arrêter avant.
 */
describe('envoyerInvitation', () => {
  it("répond dès que le lien est fabriqué, sans repasser par la plateforme", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'invitations.ts'), 'utf8')
    const lien = source.indexOf('if (lien) {')
    const repli = source.indexOf('inviteUserByEmail')
    expect(lien).toBeGreaterThan(-1)
    expect(repli).toBeGreaterThan(lien)
    expect(source.slice(lien, repli)).toContain('return courrielNonParti(email)')
  })
})

/**
 * Le courriel dit ce que l'invitation ouvre vraiment.
 *
 * Une consœur recevait le même texte que la titulaire : « ce lien vous en rend
 * propriétaire ». Le modèle se lit désormais sur le rôle en base, jamais sur
 * ce que le navigateur a demandé.
 */
describe('le courriel selon le rôle', () => {
  it('la titulaire ouvre le cabinet, tout autre rôle rejoint son équipe', () => {
    expect(modeleSelonRole('owner')).toBe('praticienne')
    expect(modeleSelonRole('therapist')).toBe('consoeur')
    expect(modeleSelonRole('assistant')).toBe('consoeur')
    expect(modeleSelonRole(null)).toBe('consoeur')
  })

  it('ne promet pas la propriété du cabinet à un membre de l’équipe', () => {
    const c = corpsInvitation('consoeur', 'Cabinet Fontaine', 'https://exemple.fr/lien')
    expect(c.subject).toBe("Rejoindre l'équipe de Cabinet Fontaine")
    expect(c.text).toContain('Cabinet Fontaine vous ouvre une place dans son équipe')
    expect(c.text).not.toMatch(/propriétaire/)
    expect(c.html).toContain('https://exemple.fr/lien')
  })

  it('garde pour la titulaire le courriel d’ouverture', () => {
    const c = corpsInvitation('praticienne', 'Cabinet Fontaine', 'https://exemple.fr/lien')
    expect(c.subject).toBe('Cabinet Fontaine vous attend')
    expect(c.text).toMatch(/propriétaire/)
  })
})

/**
 * Le code, à côté du lien.
 *
 * Sur iPhone, le lien du courriel s'ouvre dans Safari : l'espace installé sur
 * l'écran d'accueil, dont la session vit à part, restait à la porte. Le code
 * se tape dans l'application elle-même.
 */
describe('le code dans le courriel', () => {
  it('accompagne le lien quand le service l’a fourni, avec le geste pour s’en servir', () => {
    const c = corpsInvitation('patient', 'Cabinet Fontaine', 'https://exemple.fr/lien', '482913')
    expect(c.text).toContain('482913')
    expect(c.html).toContain('482913')
    // Le libellé cité est celui de la porte : l'un ne change pas sans l'autre.
    expect(c.text).toContain("« J'ai déjà reçu un code »")
    expect(c.text).toMatch(/sans ce lien ou ce code/)
    expect(c.html).toContain('https://exemple.fr/lien')
  })

  it('ne parle pas de code quand il n’y en a pas', () => {
    const c = corpsInvitation('patient', 'Cabinet Fontaine', 'https://exemple.fr/lien')
    expect(c.text).not.toMatch(/code/)
    expect(c.html).not.toMatch(/code/)
  })

  it('n’insère dans le HTML que des chiffres', () => {
    const c = corpsInvitation('patient', 'Cabinet Fontaine', 'https://exemple.fr/lien', '<img src=x>')
    expect(c.html).not.toContain('<img')
    expect(c.text).not.toMatch(/code/)
  })

  it('garde le libellé que la porte affiche vraiment', () => {
    const porte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'auth', 'SignIn.tsx'), 'utf8')
    expect(porte).toContain(`"J'ai déjà reçu un code"`)
  })
})
