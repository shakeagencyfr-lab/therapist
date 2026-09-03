/**
 * Les icônes de la barre du bas.
 *
 * Elles bougent quand on arrive dessus, et seulement à ce moment-là : une
 * animation qui tourne en boucle dans un coin de l'écran finit par tirer
 * l'œil vers un endroit où il n'y a rien à faire. Ici, le mouvement confirme
 * un geste — j'ai appuyé, l'onglet répond — puis s'arrête.
 *
 * Le trait est dessiné et non rempli : à seize pixels, un aplat devient une
 * tache, un contour reste lisible. Elles héritent `currentColor`, donc la
 * couleur du cabinet quand l'onglet est actif.
 *
 * Qui a réglé son système sur « réduire les animations » ne voit rien bouger
 * — la feuille de style s'en charge, ce n'est pas une préférence esthétique
 * mais un besoin, parfois médical.
 */
export type Icone = 'jour' | 'journal' | 'rdv' | 'boutique' | 'moi'

const TRAIT = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconeOnglet({ nom, classe }: { nom: Icone; classe?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={classe} aria-hidden focusable="false" {...TRAIT}>
      {nom === 'jour' ? (
        <>
          {/* Un soleil : la journée. Les rayons s'écartent à l'activation. */}
          <circle cx="12" cy="12" r="4" />
          <g className="rayons">
            <path d="M12 3v2" />
            <path d="M12 19v2" />
            <path d="M3 12h2" />
            <path d="M19 12h2" />
            <path d="M5.6 5.6l1.4 1.4" />
            <path d="M17 17l1.4 1.4" />
            <path d="M18.4 5.6L17 7" />
            <path d="M7 17l-1.4 1.4" />
          </g>
        </>
      ) : null}

      {nom === 'journal' ? (
        <>
          {/* Un carnet, dont la page se tourne. */}
          <path d="M5 4.5h9a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z" />
          <path className="page" d="M16 4.5h1a2 2 0 0 1 2 2v13h-3z" />
          <path d="M8.5 9h5" />
          <path d="M8.5 12.5h5" />
        </>
      ) : null}

      {nom === 'rdv' ? (
        <>
          {/* Un calendrier, dont la pastille du jour bat une fois. */}
          <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
          <path d="M3.5 10h17" />
          <path d="M8 3.5v3" />
          <path d="M16 3.5v3" />
          <circle className="pastille" cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" />
        </>
      ) : null}

      {nom === 'boutique' ? (
        <>
          {/* Un panier, qui se balance. */}
          <g className="panier">
            <path d="M4.5 8.5h15l-1.4 10a2 2 0 0 1-2 1.7H7.9a2 2 0 0 1-2-1.7z" />
            <path d="M9 8.5a3 3 0 0 1 6 0" />
          </g>
        </>
      ) : null}

      {nom === 'moi' ? (
        <>
          {/* Une silhouette : la tête acquiesce. */}
          <circle className="tete" cx="12" cy="8.5" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </>
      ) : null}
    </svg>
  )
}
