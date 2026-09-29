/**
 * La note d'honoraires, envoyée au patient par courriel (migration 0064).
 *
 * Le PDF est celui que la praticienne vient de télécharger : fabriqué dans
 * son navigateur, avec son logo, il part tel quel en pièce jointe. Tout le
 * reste se décide ici ou dans la base, jamais dans le navigateur :
 *
 *   - LE DESTINATAIRE est l'adresse de la fiche, lue par la base
 *     (`cabinet_preparer_envoi_note_honoraires`) sous l'identité de la
 *     praticienne. Le corps de la requête n'en porte pas.
 *   - CE QUI EST DIT — l'objet, le texte — se compose ici depuis la note
 *     figée : numéro, date, bénéficiaire, praticienne.
 *   - LA PIÈCE JOINTE doit être un PDF, et d'une taille de note.
 *
 * L'envoi part de l'adresse du cabinet s'il a son serveur d'envoi (marque
 * blanche), sinon de celle de la plateforme. Ni l'un ni l'autre : la note se
 * télécharge, et l'écran le dit.
 */
import { clientAdmin, exigerCabinet, identifier, identifierPourGesteSensible } from './auth.js'
import {
  ENVOI_HORS_SERVICE,
  envoyerParCabinet,
  envoyerParPlateforme,
  plateformeConfiguree,
  smtpDuCabinet,
  type Courriel,
} from './courriel.js'
import { HttpError } from './errors.js'

/** Ce que l'écran sait avant de proposer la case. */
export interface EtatEnvoiNotes {
  possible: boolean
  /** D'où part le courriel : l'adresse du cabinet, ou celle de la plateforme. */
  depuis: 'cabinet' | 'plateforme' | null
}

export async function etatEnvoiNotes(token: string | null): Promise<EtatEnvoiNotes> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  if (await smtpDuCabinet(cabinetId)) return { possible: true, depuis: 'cabinet' }
  return plateformeConfiguree() ? { possible: true, depuis: 'plateforme' } : { possible: false, depuis: null }
}

/* ------------------------------------------------------------------ *
 * La demande
 * ------------------------------------------------------------------ */

/**
 * Une note tient sur une page : quelques dizaines de kilo-octets, un peu
 * plus avec un logo. Un mégaoctet laisse une large marge et reste loin de ce
 * que l'hébergeur accepte dans un corps de requête.
 */
export const PDF_MAX_OCTETS = 1_000_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface DemandeEnvoi {
  noteId: string
  pdf: Buffer
}

export function lireDemandeEnvoi(raw: unknown): DemandeEnvoi {
  const body = (raw && typeof raw === 'object' ? raw : {}) as { noteId?: unknown; pdf?: unknown }
  const noteId = typeof body.noteId === 'string' ? body.noteId.trim() : ''
  if (!UUID.test(noteId)) throw new HttpError(400, 'Note inconnue.')
  const texte = typeof body.pdf === 'string' ? body.pdf.replace(/\s+/g, '') : ''
  // Le base64 d'un mégaoctet en fait un et un tiers : on refuse avant de décoder.
  if (!texte || texte.length > Math.ceil((PDF_MAX_OCTETS * 4) / 3) + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(texte)) {
    throw new HttpError(400, 'Le PDF de la note est illisible : téléchargez-la de nouveau, puis renvoyez-la.')
  }
  const pdf = Buffer.from(texte, 'base64')
  if (pdf.length > PDF_MAX_OCTETS) {
    throw new HttpError(413, 'Le PDF de la note est trop lourd pour partir par courriel.')
  }
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new HttpError(400, 'Le PDF de la note est illisible : téléchargez-la de nouveau, puis renvoyez-la.')
  }
  return { noteId, pdf }
}

/* ------------------------------------------------------------------ *
 * Le courriel
 * ------------------------------------------------------------------ */

/** Ce que la base rend en inscrivant l'envoi. */
export interface PreparationEnvoi {
  envoi: string
  destinataire: string
  numero: number
  /** « AAAA-MM-JJ » */
  date_prestation: string
  beneficiaire: string
  praticien: string
  cabinet: string
  repondre_a: string | null
}

const numeroDeNote = (n: number) => String(Math.max(0, Math.trunc(n))).padStart(4, '0')

function jourEnLettres(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return jour
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
}

