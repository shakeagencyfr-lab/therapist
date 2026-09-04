/**
 * Rapatrie les polices du produit dans public/fonts/.
 *
 * POURQUOI. Une page publique qui charge sa police chez Google signale à
 * Google la visite de chaque patient — sur la page d'un cabinet de thérapie,
 * cela suffit à révéler qu'on consulte. Les fichiers sont donc servis depuis
 * notre domaine, et la page n'adresse plus une seule requête à un tiers.
 *
 * CE QU'IL GARDE. Les sous-ensembles latin et latin-ext seulement : le reste
 * — cyrillique, grec, vietnamien — pèse sans servir à un produit en français.
 * Chaque @font-face conserve sa plage `unicode-range`, ce qui laisse le
 * navigateur ne télécharger que ce dont la page a besoin.
 *
 * QUAND LE RELANCER. À l'ajout d'une police dans src/lib/themeVitrine.ts, et
 * jamais autrement : les fichiers sont versionnés, et une police qui change
 * de version chez Google ne doit pas changer sous les pieds d'un cabinet.
 *
 *   node scripts/telecharger-polices.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

/* DEUX FEUILLES, PAS UNE.
 *
 * `base.css` ne porte que les deux polices du produit : elle est chargée par
 * les trois documents, dont l'espace patient, qu'on ouvre sur un téléphone
 * deux minutes par jour. `vitrine.css` porte les quatorze autres et n'est
 * demandée que par une page publique dont le thème en emploie une.
 *
 * Tout mettre dans une feuille coûtait trente kilo-octets de règles à
 * analyser à chaque ouverture de l'application, pour soixante-dix-huit
 * polices qu'elle n'affichera jamais.
 *
 * Les graisses sont celles réellement employées : en demander une de plus,
 * c'est un fichier de plus à servir pour rien. */
const BASE = [
  'Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400',
  'Public+Sans:wght@400;500;600',
]

/* La liste suit celle de src/lib/themeVitrine.ts. */
const VITRINE = [
  'Fraunces:opsz,wght@9..144,400;9..144,600',
  'Playfair+Display:wght@400;600',
  'Lora:wght@400;600',
  'Cormorant+Garamond:wght@400;600',
  'Instrument+Serif',
  'Space+Grotesk:wght@400;600',
  'DM+Serif+Display',
  'Inter:wght@400;500;600',
  'Manrope:wght@400;500;600',
  'Plus+Jakarta+Sans:wght@400;500;600',
  'Work+Sans:wght@400;500;600',
  'Karla:wght@400;500;600',
  'Nunito+Sans:wght@400;500;600',
  'Source+Sans+3:wght@400;500;600',
]

/* Sans un agent récent, Google sert du TTF au lieu du woff2 — trois fois plus
   lourd, pour le même rendu. */
const AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const GARDES = new Set(['latin', 'latin-ext'])

async function texte(url) {
  const r = await fetch(url, { headers: { 'User-Agent': AGENT } })
  if (!r.ok) throw new Error(`${r.status} sur ${url}`)
  return r.text()
}

async function principal() {
  await mkdir('public/fonts', { recursive: true })
  const vus = new Map()

  await feuille('base.css', BASE, vus, 'les deux polices du produit')
  await feuille('vitrine.css', VITRINE, vus, 'les polices au choix de la vitrine')
  console.log(`\n${vus.size} fichiers de police`)
}

async function feuille(nom, familles, vus, quoi) {
  const blocs = []
  for (const famille of familles) {
    const css = await texte(
      `https://fonts.googleapis.com/css2?family=${famille}&display=swap`,
    )
    /* Le commentaire qui précède chaque @font-face nomme le sous-ensemble :
       c'est la seule façon de les trier, l'unicode-range seul ne le dit pas. */
    const morceaux = css.split('/* ').slice(1)
    for (const morceau of morceaux) {
      const sousEnsemble = morceau.slice(0, morceau.indexOf(' */')).trim()
      if (!GARDES.has(sousEnsemble)) continue
      const regle = morceau.slice(morceau.indexOf('@font-face'))
      const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/.exec(regle)?.[1]
      if (!url) continue

      let nom = vus.get(url)
      if (!nom) {
        const r = await fetch(url, { headers: { 'User-Agent': AGENT } })
        if (!r.ok) throw new Error(`${r.status} sur ${url}`)
        const octets = Buffer.from(await r.arrayBuffer())
        /* Le nom porte l'empreinte du contenu : deux versions d'une même
           police ne peuvent pas se recouvrir, et le fichier est immuable. */
        const empreinte = createHash('sha1').update(octets).digest('hex').slice(0, 10)
        const base = famille.split(':')[0].toLowerCase().replace(/\+/g, '-')
        nom = `${base}-${empreinte}.woff2`
        await writeFile(`public/fonts/${nom}`, octets)
        vus.set(url, nom)
      }
      blocs.push(regle.replace(/url\(https:\/\/fonts\.gstatic\.com\/[^)]+\)/, `url(/fonts/${nom})`).trim())
    }
    console.log(`✓ ${famille.split(':')[0].replace(/\+/g, ' ')}`)
  }

  const entete = [
    `/* Polices servies depuis notre domaine — ${quoi}.`,
    ' *',
    ' * ENGENDRÉ PAR scripts/telecharger-polices.mjs — NE PAS ÉDITER À LA MAIN.',
    ' *',
    ' * Une page publique qui charge sa police chez un tiers lui signale la',
    " * visite de chaque patient. Sur la page d'un cabinet de thérapie, cela",
    ' * suffit à révéler une consultation : les fichiers sont donc ici.',
    ' *',
    ' * Chaque règle garde sa plage unicode-range : le navigateur ne télécharge',
    " * que le sous-ensemble dont la page a besoin, jamais les deux d'office.",
    ' */',
    '',
  ].join('\n')
  await writeFile(`public/fonts/${nom}`, `${entete}${blocs.join('\n\n')}\n`)
  console.log(`  → public/fonts/${nom} · ${blocs.length} règles`)
}

principal().catch((e) => {
  console.error(e)
  process.exit(1)
})
