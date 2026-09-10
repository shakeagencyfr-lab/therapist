import type { RouteRecord } from "vite-react-ssg";
import Layout from "./Layout";
import App from "./App";
import PricingPage from "./pages/PricingPage";
import GuidePage from "./pages/GuidePage";
import ContactPage from "./pages/ContactPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import NotFoundPage from "./pages/NotFoundPage";
import { products, PRODUCT_ORDER, DEFAULT_PRODUCT, type ProductKey } from "./products";
import type { Lang } from "./brand.config";

/**
 * Deux axes se croisent ici : la langue (français à la racine, anglais sous
 * /en) et l'offre (trois landings). Chaque combinaison est pré-rendue dans son
 * propre fichier HTML, ce qui permet un sélecteur de langue et un sélecteur
 * d'offre en simples liens — sans JavaScript — et des URL indexables.
 *
 * Chaque route porte un `id` explicite : React Router exige des identifiants
 * uniques dans tout l'arbre, et les deux sous-arbres de langue entreraient
 * sinon en collision.
 */

/** Les pages communes aux trois offres : tarifs, contact, mentions légales. */
function pagesCommunes(lang: Lang): RouteRecord[] {
  return [
    {
      id: `${lang}-pricing`,
      path: "pricing",
      element: <PricingPage />,
      entry: "src/pages/PricingPage.tsx",
    },
    // Manuel du propriétaire — noindex, retirable du menu via site.fr.ts.
    {
      id: `${lang}-guide`,
      path: "guide",
      element: <GuidePage />,
      entry: "src/pages/GuidePage.tsx",
    },
    {
      id: `${lang}-contact`,
      path: "contact",
      element: <ContactPage />,
      entry: "src/pages/ContactPage.tsx",
    },
    {
      id: `${lang}-terms`,
      path: "terms",
      element: <TermsPage />,
      entry: "src/pages/TermsPage.tsx",
    },
    {
      id: `${lang}-privacy`,
      path: "privacy-policy",
      element: <PrivacyPolicyPage />,
      entry: "src/pages/PrivacyPolicyPage.tsx",
    },
    // Pré-rendue puis recopiée vers dist/404.html par le script de build.
    {
      id: `${lang}-404`,
      path: "404",
      element: <NotFoundPage />,
      entry: "src/pages/NotFoundPage.tsx",
    },
    // Rattrapage côté client pour les liens cassés en navigation interne.
    {
      id: `${lang}-catchall`,
      path: "*",
      element: <NotFoundPage />,
      entry: "src/pages/NotFoundPage.tsx",
    },
  ];
}

/** Les landings des offres autres que celle servie à la racine. */
function landingsSecondaires(lang: Lang): RouteRecord[] {
  return PRODUCT_ORDER.filter((k) => k !== DEFAULT_PRODUCT).map((key) => ({
    id: `${lang}-${key}`,
    path: products[key].slug,
    element: <Layout lang={lang} product={key as ProductKey} />,
    entry: "src/Layout.tsx",
    children: [
      {
        id: `${lang}-${key}-home`,
        index: true,
        element: <App />,
        entry: "src/App.tsx",
      },
    ],
  }));
}

/** L'arbre d'une langue : les landings secondaires, puis la racine. */
function arbre(lang: Lang, base: string): RouteRecord[] {
  const secondaires = landingsSecondaires(lang).map((r) => ({
    ...r,
    path: `${base === "/" ? "" : base}/${r.path}`.replace(/^\/\//, "/"),
  }));
  return [
    ...secondaires,
    {
      id: `${lang}-root`,
      path: base,
      element: <Layout lang={lang} product={DEFAULT_PRODUCT} />,
      entry: "src/Layout.tsx",
      children: [
        {
          id: `${lang}-home`,
          index: true,
          element: <App />,
          entry: "src/App.tsx",
        },
        ...pagesCommunes(lang),
      ],
    },
  ];
}

export const routes: RouteRecord[] = [
  // L'anglais d'abord : sans quoi le rattrapage français absorberait /en.
  ...arbre("en", "/en"),
  ...arbre("fr", "/"),
];
