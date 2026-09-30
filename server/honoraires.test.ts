import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envoyerParPlateforme, nomAffiche } from './courriel'
import { HttpError } from './errors'
import {
  PDF_MAX_OCTETS,
  courrielDeLaNote,
  envoyerNoteHonoraires,
  lireDemandeEnvoi,
  nomDuFichier,
  type PreparationEnvoi,
} from './honoraires'

/* Ce qu'on remplace : l'identification et la clé de service, qui demandent
   la base, et le SMTP du cabinet. Le reste — la lecture de la demande, le
   courriel composé, l'appel au service d'envoi — est le vrai code. */
const auth = vi.hoisted(() => ({
  identifierPourGesteSensible: vi.fn(),
  clientAdmin: vi.fn(),
}))
vi.mock('./auth', async (original) => ({ ...(await original<typeof import('./auth')>()), ...auth }))
const smtp = vi.hoisted(() => ({ smtpDuCabinet: vi.fn() }))
vi.mock('./courriel', async (original) => ({ ...(await original<typeof import('./courriel')>()), ...smtp }))

const NOTE = '2b7c0f4e-3a1d-4c2e-9f60-0d5a8e1b2c3d'
const PDF = Buffer.from('%PDF-1.3\n1 0 obj\n<<>>\nendobj\n%%EOF\n')

const PREP: PreparationEnvoi = {
  envoi: 'e0b1c2d3-0000-4000-8000-000000000001',
  destinataire: 'anna@exemple.fr',
  numero: 12,
  date_prestation: '2026-09-29',
  beneficiaire: 'Anna Martin',
  praticien: 'Hélène Marchal',
  cabinet: 'Cabinet des Tilleuls',
  repondre_a: 'helene@exemple.fr',
}

async function statut(promesse: Promise<unknown>): Promise<number | 'aucun'> {
  try {
    await promesse
    return 'aucun'
  } catch (err) {
    return err instanceof HttpError ? err.status : -1
  }
}

describe('lireDemandeEnvoi — ce que le navigateur a le droit d’envoyer', () => {
  it('lit une note et son PDF', () => {
    const d = lireDemandeEnvoi({ noteId: NOTE, pdf: PDF.toString('base64') })
    expect(d.noteId).toBe(NOTE)
    expect(d.pdf.equals(PDF)).toBe(true)
  })

  it('refuse ce qui n’est pas une note', () => {
    expect(() => lireDemandeEnvoi({ noteId: 'x', pdf: PDF.toString('base64') })).toThrow(HttpError)
    expect(() => lireDemandeEnvoi(null)).toThrow(HttpError)
  })

  /* La pièce jointe part sous le nom du cabinet : ce doit être un PDF, pas
     n'importe quel fichier que le navigateur aurait glissé là. */
  it('refuse ce qui n’est pas un PDF', () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>').toString('base64')
    expect(() => lireDemandeEnvoi({ noteId: NOTE, pdf: html })).toThrow(/illisible/)
    expect(() => lireDemandeEnvoi({ noteId: NOTE, pdf: 'pas du base64 !' })).toThrow(/illisible/)
  })

  it('refuse un PDF trop lourd, avant même de le décoder', () => {
    const lourd = Buffer.concat([PDF, Buffer.alloc(PDF_MAX_OCTETS)]).toString('base64')
    expect(() => lireDemandeEnvoi({ noteId: NOTE, pdf: lourd })).toThrow(HttpError)
  })
})

describe('courrielDeLaNote — ce que le patient reçoit', () => {
  it('dit la note, sa séance et qui l’envoie', () => {
    const c = courrielDeLaNote(PREP)
    expect(c.subject).toBe('Votre note d’honoraires n° 0012')
    expect(c.text).toContain('Bonjour Anna Martin,')
    expect(c.text).toContain('n° 0012, pour la séance du 29 septembre 2026')
    expect(c.text).toContain('Hélène Marchal\nCabinet des Tilleuls')
  })

  /* Une pièce du cabinet : ni le nom de l'application, ni lien, ni montant. */
  it('ne dit rien de l’application, et ne porte ni lien ni montant', () => {
    const c = courrielDeLaNote(PREP)
    for (const partie of [c.subject, c.text, c.html ?? '']) {
      expect(partie).not.toMatch(/klaro|shake|https?:|€/i)
    }
  })

  it('échappe ce que la fiche contient', () => {
    const c = courrielDeLaNote({ ...PREP, beneficiaire: '<img src=x onerror=alert(1)>' })
    expect(c.html).not.toContain('<img')
    expect(c.html).toContain('&lt;img')
  })

  it('nomme le fichier par son numéro seul', () => {
    expect(nomDuFichier(PREP)).toBe('note-d-honoraires-0012.pdf')
  })

  it('le nom affiché ne sort pas de son en-tête', () => {
    expect(nomAffiche('Cabinet "X"\r\nBcc: tous@exemple.fr <a>')).toBe('Cabinet X Bcc: tous@exemple.fr a')
  })
})

