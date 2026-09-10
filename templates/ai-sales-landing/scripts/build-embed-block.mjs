/* =============================================================================
 *  build-embed-block.mjs — assemble le BLOC HTML à intégrer dans un site tiers
 * =============================================================================
 *
 *  Entrée  : embed-dist/ (produit par `npx vite build --config vite.embed.config.ts`)
 *  Sortie  : embeds/booster-ia-pro-bloc.html
 *
 *  Le bloc est un <iframe> dont le document complet est intégré dans la page.
 *  L'iframe est un choix délibéré : elle garantit dans les DEUX sens qu'aucun
 *  style ne fuit — la feuille du site hôte ne peut pas déformer la landing, et
 *  la remise à zéro de Tailwind ne peut pas casser le site hôte. Sa hauteur
 *  s'ajuste toute seule par postMessage.
 *
 *  Les images sont converties en WebP 96 px (elles s'affichent à 40 px au plus)
 *  puis intégrées en URI de données : douze fois plus léger que les PNG 256 px.
 * ========================================================================== */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const RACINE = path.resolve(import.meta.dirname, "..");
const DIST = path.join(RACINE, "embed-dist");
const PUBLIC = path.join(RACINE, "public");
const SORTIE = path.resolve(RACINE, "../../embeds/booster-ia-pro-bloc.html");

/** Adresse du bouton « Parlons-en » du palier Pro — le seul lien qui sorte du bloc. */
const CONTACT_URL = "https://www.shakeagency.io/contact";

/* ---------- images ---------------------------------------------------- */
const cache = new Map();
async function webpDataUri(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const fichier = path.join(PUBLIC, rel);
  if (!existsSync(fichier)) return null;
  const ext = path.extname(rel);
  let uri;
  if (ext === ".svg") {
    uri = `data:image/svg+xml;base64,${readFileSync(fichier).toString("base64")}`;
  } else {
    const buf = await sharp(fichier).resize(96, 96, { fit: "inside" }).webp({ quality: 82 }).toBuffer();
    uri = `data:image/webp;base64,${buf.toString("base64")}`;
  }
  cache.set(rel, uri);
  return uri;
}

let js = readFileSync(path.join(DIST, "embed.js"), "utf8");
let css = readFileSync(path.join(DIST, "style.css"), "utf8");

// Chemins écrits en toutes lettres (logo, favicon, quelques emojis).
const MOTIF = /\/(emoji-animated|emoji|brand)\/([A-Za-z0-9._-]+\.(?:png|svg|jpg))/g;
const litteraux = new Set();
for (const s of [js, css]) for (const m of s.matchAll(MOTIF)) litteraux.add(m[0].slice(1));
for (const rel of litteraux) {
  const uri = await webpDataUri(rel);
  if (uri) {
    js = js.split("/" + rel).join(uri);
    css = css.split("/" + rel).join(uri);
  }
}

// Les emojis sont assemblés dynamiquement (`/emoji/${nom}`) : on remplace les
// deux expressions par une lecture dans une table, et on émet la table.
let gabarits = 0;
js = js.replace(/`\/emoji-animated\/\$\{(\w+)\}`/g, (_m, v) => { gabarits++; return `__EMOJI__["/emoji-animated/"+${v}]`; });
js = js.replace(/`\/emoji\/\$\{(\w+)\}`/g, (_m, v) => { gabarits++; return `__EMOJI__["/emoji/"+${v}]`; });

const table = {};
for (const dir of ["emoji", "emoji-animated"]) {
  for (const f of readdirSync(path.join(PUBLIC, dir))) {
    if (!/\.(png|svg|jpg)$/.test(f)) continue;
    const uri = await webpDataUri(`${dir}/${f}`);
    if (uri) table[`/${dir}/${f}`] = uri;
  }
}

// L'adresse de contact, injectée dans le bundle.
js = js.split("__CONTACT_URL__").join(CONTACT_URL);

/* ---------- document interne ------------------------------------------ */
const POLICES =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap";

const hauteur = `
<script>
(function () {
  function envoyer() {
    var h = document.documentElement.scrollHeight;
    parent.postMessage({ shkBloc: "hauteur", valeur: h }, "*");
  }
  window.addEventListener("load", envoyer);
  new ResizeObserver(envoyer).observe(document.documentElement);
  setInterval(envoyer, 1000);
})();
<\/script>`;

const interne =
  `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<link rel="preconnect" href="https://fonts.googleapis.com">` +
  `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
  `<link rel="stylesheet" href="${POLICES}">` +
  `<style>${css}</style></head><body style="margin:0">` +
  `<div id="shk-embed-root"></div>` +
  `<script>var __EMOJI__=${JSON.stringify(table)};<\/script>` +
  `<script type="module">${js}<\/script>` +
  hauteur +
  `</body></html>`;

/* ---------- bloc à coller --------------------------------------------- */
const bloc = `<!--
  Booster IA Pro — bloc à coller dans un bloc HTML / code de votre site.

  • La landing complète, sans en-tête ni pied de page (votre site apporte les siens).
  • Isolée dans une iframe : aucun style ne passe dans un sens ni dans l'autre.
    Rien ne peut casser votre site, et votre feuille de style ne peut pas
    déformer la landing.
  • Sa hauteur s'ajuste automatiquement au contenu.
  • Aucun fichier à héberger : tout est dans ce bloc.

  Pour changer l'adresse du bouton « Parlons-en » : cherchez
  ${CONTACT_URL} ci-dessous et remplacez-la.
-->
<div id="shk-ia-bloc" style="width:100%">
  <iframe
    id="shk-ia-iframe"
    title="Booster IA Pro"
    loading="lazy"
    style="width:100%;height:600px;border:0;display:block;color-scheme:light"
  ></iframe>
</div>
<script>
(function () {
  var cadre = document.getElementById("shk-ia-iframe");
  if (!cadre) return;

  window.addEventListener("message", function (e) {
    if (!e.data || e.data.shkBloc !== "hauteur") return;
    if (e.source !== cadre.contentWindow) return;
    var h = Math.max(400, Math.min(60000, e.data.valeur | 0));
    if (Math.abs(parseInt(cadre.style.height, 10) - h) > 2) {
      cadre.style.height = h + "px";
    }
  });

  cadre.srcdoc = ${JSON.stringify(interne).replace(/<\//g, "<\\/")};
})();
</script>
`;

mkdirSync(path.dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, bloc);

console.log(`images distinctes intégrées : ${cache.size}`);
console.log(`gabarits d'emoji remplacés  : ${gabarits}`);
console.log(`table d'emojis              : ${Object.keys(table).length} entrées`);
console.log(`bloc écrit                  : ${SORTIE}`);
console.log(`taille                      : ${(bloc.length / 1024 / 1024).toFixed(2)} Mo`);
