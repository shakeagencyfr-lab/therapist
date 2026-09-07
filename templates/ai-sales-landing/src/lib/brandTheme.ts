import brand from "../brand.config";
import { themes, type Theme, type ThemeColors } from "../themes";

/** The active theme object, resolved from brand.config.ts → theme. */
export const activeTheme: Theme = themes[brand.theme] ?? themes.original;

/** The active accent ramp: your brand.config colours if set, otherwise the
 *  theme's own default ramp (which is what makes each variant look distinct
 *  out of the box). */
export const activeColors: ThemeColors = brand.colors ?? activeTheme.colors;

/** "#25D366" → "37 211 102" (the space-separated RGB triplet that the
 *  `rgb(var(--brand-500) / <alpha>)` Tailwind colours and styles.css expect). */
export function hexToTriplet(hex: string): string {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Glass-card classes that participate in the per-theme radius override. */
const RADIUS_SURFACES = [
  "glass",
  "glass-lift",
  "glass-soft",
  "glass-sub",
  "glass-dark",
];
/** Tailwind radius classes used on those cards, bucketed large vs medium.
 *  Bracket classes need their brackets escaped in a CSS selector. */
const RADIUS_LARGE = [
  "rounded-3xl",
  "rounded-\\[28px\\]",
  "rounded-\\[32px\\]",
];
const RADIUS_MEDIUM = ["rounded-2xl", "rounded-xl"];

function radiusCss(theme: Theme): string {
  if (!theme.radius) return "";
  const [large, medium] = theme.radius;
  const sel = (radii: string[]) =>
    RADIUS_SURFACES.flatMap((s) => radii.map((r) => `.${s}.${r}`)).join(",");
  return (
    `${sel(RADIUS_LARGE)}{border-radius:${large};}` +
    `${sel(RADIUS_MEDIUM)}{border-radius:${medium};}`
  );
}

/** Compiles ANY theme (with an optional accent-ramp override) to the CSS
 *  block the site is themed by. Used at build time for the configured theme,
 *  and at runtime by the `?theme=` live-preview switch (see Layout.tsx). */
export function themeCssFor(
  t: Theme,
  colorsOverride?: ThemeColors | null,
): string {
  const c = colorsOverride ?? t.colors;
  const m = t.material;
  return (
    ":root{" +
    `--brand-50:${hexToTriplet(c.c50)};` +
    `--brand-100:${hexToTriplet(c.c100)};` +
    `--brand-500:${hexToTriplet(c.c500)};` +
    `--brand-600:${hexToTriplet(c.c600)};` +
    `--brand-700:${hexToTriplet(c.c700)};` +
    `--brand-900:${hexToTriplet(c.c900)};` +
    `--font-display:${t.fonts.display};` +
    `--font-body:${t.fonts.body};` +
    `--page-bg-color:${t.page.bgColor};` +
    `--page-bg-image:${t.page.bgImage};` +
    `--grid-color:${t.page.gridColor};` +
    `--grain-opacity:${t.page.grainOpacity};` +
    `--glass-bg:${m.bg};` +
    `--glass-bg-strong:${m.bgStrong};` +
    `--glass-border:${m.border};` +
    `--glass-border-top:${m.borderTop};` +
    `--glass-shadow:${m.shadow};` +
    `--glass-shadow-lift:${m.shadowLift};` +
    `--sub-bg:${m.subBg};` +
    `--sub-border:${m.subBorder};` +
    `--pill-bg:${m.pillBg};` +
    `--pill-border:${m.pillBorder};` +
    `--pill-shadow:${m.pillShadow};` +
    `--glass-soft-bg:${m.softBg ?? m.bg};` +
    `--glass-soft-shadow:${m.softShadow ?? m.shadow};` +
    `--glass-blur:${m.blur};` +
    `--glass-blur-strong:${m.blurStrong};` +
    `--glass-sub-blur:${m.subBlur};` +
    `--pill-blur:${m.pillBlur};` +
    "}" +
    radiusCss(t) +
    (t.extraCss ?? "")
  );
}

/** The site's theme CSS from brand.config.ts (theme + colors). Injected into
 *  every page's <head> (see Layout.tsx) so the static HTML is already themed:
 *  edit brand.config.ts and the whole site reskins, no flash. The variables
 *  here override the defaults declared in styles.css. */
export function brandThemeCss(): string {
  return themeCssFor(activeTheme, brand.colors);
}
