/* =============================================================================
 *  previewMode.ts — sticky design previews (?theme= / ?layout=)
 *
 *  Opening any URL with ?theme=nebula or ?layout=vsl previews that design
 *  choice ACROSS THE WHOLE SITE for the rest of the browser session — the
 *  choice is remembered in sessionStorage so it survives clicking between
 *  pages (plain links can't carry the param along). A floating chip (see
 *  Layout.tsx) shows what's being previewed and exits the preview.
 *
 *  Previews never change the real site: brand.config.ts stays the source of
 *  truth, and a fresh tab shows the configured design.
 * ========================================================================== */
import brand from "../brand.config";
import { themes, type ThemeName } from "../themes";
import { homeLayouts, type HomeLayoutName } from "../homeLayouts";

const THEME_KEY = "design-preview-theme";
const LAYOUT_KEY = "design-preview-layout";

function resolve<T extends string>(
  search: string,
  param: string,
  storageKey: string,
  valid: Record<string, unknown>,
  configured: string,
): T | null {
  if (typeof window === "undefined") return null; // SSG render: no preview
  const sp = new URLSearchParams(search);
  const fromUrl = sp.get(param);
  if (fromUrl && fromUrl in valid) {
    if (fromUrl === configured) {
      // Explicitly picking the configured value = back to normal.
      sessionStorage.removeItem(storageKey);
      return null;
    }
    sessionStorage.setItem(storageKey, fromUrl);
    return fromUrl as T;
  }
  const stored = sessionStorage.getItem(storageKey);
  return stored && stored in valid && stored !== configured
    ? (stored as T)
    : null;
}

/** The theme being previewed (URL param or remembered), or null when the
 *  site is showing its configured theme. Client-side only. */
export function previewTheme(search: string): ThemeName | null {
  return resolve<ThemeName>(search, "theme", THEME_KEY, themes, brand.theme);
}

/** Same for the home-page layout. */
export function previewLayout(search: string): HomeLayoutName | null {
  return resolve<HomeLayoutName>(
    search,
    "layout",
    LAYOUT_KEY,
    homeLayouts,
    brand.homeLayout,
  );
}

/** Exit preview mode entirely: forget both choices and reload the current
 *  page without the params so the configured design shows again. */
export function exitPreview(): void {
  sessionStorage.removeItem(THEME_KEY);
  sessionStorage.removeItem(LAYOUT_KEY);
  window.location.href = window.location.pathname;
}
