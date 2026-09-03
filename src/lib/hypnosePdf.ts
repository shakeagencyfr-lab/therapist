/**
 * Une hypnose, en PDF, prête à être lue à voix haute.
 *
 * Ce n'est pas un export de données : c'est un document de travail. La
 * thérapeute l'imprime ou l'ouvre sur une tablette et le LIT, devant
 * quelqu'un, pendant une demi-heure. Toute la mise en page découle de là.
 *
 *   UN CORPS DE 13 POINTS ET UN INTERLIGNE LARGE. On ne lit pas à voix haute
 *   un texte composé pour l'écran : l'œil doit retrouver sa ligne après avoir
 *   regardé la personne en face.
 *
 *   LES QUATRE MOUVEMENTS COMMENCENT CHACUN SUR SA PAGE. Ce sont les quatre
 *   temps de la séance ; tourner la page fait partie du rythme, et cherche
 *   moins qu'un titre perdu au milieu d'un paragraphe.
 *
 *   AUCUN NUMÉRO DE VERSION, AUCUN IDENTIFIANT. Le pied de page porte le
 *   prénom, la date et le mouvement — ce qu'il faut pour retrouver une feuille
 *   tombée par terre, et rien de plus : ce document sort de l'application.
 *
 * jsPDF est chargé À LA DEMANDE, au clic. La bibliothèque pèse plus que le
 * reste de l'écran et ne sert qu'ici : personne ne doit la télécharger pour
 * consulter une fiche.
 */
import type { Hypnose } from '@/types/domain'
import { NOM_MOUVEMENT } from '@/services/aiClient'

/** Les polices de base du PDF encodent le WinAnsi : les accents passent. */
const MARGE = 64
const LARGEUR = 595.28 // A4 en points
const HAUTEUR = 841.89

/** « 3 septembre 2026 » */
function jour(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Le nom du fichier : lisible dans un dossier de téléchargements. */
export function nomDuFichier(patient: string, titre: string, iso: string): string {
  const propre = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
  const date = iso.slice(0, 10)
  return [propre(patient), propre(titre), date].filter(Boolean).join('_') + '.pdf'
}

export async function telechargerHypnose(
  hypnose: Hypnose,
  patient: string,
  cabinet: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const largeurTexte = LARGEUR - MARGE * 2
  const date = jour(hypnose.createdAt)

  /* Page de garde : ce qu'on lit avant de commencer. */
  doc.setFont('times', 'normal')
  doc.setFontSize(26)
  doc.text(doc.splitTextToSize(hypnose.titre, largeurTexte), MARGE, 150)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(110, 105, 95)
  doc.text([patient, date, cabinet].filter(Boolean).join(' · '), MARGE, 190)

  if (hypnose.intention) {
    doc.setFontSize(12)
    doc.setTextColor(60, 56, 50)
    doc.text(doc.splitTextToSize(`Intention : ${hypnose.intention}`, largeurTexte), MARGE, 232)
  }

  doc.setFontSize(10)
  doc.setTextColor(140, 134, 122)
  doc.text(
    doc.splitTextToSize(
      'À lire à voix haute, lentement. Les blancs entre les paragraphes sont des silences : ils font partie du texte.',
      largeurTexte,
    ),
    MARGE,
    HAUTEUR - 120,
  )

  for (const m of hypnose.mouvements) {
    doc.addPage()
    let y = MARGE + 28

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(150, 144, 132)
    doc.text(NOM_MOUVEMENT[m.mouvement].toUpperCase(), MARGE, y)
    y += 26

    doc.setFont('times', 'normal')
    doc.setFontSize(17)
    doc.setTextColor(30, 28, 24)
    const titre = doc.splitTextToSize(m.titre, largeurTexte) as string[]
    doc.text(titre, MARGE, y)
    y += titre.length * 22 + 14

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(13)
    doc.setTextColor(25, 24, 21)

    for (const para of m.texte.split('\n').filter((p) => p.trim())) {
      const lignes = doc.splitTextToSize(para.trim(), largeurTexte) as string[]
      for (const ligne of lignes) {
        /* La page se tourne AVANT d'écrire, jamais après : une ligne posée
           sous la marge basse disparaît sans que rien ne le signale. */
        if (y > HAUTEUR - MARGE - 30) {
          doc.addPage()
          y = MARGE + 28
        }
        doc.text(ligne, MARGE, y)
        y += 21
      }
      y += 11
    }
  }

  /* Le pied de page se pose à la fin, quand le nombre de pages est connu. */
  const pages = doc.getNumberOfPages()
  for (let n = 2; n <= pages; n++) {
    doc.setPage(n)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(165, 159, 147)
    doc.text([patient, date].filter(Boolean).join(' · '), MARGE, HAUTEUR - 38)
    doc.text(`${n - 1} / ${pages - 1}`, LARGEUR - MARGE, HAUTEUR - 38, { align: 'right' })
  }

  doc.save(nomDuFichier(patient, hypnose.titre, hypnose.createdAt))
}
