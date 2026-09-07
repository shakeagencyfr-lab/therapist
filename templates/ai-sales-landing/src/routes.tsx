import type { RouteRecord } from "vite-react-ssg";
import Layout from "./Layout";
import App from "./App";
import PricingPage from "./pages/PricingPage";
import GuidePage from "./pages/GuidePage";
import ContactPage from "./pages/ContactPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import NotFoundPage from "./pages/NotFoundPage";

export const routes: RouteRecord[] = [
  {
    path: "/",
    element: <Layout />,
    entry: "src/Layout.tsx",
    children: [
      { index: true, element: <App />, entry: "src/App.tsx" },
      {
        path: "pricing",
        element: <PricingPage />,
        entry: "src/pages/PricingPage.tsx",
      },
      {
        // Owner's manual — deliberately NOT linked from nav/footer + noindex.
        path: "guide",
        element: <GuidePage />,
        entry: "src/pages/GuidePage.tsx",
      },
      {
        path: "contact",
        element: <ContactPage />,
        entry: "src/pages/ContactPage.tsx",
      },
      {
        path: "terms",
        element: <TermsPage />,
        entry: "src/pages/TermsPage.tsx",
      },
      {
        path: "privacy-policy",
        element: <PrivacyPolicyPage />,
        entry: "src/pages/PrivacyPolicyPage.tsx",
      },
      {
        // Pre-rendered, then copied to dist/404.html by the build script —
        // Cloudflare Pages (and most static hosts) serve that file for any
        // unknown URL automatically.
        path: "404",
        element: <NotFoundPage />,
        entry: "src/pages/NotFoundPage.tsx",
      },
      {
        // Client-side catch-all (bad links during in-app navigation).
        path: "*",
        element: <NotFoundPage />,
        entry: "src/pages/NotFoundPage.tsx",
      },
    ],
  },
];
