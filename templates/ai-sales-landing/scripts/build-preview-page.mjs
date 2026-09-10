import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = "/home/user/therapist/templates/ai-sales-landing";
const D = path.join(ROOT, "preview-dist");

let js = readFileSync(path.join(D, "app.js"), "utf8");
let css = readFileSync(path.join(D, "style.css"), "utf8");

// --- images du dossier public/ -> URI de données -------------------------
const MIME = { ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg" };
const cache = new Map();
function dataUri(p) {
  if (cache.has(p)) return cache.get(p);
  const file = path.join(ROOT, "public", p);
  if (!existsSync(file)) return null;
  const ext = path.extname(p);
  const uri = `data:${MIME[ext] ?? "application/octet-stream"};base64,${readFileSync(file).toString("base64")}`;
  cache.set(p, uri);
  return uri;
}

const RE = /\/(emoji-animated|emoji|brand)\/([A-Za-z0-9._-]+\.(?:png|svg|jpg))/g;
let replaced = 0, missing = new Set();
const swap = (s) =>
  s.replace(RE, (m, dir, file) => {
    const uri = dataUri(`${dir}/${file}`);
    if (!uri) { missing.add(m); return m; }
    replaced++;
    return uri;
  });

js = swap(js);
css = swap(css);

// Les emojis sont assemblés dynamiquement (`/emoji/${nom}`), donc invisibles
// pour le remplacement littéral ci-dessus. On remplace les deux expressions
// par une lecture dans une table, et on émet la table.
let tmplHits = 0;
js = js.replace(/`\/emoji-animated\/\$\{(\w+)\}`/g, (_m, v) => { tmplHits++; return `__EMOJI__["/emoji-animated/"+${v}]`; });
js = js.replace(/`\/emoji\/\$\{(\w+)\}`/g, (_m, v) => { tmplHits++; return `__EMOJI__["/emoji/"+${v}]`; });

import { readdirSync } from "node:fs";
const table = {};
for (const dir of ["emoji", "emoji-animated"]) {
  for (const f of readdirSync(path.join(ROOT, "public", dir))) {
    if (!/\.(png|svg|jpg)$/.test(f)) continue;
    const uri = dataUri(`${dir}/${f}`);
    if (uri) table[`/${dir}/${f}`] = uri;
  }
}
const tableJs = `var __EMOJI__ = ${JSON.stringify(table)};`;

// --- script d'amorçage ---------------------------------------------------
// 1) l'artefact peut être servi sous un sous-chemin : on ramène le routeur à "/"
// 2) les liens internes sont de simples <a href> : on les intercepte pour que
//    React Router change de page sans recharger (et sans quitter l'aperçu)
const boot = `
(function () {
  var ROUTES = /^\\/(en(\\/|$)|pricing|contact|terms|privacy-policy|guide|404)?\\/?$/;
  try {
    if (!ROUTES.test(location.pathname)) history.replaceState(null, "", "/");
  } catch (e) {}
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var a = e.target.closest && e.target.closest("a");
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href || !href.startsWith("/")) return;
    e.preventDefault();
    var hash = href.indexOf("#");
    var path = hash === -1 ? href : href.slice(0, hash);
    var frag = hash === -1 ? "" : href.slice(hash);
    if (path !== location.pathname) {
      history.pushState(null, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    if (frag && frag.length > 1) {
      setTimeout(function () {
        var el = document.querySelector(frag);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  });
})();
`;

const esc = (s) => s.replace(/<\\?\/script/gi, (m) => m.replace("/", "\\\\/"));

// Le bundle hydrate toujours : on pré-remplit la racine avec le HTML déjà
// pré-généré pour la page d'accueil française, sinon React signale un écart
// d'hydratation (erreur #418) et repart d'un rendu client.
const ssg = readFileSync(path.join(ROOT, "dist", "index.html"), "utf8");
const ROOT_TAG = '<div id="root" data-server-rendered="true">';
const after = ssg.split(ROOT_TAG)[1] ?? "";
const cut = after.indexOf("<script");
let rootHtml = cut === -1 ? "" : after.slice(0, cut).trimEnd();
if (rootHtml.endsWith("</div>")) rootHtml = rootHtml.slice(0, -6);
rootHtml = swap(rootHtml);
console.log("racine pré-générée :", (rootHtml.length / 1024).toFixed(0), "Ko");

const out = `<title>Aperçu — agent commercial IA</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<style>
${css}
</style>
<div id="root"></div>
<script>${boot}</script>
<script>${tableJs}</script>
<script type="module">
${esc(js)}
</script>
`;

const target = "/tmp/claude-0/-home-user-therapist/4e4daa49-72a1-5629-b7bd-74353b71dd17/scratchpad/apercu.html";
writeFileSync(target, out);
console.log("images intégrées :", replaced, "| gabarits remplacés :", tmplHits, "| table :", Object.keys(table).length, "entrées");
if (missing.size) console.log("INTROUVABLES :", [...missing].slice(0, 5));
console.log("taille de la page :", (out.length / 1024 / 1024).toFixed(2), "Mo");
