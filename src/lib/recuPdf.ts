/**
 * Le reçu d'un achat en boutique, en PDF.
 *
 * Il se fabrique sur l'appareil, depuis ce que le serveur a relu en base
 * (`recuDeCommande`) — jamais depuis l'écran : réimprimé dans un an, il dit
 * la même chose, y compris un remboursement survenu depuis.
 *
 * Aucune marque de l'application : c'est une pièce du cabinet, qui sort à
 * son nom. Même gabarit que la note d'honoraires, pour que les deux pièces
 * se reconnaissent l'une l'autre.
 */
import { pourPdf } from '@/lib/pdfTexte'
import { contenuDuRecu, nomFichierRecu, type DonneesRecu } from '@/lib/ventes'

const MARGE = 60
const LARGEUR = 595.28
const HAUTEUR = 841.89

/** Le reçu téléchargé sur cet appareil. */
export async function telechargerRecu(d: DonneesRecu): Promise<string> {
  const doc = await composerRecu(d)
  const nom = nomFichierRecu(d)
  doc.save(nom)
  return nom
}

/** Le reçu composé, sans l'enregistrer : ce que les tests relisent. */
export async function composerRecu(d: DonneesRecu) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const c = contenuDuRecu(d)
  const droite = LARGEUR - MARGE
  const t = (s: string) => pourPdf(s)

  /* L'en-tête : le cabinet à gauche, la pièce à droite. */
  let y = MARGE + 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(30, 28, 24)
  doc.text(t(c.emetteur[0] ?? ''), MARGE, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(70, 66, 58)
  for (const ligne of c.emetteur.slice(1)) {
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
  doc.text(t(c.reference), droite, MARGE + 38, { align: 'right' })

  /* Qui a payé. */
  y = Math.max(y, MARGE + 38) + 46
  if (c.payeur) {
    doc.setFontSize(9)
    doc.setTextColor(120, 114, 104)
    doc.text(t('RÉGLÉ PAR'), MARGE, y)
    y += 16
    doc.setFontSize(11.5)
    doc.setTextColor(30, 28, 24)
    doc.text(t(c.payeur), MARGE, y)
    y += 40
  }

  /* L'achat : une ligne de tableau, et son total. */
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
  doc.text(t('Total payé'), colDesignation, y)
  doc.text(t(c.total), droite, y, { align: 'right' })

  /* Comment, et sous quelle référence Stripe le retrouve. */
  y += 34
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(70, 66, 58)
  doc.text(t(c.moyen), MARGE, y)
  if (c.paiement) {
    y += 14
    doc.text(t(c.paiement), MARGE, y)
  }

  /* Remboursé : la mention se voit d'abord, en tête et sous le total. */
  if (c.remboursement) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(160, 50, 40)
    doc.text(t('REMBOURSÉ'), droite, MARGE + 60, { align: 'right' })
    y += 30
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(doc.splitTextToSize(t(c.remboursement), droite - MARGE) as string[], MARGE, y)
  }

  const pied = doc.splitTextToSize(t(c.pied), droite - MARGE) as string[]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(150, 144, 132)
  doc.text(pied, MARGE, HAUTEUR - 50)
  doc.text(t(`${c.emetteur[0] ?? ''} · ${c.titre} · ${c.reference}`), MARGE, HAUTEUR - 36)

  return doc
}
