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
 */
const pages = [
  { path: "pricing", element: <PricingPage />, entry: "src/pages/PricingPage.tsx" },
  // Manuel du propriétaire — noindex, retirable du menu via brand.config.
  { path: "guide", element: <GuidePage />, entry: "src/pages/GuidePage.tsx" },
  { path: "contact", element: <ContactPage />, entry: "src/pages/ContactPage.tsx" },
  { path: "terms", element: <TermsPage />, entry: "src/pages/TermsPage.tsx" },
  {
    path: "privacy-policy",
    element: <PrivacyPolicyPage />,
    entry: "src/pages/PrivacyPolicyPage.tsx",
  },
  // Pré-rendue puis recopiée vers dist/404.html par le script de build.
  { path: "404", element: <NotFoundPage />, entry: "src/pages/NotFoundPage.tsx" },
];

export const routes: RouteRecord[] = [
  {
    path: "/",
    element: <Layout lang="fr" />,
    entry: "src/Layout.tsx",
    children: [
      { index: true, element: <App />, entry: "src/App.tsx" },
      ...pages,
    ],
  },
  {
    path: "/en",
    element: <Layout lang="en" />,
    entry: "src/Layout.tsx",
    children: [
      { index: true, element: <App />, entry: "src/App.tsx" },
      ...pages,
      // Rattrapage côté client pour les liens cassés en navigation interne.
      { path: "*", element: <NotFoundPage />, entry: "src/pages/NotFoundPage.tsx" },
    ],
  },
  {
    // Rattrapage global — doit rester après la branche /en.
    path: "*",
    element: <Layout lang="fr" />,
    entry: "src/Layout.tsx",
    children: [
      { path: "*", element: <NotFoundPage />, entry: "src/pages/NotFoundPage.tsx" },
    ],
  },
];
