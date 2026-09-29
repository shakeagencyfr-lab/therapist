/**
 * Le dossier d'un patient, en PDF — le droit d'accès (RGPD, article 15),
 * fabriqué dans le navigateur.
 *
 * UN PDF RÉPOND À L'ACCÈS, PAS TOUT À FAIT À LA PORTABILITÉ. L'article 20
 * attend un format « lisible par machine » pour ce que la personne a
 * elle-même fourni (son journal, ses notes du soir) : un PDF se lit, il ne
 * se réimporte pas. Si une demande de portabilité arrive, c'est un export
 * structuré qu'il faudra — l'écran ne promet donc que la copie du dossier.
 *
 * CE QUI Y ENTRE, ET CE QUI N'Y ENTRE PAS.
 *   - Tout ce que le cabinet tient sur la personne : identité, parcours,
 *     synthèses des séances, profil, échelle du soir, anamnèse et notes.
 *   - Du journal, les pages PARTAGÉES seulement : le journal privé n'est pas
 *     au cabinet — la base ne le lui rend pas (politique « le cabinet lit le
 *     journal partagé ») —, et le document le dit, pour qu'on ne croie pas à
 *     un oubli.
 *   - JAMAIS la transcription d'une séance : elle ne se lit pas (COLONNES_SEANCE)
 *     et n'existe plus après l'envoi. Une séance au consentement retiré paraît
 *     à sa date, avec la mention de l'effacement, et rien d'autre.
 *
 * LE DOCUMENT EST COMPOSÉ EN BLOCS, PUIS MIS EN PAGE. `blocsDuDossier` décide
 * de ce qui est dit, dans quel ordre — et se teste. `telechargerDossier` ne
 * fait que poser les blocs sur des pages A4.
 *
 * jsPDF est chargé à la demande, comme pour les hypnoses : personne ne doit
 * télécharger la bibliothèque pour consulter une fiche.
 */
import type { MesureEchelle, PatientModule, PsychProfile, JournalEntry } from '@/types/domain'
import {
  CHAMPS_ANAMNESE,
  LIBELLE_ETAT,
  dateDeNote,
  dateDeSeance,
  dureeDeSeance,
  type Anamnese,
  type NoteDatee,
  type SeanceDuDossier,
} from '@/lib/dossier'
import { pourPdf, segmentDeFichier } from '@/lib/pdfTexte'

/** Ce que l'export lit de la fiche : la forme des écrans, réduite. */
export interface FicheExportee {
  name: string
  email?: string
  program: string
  sessions: number
  totalSessions: number
  nextSession: string
  scaleLabel: string
  scaleQuestion: string
  scale: number[]
  mesures?: MesureEchelle[]
  modules: PatientModule[]
  modulesRetires?: PatientModule[]
  profile: PsychProfile
  /** Les pages partagées — seules à parvenir au cabinet. */
  journal: JournalEntry[]
}

export interface EntreeExport {
  cabinet: string
  exporteLe: Date
  fiche: FicheExportee
  seances: SeanceDuDossier[]
  anamnese: Anamnese
  notes: NoteDatee[]
}

export type Bloc =
  | { t: 'titre'; texte: string }
  | { t: 'section'; texte: string }
  | { t: 'sous'; texte: string }
  | { t: 'ligne'; libelle: string; valeur: string }
  | { t: 'para'; texte: string }
  | { t: 'puce'; texte: string }
  | { t: 'discret'; texte: string }

/** L'ordre des sections, tel que le document les pose. */
export const SECTIONS_DU_DOSSIER = [
  'Identité',
  'Parcours',
  'Séances',
  'Profil',
  'Échelle du soir',
  'Journal partagé',
  'Anamnèse',
  'Notes de suivi',
] as const

export const AVERTISSEMENT_EXPORT =
  'Document confidentiel : il contient des données de santé. Remettez-le à la personne concernée ou à qui elle vous désigne, par un moyen sûr, et ne le conservez pas plus longtemps que nécessaire.'

