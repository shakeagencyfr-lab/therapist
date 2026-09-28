/**
 * Emporter son journal — la part qui se raisonne sans navigateur.
 *
 * Supprimer son compte efface le journal, et c'est voulu : il est à la
 * personne qui l'a écrit, pas au cabinet. Mais « effacé » ne doit pas vouloir
 * dire « perdu » : avant de partir, on peut en garder une copie chez soi. Un
 * fichier texte, lisible partout, sans application pour l'ouvrir.
 */
import { plural } from '@/lib/format'

/** Une page, telle qu'elle part dans le fichier. */
export interface PageExportee {
  title: string
  body: string
  shared: boolean
  written_at: string
}

/** « mardi 2 septembre 2026 » : l'année aussi, un fichier se relit des années plus tard. */
function dateLongue(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Le journal entier, en texte.
 *
 * Dans l'ordre du temps, de la première page à la dernière : c'est ainsi
 * qu'on relit un journal, même si l'écran le montre à l'envers. Chaque page
 * dit si elle était partagée avec le cabinet — une information qu'on ne
 * retrouverait nulle part ailleurs une fois le compte parti.
 */
export function journalEnTexte(
  pages: PageExportee[],
  entete: { nom: string; cabinet: string; le: Date },
): string {
  const ordre = [...pages].sort((a, b) => Date.parse(a.written_at) - Date.parse(b.written_at))
  const trait = '—'.repeat(24)
  const tete = [
    `Mon journal — ${entete.nom}`,
    `Tenu dans l'espace de ${entete.cabinet}, copié le ${dateLongue(entete.le.toISOString())}.`,
    ordre.length ? plural(ordre.length, 'page', 'pages') : 'Aucune page écrite.',
  ]
  const corps = ordre.map((page) =>
    [
      trait,
      `${dateLongue(page.written_at)}${page.shared ? ' · partagée' : ''}`,
      page.title.trim(),
      '',
      page.body.trim(),
    ].join('\n'),
  )
  /* L'indicateur d'ordre des octets en tête : sans lui, le Bloc-notes de
     Windows ouvre encore certains fichiers UTF-8 comme du Latin-1, et chaque
     accent devient deux signes illisibles. */
  return `﻿${[tete.join('\n'), ...corps].join('\n\n')}\n`
}

/** « mon-journal-2026-09-28.txt » : daté, pour qu'une seconde copie n'écrase pas la première. */
export function nomDuFichierJournal(le: Date): string {
  const deux = (n: number) => String(n).padStart(2, '0')
  return `mon-journal-${le.getFullYear()}-${deux(le.getMonth() + 1)}-${deux(le.getDate())}.txt`
}