function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** Le nom du fichier joint : le numéro seul, sans le nom de la personne. */
export function nomDuFichier(p: Pick<PreparationEnvoi, 'numero'>): string {
  return `note-d-honoraires-${numeroDeNote(p.numero)}.pdf`
}

/**
 * L'objet et le texte : sobres, au nom de la praticienne, sans montant ni
 * lien — rien de ce qui fait passer un courriel pour indésirable, rien de
 * l'application non plus : c'est une pièce du cabinet.
 */
export function courrielDeLaNote(p: PreparationEnvoi): Pick<Courriel, 'subject' | 'text' | 'html'> {
  const numero = numeroDeNote(p.numero)
  const jour = jourEnLettres(p.date_prestation)
  const signature = [p.praticien.trim(), p.cabinet.trim() && p.cabinet.trim() !== p.praticien.trim() ? p.cabinet.trim() : '']
    .filter(Boolean)
  const phrase = `Vous trouverez ci-joint votre note d’honoraires n° ${numero}, pour la séance du ${jour}.`
  const text = [`Bonjour ${p.beneficiaire.trim()},`, '', phrase, '', 'Bien à vous,', ...signature].join('\n')
  const html =
    `<p>Bonjour ${echapper(p.beneficiaire.trim())},</p>` +
    `<p>${echapper(phrase)}</p>` +
    `<p>Bien à vous,<br>${signature.map(echapper).join('<br>')}</p>`
  return { subject: `Votre note d’honoraires n° ${numero}`, text, html }
}

/* ------------------------------------------------------------------ *
 * L'envoi
 * ------------------------------------------------------------------ */

export interface RetourEnvoi {
  ok: true
  message: string
  destinataire: string
}

/** Les refus de la base sont déjà dits en français : on les rend tels quels. */
function refusDeLaBase(error: { code?: string; message?: string }): HttpError {
  if (error.code === 'P0002') return new HttpError(404, error.message ?? 'Cette note n’existe pas.')
  if (error.code === '23514' && error.message) return new HttpError(409, error.message)
  console.error(`[honoraires] préparation — ${error.code ?? ''}`)
  return new HttpError(502, "L'envoi n'a pas pu être préparé. Réessayez dans un instant.")
}

async function noterIssue(envoi: string, statut: 'parti' | 'echec'): Promise<void> {
  const admin = clientAdmin()
  if (!admin) return
  const { error } = await admin.from('notes_honoraires_envois').update({ statut }).eq('id', envoi)
  if (error) console.error(`[honoraires] issue de l'envoi non notée — ${error.code ?? ''}`)
}

export async function envoyerNoteHonoraires(token: string | null, raw: unknown): Promise<RetourEnvoi> {
  /* Un courriel qui porte une pièce du dossier : même porte que le dossier,
     second facteur compris quand le compte en a un. */
  const appelant = await identifierPourGesteSensible(token)
  const cabinetId = exigerCabinet(appelant)
  const demande = lireDemandeEnvoi(raw)

  /* Avant d'inscrire quoi que ce soit : sans moyen d'envoi, aucune ligne
     « en cours » ne vient ronger les plafonds. */
  const smtp = await smtpDuCabinet(cabinetId)
  if (!smtp && !plateformeConfiguree()) throw new HttpError(503, ENVOI_HORS_SERVICE)

  const { data, error } = await appelant.client.rpc('cabinet_preparer_envoi_note_honoraires', {
    p_note: demande.noteId,
  })
  if (error) throw refusDeLaBase(error)
  const prep = data as PreparationEnvoi

  const courriel: Courriel = {
    to: prep.destinataire,
    fromName: prep.cabinet || prep.praticien,
    replyTo: prep.repondre_a ?? undefined,
    ...courrielDeLaNote(prep),
    pieces: [{ nom: nomDuFichier(prep), contenu: demande.pdf, type: 'application/pdf' }],
  }
  try {
    const parti = smtp ? await envoyerParCabinet(cabinetId, courriel) : false
    if (!parti) {
      if (smtp) throw new HttpError(502, "Les réglages d'envoi du cabinet ont changé pendant l'envoi. Réessayez.")
      await envoyerParPlateforme(courriel, prep.envoi)
    }
  } catch (err) {
    await noterIssue(prep.envoi, 'echec')
    throw err
  }
  await noterIssue(prep.envoi, 'parti')
  return { ok: true, message: `Note envoyée à ${prep.destinataire}.`, destinataire: prep.destinataire }
}
