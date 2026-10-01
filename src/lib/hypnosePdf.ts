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
 *   LA MARQUE DU CABINET, SANS BRUIT. Le logo en page de garde, et en petit
 *   en tête de chaque page ; la couleur d'accent sur ce qui sert à se
 *   repérer — le nom du mouvement, un filet, l'intention. Le texte à lire,
 *   lui, reste noir sur blanc : c'est lui qu'on lit, pas la marque.
 *
 * jsPDF est chargé À LA DEMANDE, au clic. La bibliothèque pèse plus que le
 * reste de l'écran et ne sert qu'ici : personne ne doit la télécharger pour
 * consulter une fiche.
 */
import type { Hypnose } from '@/types/domain'
import { NOM_MOUVEMENT } from '@/services/aiClient'
import { COULEURS_ORIGINE, couleurValide } from './couleurs'
import { cadreDuLogo, type LogoPdf } from './logoPdf'
import { pourPdf } from './pdfTexte'
import { PROPRIETES_IA } from './transparenceIA'

/** Ce que le cabinet prête au document : son logo, sa couleur. */
export interface MarquePdf {
  logo: LogoPdf | null
  /** La couleur d'accent la plus soutenue de la marque (#RRGGBB). */
  accent?: string | null
}

type Rgb = [number, number, number]

/**
 * La couleur d'accent, lisible sur du blanc.
 *
 * Une marque peut choisir un accent pâle — un sable, un rose poudré — qui
 * disparaît à l'impression. Au-delà d'une luminance de 0,45, la couleur est
 * assombrie en gardant sa teinte : le repère reste celui du cabinet, et se
 * lit encore sur une feuille.
 */
export function accentLisible(hex: string | null | undefined): Rgb {
  const source = couleurValide(hex) ? hex : COULEURS_ORIGINE.accentDeep
  const rgb = [1, 3, 5].map((i) => parseInt(source.slice(i, i + 2), 16)) as Rgb
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
  if (luminance <= 0.45) return rgb
  const facteur = Math.sqrt(0.45 / luminance) * 0.55
  return rgb.map((c) => Math.round(c * facteur)) as Rgb
}

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

/** Ce que le PDF lit d'une hypnose — de fiche, ou de la bibliothèque du cabinet. */
export type HypnoseALire = Pick<Hypnose, 'titre' | 'intention' | 'createdAt' | 'mouvements'>

/**
 * Télécharge l'hypnose en PDF.
 *
 * SANS PATIENT, c'est une hypnose de la bibliothèque du cabinet (0071) :
 * `patientBrut` vide, la page de garde et le pied de page ne portent que la
 * date et le cabinet, et le fichier se nomme d'après le titre. La marque du
 * cabinet s'y applique comme ailleurs.
 */
export async function telechargerHypnose(
  brute: HypnoseALire,
  patientBrut: string,
  cabinetBrut: string,
  marque: MarquePdf = { logo: null },
): Promise<void> {
  const doc = await composerHypnose(brute, patientBrut, cabinetBrut, marque)
  doc.save(nomDuFichier(pourPdf(patientBrut), pourPdf(brute.titre), brute.createdAt))
}

/** L'hypnose composée, sans l'enregistrer : ce que les tests relisent. */
export async function composerHypnose(
  brute: HypnoseALire,
  patientBrut: string,
  cabinetBrut: string,
  marque: MarquePdf = { logo: null },
) {
  /* UN SEUL CARACTÈRE HORS WINANSI GÂCHE TOUTE LA LIGNE. Les polices de base
     de jsPDF ne connaissent que ce jeu : un émoji, une espace fine insécable
     (celle que met fr-FR avant « : »), une flèche — et la ligne entière passe
     en codage 16 bits, illisible à l'écran comme à l'impression. Le texte est
     écrit par l'IA et relu par la praticienne : on ne peut pas garantir qu'il
     n'en contient pas. Tout passe donc par pourPdf avant d'être posé. */
  const hypnose: HypnoseALire = {
    ...brute,
    titre: pourPdf(brute.titre),
    intention: pourPdf(brute.intention),
    mouvements: brute.mouvements.map((m) => ({ ...m, titre: pourPdf(m.titre), texte: pourPdf(m.texte) })),
  }
  const patient = pourPdf(patientBrut)
  const cabinet = pourPdf(cabinetBrut)
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  /* LE FICHIER DIT QU'IL A ÉTÉ ÉCRIT AVEC L'IA (règlement européen sur l'IA,
     art. 50 : un marquage lisible par une machine). Dans ses propriétés, pas
     sur la page : c'est un texte à lire à voix haute, et la praticienne l'a
     relu. Ni Klaro ni le modèle n'y sont nommés — le document est à la
     marque du cabinet. */
  doc.setProperties({
    title: hypnose.titre,
    author: cabinet,
    subject: PROPRIETES_IA.subject,
    keywords: PROPRIETES_IA.keywords,
  })

  const largeurTexte = LARGEUR - MARGE * 2
  const date = jour(hypnose.createdAt)
  const accent = accentLisible(marque.accent)
  const logo = marque.logo

  /* Page de garde : ce qu'on lit avant de commencer. Le logo au-dessus du
     titre, à sa place de signature ; sans logo, rien ne le remplace. */
  if (logo) {
    const cadre = cadreDuLogo(logo, 170, 56)
    doc.addImage(logo.dataUrl, 'PNG', MARGE, 58, cadre.largeur, cadre.hauteur)
  }

  doc.setFont('times', 'normal')
  doc.setFontSize(26)
  doc.setTextColor(30, 28, 24)
  const titre = doc.splitTextToSize(hypnose.titre, largeurTexte) as string[]
  doc.text(titre, MARGE, 150)
  let y = 150 + (titre.length - 1) * 30

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(110, 105, 95)
  doc.text([patient, date, cabinet].filter(Boolean).join(' · '), MARGE, y + 40)

  // Un filet à la couleur du cabinet, entre ce qui présente et ce qui guide.
  doc.setDrawColor(...accent)
  doc.setLineWidth(1.2)
  doc.line(MARGE, y + 58, MARGE + 56, y + 58)
  y += 90

  if (hypnose.intention) {
    doc.setFontSize(9.5)
    doc.setTextColor(...accent)
    doc.text('INTENTION', MARGE, y)
    doc.setFontSize(12)
    doc.setTextColor(60, 56, 50)
    doc.text(doc.splitTextToSize(hypnose.intention, largeurTexte), MARGE, y + 20)
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
    doc.setTextColor(...accent)
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

  /* Le pied de page se pose à la fin, quand le nombre de pages est connu ;
     le petit logo en tête aussi, au-dessus de la marge, loin du texte. */
  const pages = doc.getNumberOfPages()
  const petit = logo ? cadreDuLogo(logo, 96, 26) : null
  for (let n = 2; n <= pages; n++) {
    doc.setPage(n)
    if (logo && petit) {
      doc.addImage(logo.dataUrl, 'PNG', LARGEUR - MARGE - petit.largeur, 30, petit.largeur, petit.hauteur)
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(165, 159, 147)
    doc.text([patient, date].filter(Boolean).join(' · '), MARGE, HAUTEUR - 38)
    doc.text([cabinet, `${n - 1} / ${pages - 1}`].filter(Boolean).join(' · '), LARGEUR - MARGE, HAUTEUR - 38, {
      align: 'right',
    })
  }

  return doc
}
