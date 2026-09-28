import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  FRAICHEUR_LIEN_MS,
  LONGUEUR_MOT_DE_PASSE,
  entreeParLienRecente,
  lireEntrees,
  refusDuNouveau,
  type Entree,
} from './motDePasse'

/** Un jeton à la forme réelle : en-tête, charge en base64url, signature. */
function jeton(charge: object): string {
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(charge)}.signature`
}

const MAINTENANT = Date.UTC(2026, 8, 28, 12, 0, 0)
const IL_Y_A = (ms: number) => Math.floor((MAINTENANT - ms) / 1000)

describe('ce que le jeton dit de la façon d’entrer', () => {
  it('lit le champ amr d’un vrai jeton', () => {
    const t = jeton({ sub: 'u', email: 'léa@exemple.fr', amr: [{ method: 'otp', timestamp: 1700000000 }] })
    expect(lireEntrees(t)).toEqual([{ method: 'otp', timestamp: 1700000000 }])
  })

  it('rend une liste vide plutôt que de casser sur un jeton abîmé', () => {
    expect(lireEntrees(null)).toEqual([])
    expect(lireEntrees('pas-un-jeton')).toEqual([])
    expect(lireEntrees('a.%%%.c')).toEqual([])
    expect(lireEntrees(jeton({ amr: 'otp' }))).toEqual([])
    expect(lireEntrees(jeton({ amr: [{ method: 'otp' }, null, 3] }))).toEqual([])
  })
})

describe('l’ancien mot de passe, demandé ou non', () => {
  const lien = (age: number): Entree[] => [{ method: 'otp', timestamp: IL_Y_A(age) }]

  it('en dispense qui vient d’entrer par un lien reçu par courriel', () => {
    expect(entreeParLienRecente(lien(5 * 60_000), MAINTENANT)).toBe(true)
    for (const method of ['magiclink', 'recovery', 'invite']) {
      expect(entreeParLienRecente([{ method, timestamp: IL_Y_A(60_000) }], MAINTENANT)).toBe(true)
    }
  })

  it('le redemande passé vingt-quatre heures', () => {
    expect(entreeParLienRecente(lien(FRAICHEUR_LIEN_MS - 1000), MAINTENANT)).toBe(true)
    expect(entreeParLienRecente(lien(FRAICHEUR_LIEN_MS + 1000), MAINTENANT)).toBe(false)
  })

  /* Entrer par mot de passe ne prouve rien de plus que ce qu'on veut
     changer : sans cette règle, un navigateur resté ouvert suffirait à
     prendre le compte. */
  it('le redemande à qui est entré par mot de passe, même à l’instant', () => {
    expect(entreeParLienRecente([{ method: 'password', timestamp: IL_Y_A(1000) }], MAINTENANT)).toBe(false)
    expect(entreeParLienRecente([], MAINTENANT)).toBe(false)
  })

  it('ne laisse pas une horloge en avance ouvrir la porte', () => {
    expect(entreeParLienRecente([{ method: 'otp', timestamp: IL_Y_A(-3_600_000) }], MAINTENANT)).toBe(false)
  })
})

describe('le nouveau mot de passe', () => {
  it('refuse le trop court, et le dit avec le vrai chiffre', () => {
    expect(refusDuNouveau('a'.repeat(LONGUEUR_MOT_DE_PASSE - 1))).toContain(String(LONGUEUR_MOT_DE_PASSE))
    expect(refusDuNouveau(' '.repeat(20))).not.toBeNull()
    expect(refusDuNouveau('cheval agrafe batterie')).toBeNull()
  })

  it('refuse ce que bcrypt tronquerait sans rien dire', () => {
    expect(refusDuNouveau('a'.repeat(72))).toBeNull()
    expect(refusDuNouveau('a'.repeat(73))).not.toBeNull()
    // 40 « é » font 80 octets : trop, malgré 40 caractères.
    expect(refusDuNouveau('é'.repeat(40))).not.toBeNull()
  })

  it('refuse l’adresse courriel comme mot de passe', () => {
    expect(refusDuNouveau('Lea.Martin@exemple.fr', 'lea.martin@exemple.fr')).not.toBeNull()
  })
})

/* LE NAVIGATEUR NE CHANGE PLUS LE MOT DE PASSE LUI-MÊME. `updateUser` avec
   un mot de passe acceptait le changement de n'importe quelle session
   ouverte, sans rien demander. Si un écran y revenait, la vérification de
   l'ancien mot de passe deviendrait décorative : on la contournerait en
   passant par lui. (Qui l'appellerait à la main, depuis la console, bute
   sur l'option « Secure password change » du service d'authentification :
   c'est elle qui ferme la porte de ce côté-là.) */
describe('le chemin du changement', () => {
  const racine = join(dirname(fileURLToPath(import.meta.url)), '..')
  function sources(dossier: string): string[] {
    return readdirSync(dossier).flatMap((nom) => {
      const chemin = join(dossier, nom)
      if (statSync(chemin).isDirectory()) return sources(chemin)
      return /\.tsx?$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [chemin] : []
    })
  }

  it('passe toujours par le serveur, jamais par updateUser', () => {
    const fautifs = sources(racine).filter((f) => /updateUser\s*\(\s*\{[^}]*password/s.test(readFileSync(f, 'utf8')))
    expect(fautifs).toEqual([])
  })
})
