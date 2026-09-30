/**
 * Les signes du lecteur audio : lecture, pause, arrêt.
 *
 * DESSINÉS, PAS ÉCRITS. « ▶ », « ❙❙ » et « ■ » sont des caractères : leur
 * dessin, leur ligne de base et leur approche changent d'une police à
 * l'autre, et d'un système à l'autre (le Mac en fait parfois un émoji). Dans
 * un rond, le triangle tombait donc à côté du centre, et le décalage à la
 * main (`padding-left`) ne valait que pour une police. Tracés ici, ils sont
 * centrés partout — le triangle un peu à droite du milieu géométrique, là où
 * l'œil le voit centré.
 */
export type SigneLecture = 'lecture' | 'pause' | 'arret'

export function IconeLecture({ signe, taille = 16 }: { signe: SigneLecture; taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      {signe === 'lecture' && <path d="M8.5 5.8v12.4a1 1 0 0 0 1.52.85l10.1-6.2a1 1 0 0 0 0-1.7L10.02 4.95A1 1 0 0 0 8.5 5.8z" />}
      {signe === 'pause' && (
        <>
          <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
          <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
        </>
      )}
      {signe === 'arret' && <rect x="6.5" y="6.5" width="11" height="11" rx="1.6" />}
    </svg>
  )
}
