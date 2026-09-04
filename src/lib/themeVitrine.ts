/**
 * L'habillage de la vitrine.
 *
 * Les couleurs ne sont PAS ici : elles viennent de la marque du cabinet, qui
 * habille déjà l'application de ses patients. Deux endroits pour une même
 * couleur, c'est une divergence garantie — la page finirait par ne plus
 * ressembler à l'espace vers lequel elle mène.
 *
 * Ce qui est ici, c'est le reste : la paire de polices, le fond de page, la
 * matière des cartes, le rayon des angles. De quoi rendre deux cabinets
 * reconnaissables sans écrire une ligne de style.
 *
 * TOUT EST EN LISTE BLANCHE, ET CE N'EST PAS DE LA PRUDENCE DÉCORATIVE. Ces
 * valeurs finissent en noms de classe CSS et en déclarations `font-family`
 * sur une page publique. Une chaîne venue de la base et recopiée telle quelle
 * dans une `font-family` laisse écrire du CSS arbitraire dans la page d'un
 * cabinet. `resoudreTheme` ne rend donc jamais autre chose qu'un code connu :
 * ce qu'elle ne reconnaît pas, elle le remplace par le défaut.
 */

export interface ThemeVitrine {
  /** Le préréglage dont on est parti, pour que l'écran sache quoi cocher. */
  preset: string
  titres: string
  texte: string
  fond: string
  /** Le fond bouge-t-il lentement ? Sans effet sur les fonds immobiles. */
  anime: boolean
  carte: string
  coins: string
}

interface Police {
  code: string
  label: string
  pile: string
  /** Le nom Google Fonts, ou null si la police est déjà servie par la page. */
  google: string | null
}

/* Les deux premières sont déjà chargées par le document : les choisir ne
   coûte aucune requête de plus. */
export const POLICES_TITRES: Police[] = [
  { code: 'newsreader', label: 'Newsreader', pile: "'Newsreader', Georgia, serif", google: null },
  { code: 'fraunces', label: 'Fraunces', pile: "'Fraunces', Georgia, serif", google: 'Fraunces:opsz,wght@9..144,400;9..144,600' },
  { code: 'playfair', label: 'Playfair Display', pile: "'Playfair Display', Georgia, serif", google: 'Playfair+Display:wght@400;600' },
  { code: 'lora', label: 'Lora', pile: "'Lora', Georgia, serif", google: 'Lora:wght@400;600' },
  { code: 'cormorant', label: 'Cormorant Garamond', pile: "'Cormorant Garamond', Georgia, serif", google: 'Cormorant+Garamond:wght@400;600' },
  { code: 'instrument', label: 'Instrument Serif', pile: "'Instrument Serif', Georgia, serif", google: 'Instrument+Serif' },
  { code: 'space', label: 'Space Grotesk', pile: "'Space Grotesk', system-ui, sans-serif", google: 'Space+Grotesk:wght@400;600' },
  { code: 'dmserif', label: 'DM Serif Display', pile: "'DM Serif Display', Georgia, serif", google: 'DM+Serif+Display' },
]

export const POLICES_TEXTE: Police[] = [
  { code: 'publicsans', label: 'Public Sans', pile: "'Public Sans', system-ui, sans-serif", google: null },
  { code: 'inter', label: 'Inter', pile: "'Inter', system-ui, sans-serif", google: 'Inter:wght@400;500;600' },
  { code: 'manrope', label: 'Manrope', pile: "'Manrope', system-ui, sans-serif", google: 'Manrope:wght@400;500;600' },
  { code: 'jakarta', label: 'Plus Jakarta Sans', pile: "'Plus Jakarta Sans', system-ui, sans-serif", google: 'Plus+Jakarta+Sans:wght@400;500;600' },
  { code: 'worksans', label: 'Work Sans', pile: "'Work Sans', system-ui, sans-serif", google: 'Work+Sans:wght@400;500;600' },
  { code: 'karla', label: 'Karla', pile: "'Karla', system-ui, sans-serif", google: 'Karla:wght@400;500;600' },
  { code: 'nunito', label: 'Nunito Sans', pile: "'Nunito Sans', system-ui, sans-serif", google: 'Nunito+Sans:wght@400;500;600' },
  { code: 'source', label: 'Source Sans 3', pile: "'Source Sans 3', system-ui, sans-serif", google: 'Source+Sans+3:wght@400;500;600' },
]

export const FONDS = [
  { code: 'uni', label: 'Uni', detail: 'Une seule teinte, rien derrière.' },
  { code: 'lueur', label: 'Lueur', detail: 'Un halo de votre couleur, en haut de page.' },
  { code: 'grille', label: 'Grille', detail: 'Un quadrillage très pâle.' },
  { code: 'points', label: 'Points', detail: 'Une trame de points, discrète.' },
  { code: 'lignes', label: 'Lignes', detail: 'Des diagonales fines.' },
  { code: 'degrade', label: 'Dégradé', detail: 'Du clair vers votre couleur, très doucement.' },
  { code: 'grain', label: 'Grain', detail: 'Un grain de papier photographique.' },
]

export const CARTES = [
  { code: 'contour', label: 'Contours fins', detail: 'Un trait, rien de plus.' },
  { code: 'papier', label: 'Papier', detail: 'Légèrement surélevé, avec une ombre douce.' },
  { code: 'plat', label: 'Plat', detail: 'Un aplat de couleur, sans bordure.' },
  { code: 'verre', label: 'Verre', detail: 'Translucide, le fond transparaît.' },
]

