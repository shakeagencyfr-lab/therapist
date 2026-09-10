/* =============================================================================
 *  products.ts — les trois offres du site
 * =============================================================================
 *
 *  Le site porte trois landings qui partagent tout : la même mise en page, les
 *  mêmes composants, le même en-tête et le même pied de page. Seuls changent
 *  l'accent de couleur, la forme de la page d'accueil et, bien sûr, le contenu.
 *
 *      /              Booster IA Pro    (vert)
 *      /rdv-pro/      Booster RDV Pro   (ambre)
 *      /web-pro/      Web Pro           (violet)
 *
 *  …et les mêmes sous /en/.
 *
 *  Les accents sont relevés sur les cartes d'offres de shakeagency.io. Chaque
 *  gamme est construite sur une seule teinte : c500 est la couleur de marque,
 *  c500→c600 forment le dégradé des boutons, et c700 sert de couleur de TEXTE
 *  (62 usages dans le code) — d'où son assombrissement jusqu'à au moins 5:1 de
 *  contraste sur le fond clair du thème. Voir src/lib/brandTheme.ts.
 *
 *  Ajouter une offre : une entrée ici, sa clé dans ProductKey, ses deux
 *  fichiers de contenu dans src/content/, et la route se crée toute seule.
 * ========================================================================== */

import type { ThemeColors } from "./themes";
import type { HomeLayoutName } from "./homeLayouts";

export type ProductKey = "ia" | "rdv" | "web";

export interface Product {
  key: ProductKey;
  /** Segment d'URL. Vide pour l'offre servie à la racine. */
  slug: string;
  /** Nom court, affiché dans le sélecteur d'offres de la navigation. */
  label: string;
  /** Chaque offre peut avoir sa propre forme de page. Voir homeLayouts.ts. */
  homeLayout: HomeLayoutName;
  colors: ThemeColors;
}

export const PRODUCT_ORDER: ProductKey[] = ["ia", "rdv", "web"];

export const products: Record<ProductKey, Product> = {
  /* --- Booster IA Pro — vert #00D5A7, l'accent principal du site --------- */
  ia: {
    key: "ia",
    slug: "",
    label: "Booster IA Pro",
    homeLayout: "classic",
    colors: {
      c50: "#edfcf9",
      c100: "#cff7ee",
      c500: "#00D5A7",
      c600: "#00a883",
      c700: "#007a60",
      c900: "#05392d",
    },
  },

  /* --- Booster RDV Pro — ambre #F5A40D ---------------------------------- */
  rdv: {
    key: "rdv",
    slug: "rdv-pro",
    label: "Booster RDV Pro",
    homeLayout: "compact",
    colors: {
      c50: "#fcf7ed",
      c100: "#f7e9cf",
      c500: "#F5A40D",
      c600: "#c58308",
      c700: "#936206",
      c900: "#392605",
    },
  },

  /* --- Web Pro — violet #7C5CFC ----------------------------------------- */
  web: {
    key: "web",
    slug: "web-pro",
    label: "Web Pro",
    homeLayout: "compact",
    colors: {
      c50: "#f2effd",
      c100: "#ddd4fb",
      c500: "#7C5CFC",
      c600: "#6742e0",
      c700: "#4a2ba8",
      c900: "#1b0f47",
    },
  },
};

/** L'offre servie à la racine, et celle dont les couleurs habillent les pages
 *  communes (tarifs, contact, mentions légales). */
export const DEFAULT_PRODUCT: ProductKey = "ia";

/** Le chemin d'une offre dans une langue donnée. */
export function productPath(key: ProductKey): string {
  const slug = products[key].slug;
  return slug ? `/${slug}/` : "/";
}
