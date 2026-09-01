/**
 * Marque blanche : l'accent et la couleur sombre sont paramétrables par
 * cabinet. Les autres jetons restent communs (voir src/styles/tokens.css).
 */
export interface CabinetTheme {
  /** Nom affiché dans l'en-tête. */
  name: string
  /** Sur-titre de l'en-tête. */
  tagline: string
  /** Initiales du logo carré — remplacer par le vrai logo du cabinet. */
  logo: string
  /** Couleur d'accent (#A17A45 par défaut). */
  accent?: string
  /** Accent au survol. */
  accentHover?: string
  /** Accent appuyé (liens). */
  accentDeep?: string
  /** Fond des barres d'action et de l'app patient. */
  dark?: string
}

export const defaultTheme: CabinetTheme = {
  name: 'Entre-séances',
  tagline: 'Suivi entre les séances',
  logo: 'ES',
}

/** Applique les couleurs paramétrables sur la racine du document. */
export function applyTheme(theme: CabinetTheme, root: HTMLElement = document.documentElement): void {
  const vars: Array<[string, string | undefined]> = [
    ['--c-accent', theme.accent],
    ['--c-accent-hover', theme.accentHover],
    ['--c-accent-deep', theme.accentDeep],
    ['--c-dark', theme.dark],
  ]
  for (const [name, value] of vars) {
    if (value) root.style.setProperty(name, value)
  }
}
