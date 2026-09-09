import type { RouteRecord } from "vite-react-ssg";
import Layout from "./Layout";
import App from "./App";
import PricingPage from "./pages/PricingPage";
import GuidePage from "./pages/GuidePage";
import ContactPage from "./pages/ContactPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import NotFoundPage from "./pages/NotFoundPage";

/**
 * Les mêmes pages, deux fois : le français à la racine (langue principale),
 * l'anglais sous /en. Chaque langue est pré-rendue dans son propre fichier
 * HTML, ce qui permet un sélecteur de langue en simple lien — sans JavaScript
 * — et des URL distinctes que les moteurs de recherche peuvent indexer.
 *
 * Chaque route porte un `id` explicite préfixé par la langue : React Router
 * exige des identifiants uniques dans tout l'arbre, et sans cela les deux
 * sous-arbres entreraient en collision.
 */
function pagesFor(lang: "fr" | "en"): RouteRecord[] {
  return [
    {
      id: `${lang}-pricing`,
      path: "pricing",
      element: <PricingPage />,
      entry: "src/pages/PricingPage.tsx",
    },
    // Manuel du propriétaire — noindex, retirable du menu via brand.config.
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

export const routes: RouteRecord[] = [
  {
    id: "en-root",
    path: "/en",
    element: <Layout lang="en" />,
    entry: "src/Layout.tsx",
    children: [
      { id: "en-home", index: true, element: <App />, entry: "src/App.tsx" },
      ...pagesFor("en"),
    ],
  },
  {
    // Doit rester après /en, sans quoi le rattrapage français l'absorberait.
    id: "fr-root",
    path: "/",
    element: <Layout lang="fr" />,
    entry: "src/Layout.tsx",
    children: [
      { id: "fr-home", index: true, element: <App />, entry: "src/App.tsx" },
      ...pagesFor("fr"),
    ],
  },
];
