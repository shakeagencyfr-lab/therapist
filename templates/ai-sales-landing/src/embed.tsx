/* =============================================================================
 *  embed.tsx — point d'entrée du BLOC À INTÉGRER
 * =============================================================================
 *
 *  Rend la landing « Booster IA Pro » en français, sans en-tête ni pied de
 *  page, pour insertion dans un site tiers. Le site normal n'utilise pas ce
 *  fichier : il passe par main.tsx et vite-react-ssg.
 *
 *  Assemblé en une page autonome par scripts/build-embed-block.mjs.
 * ========================================================================== */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { setActiveLang, setActiveProduct } from "./brand.config";
import { brandThemeCss } from "./lib/brandTheme";
import "./styles.css";

setActiveLang("fr");
setActiveProduct("ia");

/* Le thème (couleurs de marque, polices, matière des cartes) est normalement
   injecté par Layout.tsx. Ici on le pose à la main dans le <head>. */
function injecterTheme() {
  const style = document.createElement("style");
  style.id = "brand-theme";
  style.textContent = brandThemeCss();
  document.head.appendChild(style);
}

/* Les liens internes n'ont pas de sens hors du site : on les rabat sur les
   ancres de la page quand elles existent. Le bouton « Parlons-en » du palier
   Pro est le seul à sortir : il pointe vers l'adresse définie ci-dessous. */
const CONTACT_EXTERNE = "__CONTACT_URL__";

function interceptorLiens() {
  document.addEventListener("click", (e) => {
    const cible = e.target as HTMLElement | null;
    const a = cible?.closest?.("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || !href.startsWith("/")) return;
    e.preventDefault();

    const hash = href.includes("#") ? href.slice(href.indexOf("#")) : null;
    const chemin = (hash ? href.slice(0, href.indexOf("#")) : href).replace(/\/+$/, "");

    if (chemin === "/contact" && CONTACT_EXTERNE.startsWith("http")) {
      window.open(CONTACT_EXTERNE, "_blank", "noopener");
      return;
    }
    const ancre =
      hash ??
      (chemin === "/pricing" ? "#pricing" : chemin === "/contact" ? "#pricing" : null);
    if (!ancre) return;
    document.querySelector(ancre)?.scrollIntoView({ behavior: "smooth" });
  });
}

const racine = document.getElementById("shk-embed-root");
if (racine) {
  injecterTheme();
  interceptorLiens();
  createRoot(racine).render(
    <StrictMode>
      <MemoryRouter initialEntries={["/"]}>
        <App chrome={false} />
      </MemoryRouter>
    </StrictMode>,
  );
}
