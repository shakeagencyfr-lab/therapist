/**
 * Les deux pouces, dessinés comme les autres icônes du produit : un trait,
 * pas un aplat (src/patient/IconesOnglets.tsx). À quinze pixels, un pouce
 * rempli devient une tache ; un contour reste un pouce.
 *
 * Le pouce baissé est le même dessin retourné : deux dessins différents
 * finiraient par ne plus se répondre.
 */
const TRAIT = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** La manchette, puis la main. */
function Main({ plein }: { plein: boolean }) {
  return (
    <>
      <path d="M3.5 10.5h3.5v10H3.5z" />
      <path
        d="M7 10.5l3.4-6.1a1.7 1.7 0 0 1 3.1 1.3L12.7 9.5h5.1a2 2 0 0 1 2 2.4l-1.3 6.9a2 2 0 0 1-2 1.7H7"
        fill={plein ? 'currentColor' : 'none'}
        fillOpacity={plein ? 0.16 : undefined}
      />
    </>
  )
}

export function PouceHaut({ plein = false, className }: { plein?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" className={className} aria-hidden focusable="false" {...TRAIT}>
      <Main plein={plein} />
    </svg>
  )
}

export function PouceBas({ plein = false, className }: { plein?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" className={className} aria-hidden focusable="false" {...TRAIT}>
      <g transform="rotate(180 12 12)">
        <Main plein={plein} />
      </g>
    </svg>
  )
}
