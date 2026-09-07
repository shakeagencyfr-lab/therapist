/* =============================================================================
 *  i18n.tsx — accès aux libellés d'interface selon la langue active
 * =============================================================================
 *
 *  Le français est la langue principale, servie à la racine ("/"). L'anglais
 *  vit sous "/en". Chaque langue est PRÉ-RENDUE dans son propre fichier HTML,
 *  donc le sélecteur de langue est un simple lien : il fonctionne sans
 *  JavaScript, ce qui compte pour le référencement comme pour l'export HTML.
 *
 *  La langue active et le contenu de marque sont gérés dans brand.config.ts
 *  (voir setActiveLang / lhref) ; ce module ne sert qu'aux libellés d'interface.
 * ========================================================================== */

import { getActiveLang, type Lang } from "../brand.config";
import { UI, type UiStrings } from "../content/ui";

export type { Lang };

export const LANGS: Array<{ code: Lang; label: string; hreflang: string }> = [
  { code: "fr", label: "FR", hreflang: "fr" },
  { code: "en", label: "EN", hreflang: "en" },
];

/** Les libellés d'interface dans la langue active. */
export function useUi(): UiStrings {
  return UI[getActiveLang()];
}

/** La langue active (hors composant, utilisez getActiveLang directement). */
export function useLang(): Lang {
  return getActiveLang();
}
