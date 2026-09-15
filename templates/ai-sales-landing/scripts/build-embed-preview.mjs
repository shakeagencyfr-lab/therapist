/* =============================================================================
 *  build-embed-preview.mjs — la maquette consultable du bloc à intégrer
 * =============================================================================
 *
 *  Même contenu que scripts/build-embed-block.mjs (la landing sans en-tête ni
 *  pied de page), mais assemblé en page autonome à publier, plutôt qu'en bloc
 *  à coller. Sert à faire valider le rendu avant l'intégration.
 *
 *  Entrée : embed-dist/  (npx vite build --config vite.embed.config.ts)
 *  Sortie : un fichier HTML prêt à publier, chemin passé en argument.
 * ========================================================================== */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const RACINE = path.resolve(import.meta.dirname, "..");
const OFFRES = {
  ia: { dossier: "embed-dist-ia", fichier: "booster-ia-pro", titre: "Booster IA Pro" },
  rdv: { dossier: "embed-dist-rdv", fichier: "booster-rdv-pro", titre: "Booster RDV Pro" },
  web: { dossier: "embed-dist-web", fichier: "booster-web-pro", titre: "Web Pro" },
};
const CLE = process.argv[3] ?? "ia";
const OFFRE = OFFRES[CLE];
if (!OFFRE) {
  console.error(`offre inconnue : ${CLE} (attendu : ia, rdv ou web)`);
  process.exit(1);
}

const DIST = path.join(RACINE, OFFRE.dossier);
const PUBLIC = path.join(RACINE, "public");
const SORTIE = process.argv[2];
if (!SORTIE) {
  console.error("usage : node scripts/build-embed-preview.mjs <sortie.html> [ia|rdv|web]");
  process.exit(1);
}

const CONTACT_URL = "https://www.shakeagency.io/contact";

const cache = new Map();
async function webpDataUri(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const fichier = path.join(PUBLIC, rel);
  if (!existsSync(fichier)) return null;
  let uri;
  if (path.extname(rel) === ".svg") {
    uri = `data:image/svg+xml;base64,${readFileSync(fichier).toString("base64")}`;
  } else {
    const buf = await sharp(fichier)
      .resize(96, 96, { fit: "inside" })
      .webp({ quality: 82 })
      .toBuffer();
    uri = `data:image/webp;base64,${buf.toString("base64")}`;
  }
  cache.set(rel, uri);
  return uri;
}

let js = readFileSync(path.join(DIST, "embed.js"), "utf8");
let css = readFileSync(path.join(DIST, "style.css"), "utf8");

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

js = js.replace(/`\/emoji-animated\/\$\{(\w+)\}`/g, (_m, v) => `__EMOJI__["/emoji-animated/"+${v}]`);
js = js.replace(/`\/emoji\/\$\{(\w+)\}`/g, (_m, v) => `__EMOJI__["/emoji/"+${v}]`);

const table = {};
for (const dir of ["emoji", "emoji-animated"]) {
  for (const f of readdirSync(path.join(PUBLIC, dir))) {
    if (!/\.(png|svg|jpg)$/.test(f)) continue;
    const uri = await webpDataUri(`${dir}/${f}`);
    if (uri) table[`/${dir}/${f}`] = uri;
  }
}

js = js.split("__CONTACT_URL__").join(CONTACT_URL);

const POLICES =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap";

// Pas de <html>, <head> ni <body> : la page publiée les fournit.
const page =
  `<title>Landing ${OFFRE.titre}</title>\n` +
  `<link rel="preconnect" href="https://fonts.googleapis.com">\n` +
  `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n` +
  `<link rel="stylesheet" href="${POLICES}">\n` +
  `<style>\n${css}\n</style>\n` +
  `<div id="shk-embed-root"></div>\n` +
  `<script>var __EMOJI__=${JSON.stringify(table)};<\/script>\n` +
  `<script type="module">\n${js}\n<\/script>\n`;

writeFileSync(SORTIE, page);
console.log(`images intégrées : ${cache.size}`);
console.log(`maquette écrite  : ${SORTIE}`);
console.log(`taille           : ${(page.length / 1024 / 1024).toFixed(2)} Mo`);