export const MENTION_JOURNAL_PRIVE =
  'Seules les pages que la personne a choisi de partager figurent ici : son journal privé n’est lisible que par elle-même, et le cabinet n’y a pas accès.'

const REPLI_PROCHAINE = 'Aucune séance planifiée'

function jourLong(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
}

/** « 3 jours sur 7 », « fait aujourd'hui », « à faire ». */
function etatDuModule(m: PatientModule): string {
  if (m.retireLe) return `retiré le ${m.retireLe}${m.done ? ', fait au moins une fois' : ''}`
  if (m.septJours && m.septJours.possibles > 0) {
    return `fait ${m.septJours.faits} ${m.septJours.faits > 1 ? 'jours' : 'jour'} sur les ${m.septJours.possibles} derniers`
  }
  return m.done ? 'fait' : 'à faire'
}

/**
 * Le contenu du dossier, dans l'ordre où il se lit.
 *
 * Une section vide le dit en une phrase plutôt que de disparaître : un
 * document d'accès où manque « Anamnèse » laisse croire qu'on l'a retirée.
 */
export function blocsDuDossier(e: EntreeExport): Bloc[] {
  const f = e.fiche
  const b: Bloc[] = []

  b.push({ t: 'titre', texte: `Dossier de ${f.name}` })
  b.push({ t: 'discret', texte: [e.cabinet, `exporté le ${jourLong(e.exporteLe)}`].filter(Boolean).join(' · ') })
  b.push({ t: 'discret', texte: AVERTISSEMENT_EXPORT })

  /* Identité ---------------------------------------------------------- */
  b.push({ t: 'section', texte: 'Identité' })
  b.push({ t: 'ligne', libelle: 'Nom', valeur: f.name })
  if (f.email) b.push({ t: 'ligne', libelle: 'Adresse électronique', valeur: f.email })
  b.push({ t: 'ligne', libelle: 'Programme', valeur: f.program || 'Aucun programme' })
  b.push({
    t: 'ligne',
    libelle: 'Séances',
    valeur: f.totalSessions ? `${f.sessions} sur ${f.totalSessions} prévues` : String(f.sessions),
  })
  if (f.nextSession && f.nextSession !== REPLI_PROCHAINE) {
    b.push({ t: 'ligne', libelle: 'Prochaine séance', valeur: f.nextSession })
  }

  /* Parcours ---------------------------------------------------------- */
  b.push({ t: 'section', texte: 'Parcours' })
  if (!f.modules.length && !f.modulesRetires?.length) {
    b.push({ t: 'para', texte: 'Aucun exercice confié.' })
  }
  for (const m of f.modules) {
    b.push({ t: 'puce', texte: `${m.title} (${m.kind}) : ${etatDuModule(m)}` })
    if (m.note) b.push({ t: 'discret', texte: `Son mot : ${m.note}` })
  }
  if (f.modulesRetires?.length) {
    b.push({ t: 'sous', texte: 'Retirés du parcours' })
    for (const m of f.modulesRetires) {
      b.push({ t: 'puce', texte: `${m.title} (${m.kind}) : ${etatDuModule(m)}` })
      if (m.note) b.push({ t: 'discret', texte: `Son mot : ${m.note}` })
    }
  }

  /* Séances : dans le sens du temps, comme un dossier se lit ------------ */
  b.push({ t: 'section', texte: 'Séances' })
  const chronologie = [...e.seances].sort((x, y) => new Date(x.le).getTime() - new Date(y.le).getTime())
  if (!chronologie.length) b.push({ t: 'para', texte: 'Aucune séance au dossier.' })
  for (const s of chronologie) {
    const date = dateDeSeance(s.le)
    b.push({
      t: 'sous',
      texte: [date.charAt(0).toUpperCase() + date.slice(1), dureeDeSeance(s.dureeSecondes), LIBELLE_ETAT[s.etat]]
        .filter(Boolean)
        .join(' · '),
    })
    if (s.etat === 'retiree') {
      b.push({
        t: 'discret',
        texte: `Consentement retiré${s.retireeLe ? ` le ${jourLong(new Date(s.retireeLe))}` : ''} : tout ce qui avait été pris pendant cette séance a été effacé.`,
      })
    } else if (s.brouillon?.synthese) {
      b.push({ t: 'para', texte: s.brouillon.synthese })
    } else {
      b.push({ t: 'discret', texte: 'Aucune synthèse rédigée pour cette séance.' })
    }
  }

  /* Profil ------------------------------------------------------------ */
  b.push({ t: 'section', texte: 'Profil' })
  const p = f.profile
  if (!p.portrait && !p.axes.length && !p.levers.length) {
    b.push({ t: 'para', texte: 'Aucun profil établi.' })
  } else {
    if (p.updated) b.push({ t: 'discret', texte: p.updated })
    if (p.portrait) b.push({ t: 'para', texte: p.portrait })
    if (p.axes.length) {
      b.push({ t: 'sous', texte: 'Axes' })
      for (const a of p.axes) {
        b.push({ t: 'puce', texte: `${a.label} : ${Math.round(a.value)} sur 100${a.note ? `. ${a.note}` : ''}` })
      }
    }
    if (p.dynamique) {
      b.push({ t: 'sous', texte: 'Ce qui bouge' })
      b.push({ t: 'para', texte: p.dynamique })
    }
    if (p.alliance) {
      b.push({ t: 'sous', texte: 'Alliance de travail' })
      b.push({ t: 'para', texte: p.alliance })
    }
    if (p.levers.length) {
      b.push({ t: 'sous', texte: 'Leviers' })
      for (const l of p.levers) b.push({ t: 'puce', texte: `${l.title} : ${l.body}` })
    }
    if (p.care.length) {
      b.push({ t: 'sous', texte: 'Points d’attention' })
      for (const c of p.care) b.push({ t: 'puce', texte: c })
    }
  }

  /* Échelle du soir ----------------------------------------------------- */
  b.push({ t: 'section', texte: 'Échelle du soir' })
  if (f.scaleQuestion) b.push({ t: 'ligne', libelle: 'Question', valeur: f.scaleQuestion })
  if (f.scaleLabel) b.push({ t: 'ligne', libelle: 'Ce qui est suivi', valeur: f.scaleLabel })
  const mesures = f.mesures?.length
    ? f.mesures.map((m) => `${m.date ? dateDeNote(m.date) : 'Date inconnue'} : ${m.valeur} sur 10`)
    : f.scale.map((v, i) => `Note ${i + 1} : ${v} sur 10`)
  if (!mesures.length) b.push({ t: 'para', texte: 'Aucune note du soir.' })
  for (const m of mesures) b.push({ t: 'puce', texte: m })

  /* Journal partagé ------------------------------------------------------- */
  b.push({ t: 'section', texte: 'Journal partagé' })
  b.push({ t: 'discret', texte: MENTION_JOURNAL_PRIVE })
  if (!f.journal.length) b.push({ t: 'para', texte: 'Aucune page partagée.' })
  for (const j of f.journal) {
    b.push({ t: 'sous', texte: [j.date, j.trigger].filter(Boolean).join(' · ') })
    b.push({ t: 'para', texte: j.text })
  }

  /* Anamnèse et notes ----------------------------------------------------- */
  b.push({ t: 'section', texte: 'Anamnèse' })
  const remplis = CHAMPS_ANAMNESE.filter(({ cle }) => e.anamnese[cle].trim())
  if (!remplis.length) b.push({ t: 'para', texte: 'Aucune anamnèse consignée.' })
  for (const { cle, libelle } of remplis) {
    b.push({ t: 'sous', texte: libelle })
    b.push({ t: 'para', texte: e.anamnese[cle].trim() })
  }

  b.push({ t: 'section', texte: 'Notes de suivi' })
  if (!e.notes.length) b.push({ t: 'para', texte: 'Aucune note de suivi.' })
  for (const n of [...e.notes].sort((x, y) => x.le.localeCompare(y.le))) {
    b.push({ t: 'sous', texte: dateDeNote(n.le) + (n.auteur ? ` · par ${n.auteur}` : '') })
    b.push({ t: 'para', texte: n.texte })
  }

  return b
}