describe('envoyerParPlateforme — le service d’envoi', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 're_test_cle')
    vi.stubEnv('PUBLIC_SITE_URL', 'https://klaroweb.site')
    vi.stubEnv('COURRIEL_EXPEDITEUR', '')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('envoie depuis notre domaine, au nom du cabinet, la réponse chez la praticienne', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'x' }), { status: 200 }))
    await envoyerParPlateforme(
      {
        to: 'anna@exemple.fr',
        fromName: 'Cabinet des Tilleuls',
        replyTo: 'helene@exemple.fr',
        subject: 'S',
        text: 'T',
        pieces: [{ nom: 'n.pdf', contenu: PDF, type: 'application/pdf' }],
      },
      'idem-1',
    )
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    const entetes = init.headers as Record<string, string>
    expect(entetes.Authorization).toBe('Bearer re_test_cle')
    expect(entetes['Idempotency-Key']).toBe('idem-1')
    const corps = JSON.parse(init.body as string)
    expect(corps.from).toBe('"Cabinet des Tilleuls" <notes@klaroweb.site>')
    expect(corps.to).toEqual(['anna@exemple.fr'])
    expect(corps.reply_to).toEqual(['helene@exemple.fr'])
    expect(corps.attachments[0]).toMatchObject({ filename: 'n.pdf', content: PDF.toString('base64') })
  })

  it('sans clé, ne tente rien et le dit', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    expect(await statut(envoyerParPlateforme({ to: 'a@b.fr', subject: 's', text: 't' }))).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un refus du service est une erreur, pas un succès', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ name: 'rate_limit_exceeded' }), { status: 429 }))
    expect(await statut(envoyerParPlateforme({ to: 'a@b.fr', subject: 's', text: 't' }))).toBe(429)
    fetchMock.mockResolvedValue(new Response('{}', { status: 422 }))
    expect(await statut(envoyerParPlateforme({ to: 'a@b.fr', subject: 's', text: 't' }))).toBe(502)
  })
})

describe('envoyerNoteHonoraires — la base choisit le destinataire', () => {
  const fetchMock = vi.fn()
  const rpc = vi.fn()
  const statuts: string[] = []

  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 're_test_cle')
    vi.stubEnv('PUBLIC_SITE_URL', 'https://klaroweb.site')
    vi.stubEnv('COURRIEL_EXPEDITEUR', '')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    rpc.mockReset()
    statuts.length = 0
    auth.identifierPourGesteSensible.mockResolvedValue({ userId: 'u1', cabinetId: 'c1', client: { rpc } })
    auth.clientAdmin.mockReturnValue({
      from: () => ({
        update: (v: { statut: string }) => {
          statuts.push(v.statut)
          return { eq: async () => ({ error: null }) }
        },
      }),
    })
    smtp.smtpDuCabinet.mockResolvedValue(null)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('envoie à l’adresse de la fiche, pas à celle que le navigateur glisserait', async () => {
    rpc.mockResolvedValue({ data: PREP, error: null })
    fetchMock.mockResolvedValue(new Response('{"id":"x"}', { status: 200 }))
    const r = await envoyerNoteHonoraires('jeton', {
      noteId: NOTE,
      pdf: PDF.toString('base64'),
      to: 'intrus@exemple.fr',
    })
    expect(rpc).toHaveBeenCalledWith('cabinet_preparer_envoi_note_honoraires', { p_note: NOTE })
    const corps = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(corps.to).toEqual(['anna@exemple.fr'])
    expect(JSON.stringify(corps)).not.toContain('intrus')
    expect(r.destinataire).toBe('anna@exemple.fr')
    expect(statuts).toEqual(['parti'])
  })

  it('rend tel quel le refus de la base, en français', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'Cette note est annulée : elle ne s’envoie plus.' } })
    await expect(envoyerNoteHonoraires('jeton', { noteId: NOTE, pdf: PDF.toString('base64') })).rejects.toMatchObject({
      status: 409,
      message: 'Cette note est annulée : elle ne s’envoie plus.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un envoi manqué est noté en échec', async () => {
    rpc.mockResolvedValue({ data: PREP, error: null })
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }))
    expect(await statut(envoyerNoteHonoraires('jeton', { noteId: NOTE, pdf: PDF.toString('base64') }))).toBe(502)
    expect(statuts).toEqual(['echec'])
  })

  /* Sans moyen d'envoi, rien ne s'inscrit : une ligne « en cours » ne vient
     pas ronger les plafonds pour un courriel qui ne pouvait pas partir. */
  it('sans moyen d’envoi, n’inscrit rien', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    expect(await statut(envoyerNoteHonoraires('jeton', { noteId: NOTE, pdf: PDF.toString('base64') }))).toBe(503)
    expect(rpc).not.toHaveBeenCalled()
  })
})