export const COINS = [
  { code: 'arrondis', label: 'Arrondis' },
  { code: 'doux', label: 'Doux' },
  { code: 'vifs', label: 'Vifs' },
]

export const THEME_DEFAUT: ThemeVitrine = {
  preset: 'origine',
  titres: 'newsreader',
  texte: 'publicsans',
  fond: 'uni',
  anime: false,
  carte: 'contour',
  coins: 'arrondis',
}

/**
 * Les préréglages : un clic, et tout se pose ensemble.
 *
 * Ils existent parce que six réglages indépendants produisent surtout des
 * combinaisons ratées. Chacun est une intention — un cabinet de ville, un
 * cabinet de campagne, une pratique clinique — et reste modifiable après
 * coup : le préréglage est un point de départ, pas un verrou.
 */
export const PRESETS: Array<{
  code: string
  label: string
  detail: string
  theme: Omit<ThemeVitrine, 'preset'>
}> = [
  {
    code: 'origine',
    label: 'Origine',
    detail: 'Newsreader · Public Sans',
    theme: { titres: 'newsreader', texte: 'publicsans', fond: 'uni', anime: false, carte: 'contour', coins: 'arrondis' },
  },
  {
    code: 'atelier',
    label: 'Atelier',
    detail: 'Fraunces · Plus Jakarta Sans',
    theme: { titres: 'fraunces', texte: 'jakarta', fond: 'grain', anime: false, carte: 'papier', coins: 'doux' },
  },
  {
    code: 'clairiere',
    label: 'Clairière',
    detail: 'Cormorant · Karla',
    theme: { titres: 'cormorant', texte: 'karla', fond: 'degrade', anime: true, carte: 'verre', coins: 'arrondis' },
  },
  {
    code: 'cabinet',
    label: 'Cabinet',
    detail: 'Lora · Source Sans 3',
    theme: { titres: 'lora', texte: 'source', fond: 'grille', anime: false, carte: 'contour', coins: 'vifs' },
  },
  {
    code: 'moderne',
    label: 'Moderne',
    detail: 'Space Grotesk · Inter',
    theme: { titres: 'space', texte: 'inter', fond: 'lueur', anime: true, carte: 'plat', coins: 'doux' },
  },
  {
    code: 'editorial',
    label: 'Éditorial',
    detail: 'Playfair Display · Work Sans',
    theme: { titres: 'playfair', texte: 'worksans', fond: 'points', anime: false, carte: 'papier', coins: 'vifs' },
  },
]

function connu(liste: ReadonlyArray<{ code: string }>, valeur: unknown, defaut: string): string {
  const code = String(valeur ?? '')
  return liste.some((e) => e.code === code) ? code : defaut
}

/**
 * Le thème d'une valeur brute — de la base, du réseau, d'un import.
 *
 * Elle ne lève jamais et ne rend jamais un code inconnu : une vitrine dont le
 * thème est illisible doit s'afficher avec le thème d'origine, pas tomber.
 * C'est aussi la seule barrière entre une chaîne stockée et une `font-family`.
 */
export function resoudreTheme(brut: unknown): ThemeVitrine {
  const t = (brut && typeof brut === 'object' ? brut : {}) as Partial<Record<keyof ThemeVitrine, unknown>>
  return {
    preset: connu(PRESETS, t.preset, THEME_DEFAUT.preset),
    titres: connu(POLICES_TITRES, t.titres, THEME_DEFAUT.titres),
    texte: connu(POLICES_TEXTE, t.texte, THEME_DEFAUT.texte),
    fond: connu(FONDS, t.fond, THEME_DEFAUT.fond),
    anime: t.anime === true,
    carte: connu(CARTES, t.carte, THEME_DEFAUT.carte),
    coins: connu(COINS, t.coins, THEME_DEFAUT.coins),
  }
}

/** Le thème d'un préréglage, prêt à être enregistré. */
export function themeDuPreset(code: string): ThemeVitrine {
  const preset = PRESETS.find((p) => p.code === code)
  return preset ? { preset: preset.code, ...preset.theme } : THEME_DEFAUT
}

/** La pile de polices d'un thème, jamais une chaîne venue d'ailleurs. */
export function pileTitres(theme: ThemeVitrine): string {
  return (POLICES_TITRES.find((p) => p.code === theme.titres) ?? POLICES_TITRES[0]!).pile
}
export function pileTexte(theme: ThemeVitrine): string {
  return (POLICES_TEXTE.find((p) => p.code === theme.texte) ?? POLICES_TEXTE[0]!).pile
}

/**
 * L'adresse Google Fonts à charger, ou null s'il n'y a rien à charger.
 *
 * Elle est null pour le thème d'origine : ses deux polices sont déjà servies
 * par le document, et une page qui n'a rien à demander ne demande rien.
 */
export function policesAcharger(theme: ThemeVitrine): string | null {
  const titres = POLICES_TITRES.find((p) => p.code === theme.titres)?.google ?? null
  const texte = POLICES_TEXTE.find((p) => p.code === theme.texte)?.google ?? null
  const familles = [titres, texte].filter((f): f is string => Boolean(f))
  if (!familles.length) return null
  return `https://fonts.googleapis.com/css2?${familles.map((f) => `family=${f}`).join('&')}&display=swap`
}
