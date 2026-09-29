/**
 * Une note d'honoraires, en PDF.
 *
 * Elle se fabrique depuis la note ÉMISE — la ligne que la base a figée —,
 * jamais depuis le formulaire : réimprimée dans cinq ans, elle doit dire
 * exactement ce qu'elle disait le jour de son émission, adresse comprise.
 *
 * Aucune marque de l'application : c'est une pièce de la praticienne, elle
 * sort à son nom. Une note annulée se réimprime, barrée de sa mention.
 */
import { MENTIONS_TVA, jourLisible, montantLisible, nomFichierNote, numeroDeNote, type NoteHonoraires } from '@/lib/honoraires'
import { pourPdf } from '@/lib/pdfTexte'

/** Ce que la note imprime, dans l'ordre — la mise en page n'invente rien. */
export interface ContenuNote {
  titre: string
  numero: string
  emise: string
  praticien: string[]
  beneficiaire: string
  ligne: { date: string; designation: string; montant: string }
  total: string
  mention: string | null
  annulation: string | null
}

export function contenuDeLaNote(n: NoteHonoraires): ContenuNote {
  return {
    titre: 'Note d’honoraires',
    numero: `N° ${numeroDeNote(n.numero)}`,
    emise: `Émise le ${jourLisible(n.emiseLe)}`,
    praticien: [n.praticien, ...n.praticienAdresse.split(/\n+/), n.praticienNumero].map((l) => l.trim()).filter(Boolean),
    beneficiaire: n.beneficiaire,
    ligne: {
      date: jourLisible(n.datePrestation),
      designation: n.prestation,
      montant: montantLisible(n.montantCents),
    },
    total: montantLisible(n.montantCents),
    mention: n.mentionTva ? MENTIONS_TVA[n.mentionTva] : null,
    annulation: n.annuleeLe
      ? `Note annulée le ${jourLisible(n.annuleeLe)}. Son numéro reste attribué et ne sera pas réutilisé.`
      : null,
  }
}

const MARGE = 60
const LARGEUR = 595.28
const HAUTEUR = 841.89

/** La note téléchargée sur cet appareil. */
export async function telechargerNoteHonoraires(n: NoteHonoraires): Promise<void> {
  const doc = await composerNote(n)
  doc.save(nomFichierNote(n))
}

/** La note composée, sans l'enregistrer : ce que les tests relisent. */
export async function composerNote(n: NoteHonoraires) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const c = contenuDeLaNote(n)
  const droite = LARGEUR - MARGE
  const t = (s: string) => pourPdf(s)

  /* L'en-tête : la praticienne à gauche, la pièce à droite. */
  let y = MARGE + 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(30, 28, 24)
  doc.text(t(c.praticien[0] ?? ''), MARGE, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(70, 66, 58)
  for (const ligne of c.praticien.slice(1)) {
    for (const morceau of doc.splitTextToSize(t(ligne), 250) as string[]) {
      y += 14
      doc.text(morceau, MARGE, y)
    }
  }

  doc.setFont('times', 'normal')
  doc.setFontSize(22)
  doc.setTextColor(30, 28, 24)
  doc.text(t(c.titre), droite, MARGE + 16, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.text(t(c.numero), droite, MARGE + 38, { align: 'right' })
  doc.setTextColor(90, 85, 76)
  doc.text(t(c.emise), droite, MARGE + 54, { align: 'right' })

  /* Le bénéficiaire. */
  y = Math.max(y, MARGE + 54) + 46
  doc.setFontSize(9)
  doc.setTextColor(120, 114, 104)
  doc.text(t('BÉNÉFICIAIRE'), MARGE, y)
  y += 16
  doc.setFontSize(11.5)
  doc.setTextColor(30, 28, 24)
  doc.text(t(c.beneficiaire), MARGE, y)

  /* La prestation : une ligne de tableau, et son total. */
  y += 40
  const colDesignation = MARGE + 130
  doc.setDrawColor(200, 194, 182)
  doc.line(MARGE, y - 14, droite, y - 14)
  doc.setFontSize(9)
  doc.setTextColor(120, 114, 104)
  doc.text(t('DATE'), MARGE, y)
  doc.text(t('DÉSIGNATION'), colDesignation, y)
  doc.text(t('MONTANT'), droite, y, { align: 'right' })
  y += 10
  doc.line(MARGE, y, droite, y)
  y += 20
  doc.setFontSize(10.5)
  doc.setTextColor(30, 28, 24)
  doc.text(t(c.ligne.date), MARGE, y)
  const designation = doc.splitTextToSize(t(c.ligne.designation), droite - colDesignation - 90) as string[]
  doc.text(designation, colDesignation, y)
  doc.text(t(c.ligne.montant), droite, y, { align: 'right' })
  y += designation.length * 14 + 10
  doc.line(MARGE, y, droite, y)
  y += 22
  doc.setFont('helvetica', 'bold')
  doc.text(t('Total'), colDesignation, y)
  doc.text(t(c.total), droite, y, { align: 'right' })

  if (c.mention) {
    y += 30
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(70, 66, 58)
    doc.text(t(c.mention), MARGE, y)
  }

  /* Annulée : la mention se voit d'abord, en tête et sous le total. */
  if (c.annulation) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(160, 50, 40)
    doc.text(t('ANNULÉE'), droite, MARGE + 76, { align: 'right' })
    y += 34
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(doc.splitTextToSize(t(c.annulation), droite - MARGE) as string[], MARGE, y)
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(150, 144, 132)
  doc.text(t(`${c.praticien[0] ?? ''} · ${c.titre} ${c.numero}`), MARGE, HAUTEUR - 36)

  return doc
}
