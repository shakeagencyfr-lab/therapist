import { beforeEach, describe, expect, it, vi } from 'vitest'
import { agirVolet, lireVolet } from './cabinet'
import { HttpError } from './errors'

/* L'identification est la seule chose qu'on remplace : elle demande la base.
   Tout le reste — le routage, les refus — est le vrai code. */
const identifier = vi.hoisted(() => vi.fn())
vi.mock('./auth', async (original) => ({ ...(await original<typeof import('./auth')>()), identifier }))

/** Le statut d'un refus, ou « aucun » si la promesse aboutit. */
async function statut(promesse: Promise<unknown>): Promise<number | 'aucun'> {
  try {
    await promesse
    return 'aucun'
  } catch (err) {
    return err instanceof HttpError ? err.status : -1
  }
}

describe('la route des réglages du cabinet', () => {
  beforeEach(() => {
    identifier.mockReset()
    identifier.mockImplementation(async (token: string | null) => {
      if (!token) throw new HttpError(401, 'Connectez-vous pour utiliser cette fonction.')
      return { userId: 'u1', cabinetId: 'c1' }
    })
  })

  /* Un visiteur non connecté recevait « Réglage inconnu. » : la route se
     décrivait avant de savoir à qui elle parlait. */
  it('dit 401 à un appel sans session, même pour un volet inconnu', async () => {
    expect(await statut(lireVolet(undefined, null))).toBe(401)
    expect(await statut(lireVolet('nimporte', null))).toBe(401)
    expect(await statut(agirVolet({ volet: 'nimporte' }, null))).toBe(401)
    expect(await statut(agirVolet({ volet: 'domaine', action: 'nimporte' }, null))).toBe(401)
    expect(await statut(agirVolet({ volet: 'droits', action: 'regler' }, null))).toBe(401)
  })

  it('dit ce qui ne va pas à un compte reconnu', async () => {
    await expect(lireVolet('nimporte', 'jeton')).rejects.toMatchObject({ status: 400, message: 'Réglage inconnu.' })
    await expect(agirVolet({ volet: 'nimporte' }, 'jeton')).rejects.toMatchObject({ status: 400 })
    await expect(agirVolet({ volet: 'smtp', action: 'nimporte' }, 'jeton')).rejects.toMatchObject({
      status: 400,
      message: 'Action inconnue.',
    })
  })

  /* Un cabinet qui relèverait son propre plafond n'aurait pas de plafond. */
  it("refuse à un cabinet reconnu de régler son offre", async () => {
    expect(await statut(agirVolet({ volet: 'droits', action: 'regler' }, 'jeton'))).toBe(403)
  })

  it('connaît le volet des jetons, et y refuse une action inconnue', async () => {
    await expect(agirVolet({ volet: 'jetons', action: 'nimporte' }, 'jeton')).rejects.toMatchObject({
      status: 400,
      message: 'Action inconnue.',
    })
    expect(await statut(lireVolet('jetons', null))).toBe(401)
  })

  it("n'identifie qu'une fois pour un refus", async () => {
    await statut(lireVolet('nimporte', 'jeton'))
    expect(identifier).toHaveBeenCalledTimes(1)
    expect(identifier).toHaveBeenCalledWith('jeton')
  })
})
