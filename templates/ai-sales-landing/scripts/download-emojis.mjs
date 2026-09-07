import { mkdir, writeFile } from "node:fs/promises";

const OUT = process.argv[2];
const BASE = "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets";

// kebab filename -> Fluent asset folder name
const MAP = {
  "alarm-clock": "Alarm clock",
  "artist-palette": "Artist palette",
  "balance-scale": "Balance scale",
  books: "Books",
  brain: "Brain",
  briefcase: "Briefcase",
  calendar: "Calendar",
  "chart-increasing": "Chart increasing",
  compass: "Compass",
  "desktop-computer": "Desktop computer",
  envelope: "Envelope",
  eyes: "Eyes",
  "flexed-biceps": "Flexed biceps",
  gear: "Gear",
  globe: "Globe showing Americas",
  "graduation-cap": "Graduation cap",
  handshake: "Handshake",
  "high-voltage": "High voltage",
  "hourglass-done": "Hourglass done",
  "hourglass-not-done": "Hourglass not done",
  house: "House",
  key: "Key",
  link: "Link",
  "lotion-bottle": "Lotion bottle",
  megaphone: "Megaphone",
  "money-with-wings": "Money with wings",
  "money-wings": "Money with wings",
  package: "Package",
  "party-popper": "Party popper",
  robot: "Robot",
  rocket: "Rocket",
  shield: "Shield",
  "shopping-cart": "Shopping cart",
  snowflake: "Snowflake",
  sparkles: "Sparkles",
  "speech-balloon": "Speech balloon",
  telephone: "Telephone",
  tooth: "Tooth",
};

const snake = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_");

async function tryFetch(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

await mkdir(OUT, { recursive: true });
const missing = [];

for (const [file, folder] of Object.entries(MAP)) {
  const f = snake(folder);
  const candidates = [
    `${BASE}/${encodeURIComponent(folder)}/3D/${f}_3d.png`,
    `${BASE}/${encodeURIComponent(folder)}/Default/3D/${f}_3d_default.png`,
    `${BASE}/${encodeURIComponent(folder)}/Default/3D/${f}_3d.png`,
  ];
  let buf = null;
  for (const url of candidates) {
    buf = await tryFetch(url);
    if (buf) break;
  }
  if (!buf) {
    missing.push(file);
    console.log(`MANQUE  ${file}.png  (dossier essayé : "${folder}")`);
    continue;
  }
  await writeFile(`${OUT}/${file}.png`, buf);
  console.log(`ok      ${file}.png  ${(buf.length / 1024).toFixed(0)} Ko`);
}

console.log(`\n${Object.keys(MAP).length - missing.length}/${Object.keys(MAP).length} téléchargés`);
if (missing.length) console.log("Non résolus :", missing.join(", "));
