/* Produit les blocs à intégrer ET les maquettes consultables des trois offres.
 * Usage : npm run build:embed [ia|rdv|web ...]   (sans argument : les trois) */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const RACINE = path.resolve(import.meta.dirname, "..");
const MAQUETTES = path.join(RACINE, "maquettes");
const demandees = process.argv.slice(2);
const offres = demandees.length ? demandees : ["ia", "rdv", "web"];

mkdirSync(MAQUETTES, { recursive: true });

for (const offre of offres) {
  console.log(`\n=== ${offre} ===`);
  execSync(`npx vite build --config vite.embed.config.ts`, {
    cwd: RACINE,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, VITE_PRODUIT: offre },
  });
  execSync(`node scripts/build-embed-block.mjs ${offre}`, { cwd: RACINE, stdio: "inherit" });
  execSync(
    `node scripts/build-embed-preview.mjs ${path.join(MAQUETTES, offre + ".html")} ${offre}`,
    { cwd: RACINE, stdio: "inherit" },
  );
}