/** « Dossier_Camille-Martin_2026-09-28.pdf » */
export function nomFichierDossier(nom: string, le: Date): string {
  const jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(le)
  return ['Dossier', segmentDeFichier(nom), jour].filter(Boolean).join('_') + '.pdf'
}

/* ------------------------------------------------------------------ *
 * La mise en page
 * ------------------------------------------------------------------ */

const MARGE = 56
const LARGEUR = 595.28 // A4 en points
const HAUTEUR = 841.89
const BAS = HAUTEUR - MARGE - 24

/** Le dossier téléchargé sur cet appareil. */
export async function telechargerDossier(e: EntreeExport): Promise<void> {
  const doc = await composerDossier(e)
  doc.save(nomFichierDossier(e.fiche.name, e.exporteLe))
}

/** Le document composé, sans l'enregistrer : ce que les tests relisent. */
export async function composerDossier(e: EntreeExport) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const largeur = LARGEUR - MARGE * 2
  let y = MARGE + 10

  /** La page se tourne AVANT d'écrire : une ligne sous la marge disparaît sans bruit. */
  const place = (hauteur: number) => {
    if (y + hauteur > BAS) {
      doc.addPage()
      y = MARGE + 10
    }
  }

  /** Écrit un texte coupé à la largeur, ligne à ligne, en tournant les pages. */
  const ecrire = (texte: string, taille: number, interligne: number, retrait = 0) => {
    doc.setFontSize(taille)
    for (const paragraphe of pourPdf(texte).split('\n')) {
      if (!paragraphe.trim()) {
        y += interligne / 2
        continue
      }
      const lignes = doc.splitTextToSize(paragraphe, largeur - retrait) as string[]
      for (const ligne of lignes) {
        place(interligne)
        doc.text(ligne, MARGE + retrait, y)
        y += interligne
      }
    }
  }

  for (const bloc of blocsDuDossier(e)) {
    switch (bloc.t) {
      case 'titre':
        doc.setFont('times', 'normal')
        doc.setTextColor(30, 28, 24)
        ecrire(bloc.texte, 22, 28)
        y += 4
        break
      case 'section':
        y += 16
        place(40)
        doc.setDrawColor(200, 194, 182)
        doc.line(MARGE, y - 12, LARGEUR - MARGE, y - 12)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(30, 28, 24)
        ecrire(bloc.texte.toUpperCase(), 10, 16)
        y += 4
        break
      case 'sous':
        y += 6
        place(34)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(50, 46, 40)
        ecrire(bloc.texte, 10.5, 15)
        break
      case 'ligne':
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(40, 37, 32)
        ecrire(`${bloc.libelle} : ${bloc.valeur}`, 10.5, 15)
        break
      case 'para':
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(25, 24, 21)
        ecrire(bloc.texte, 10.5, 15)
        y += 4
        break
      case 'puce':
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(25, 24, 21)
        place(15)
        doc.setFontSize(10.5)
        doc.text('•', MARGE + 2, y)
        ecrire(bloc.texte, 10.5, 15, 14)
        break
      case 'discret':
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(110, 105, 95)
        ecrire(bloc.texte, 9, 13)
        y += 2
        break
    }
  }

  /* Le pied de page, une fois le nombre de pages connu : de quoi remettre
     une feuille tombée à sa place, et rien de plus. */
  const pages = doc.getNumberOfPages()
  const pied = pourPdf(`Dossier de ${e.fiche.name} · confidentiel`)
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(140, 134, 122)
    doc.text(pied, MARGE, HAUTEUR - 32)
    doc.text(`${n} / ${pages}`, LARGEUR - MARGE, HAUTEUR - 32, { align: 'right' })
  }

  return doc
}
