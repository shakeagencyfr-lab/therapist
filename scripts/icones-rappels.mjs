/**
 * Les icônes de l'espace installé — écran d'accueil et notifications.
 *
 * NEUTRES À DESSEIN. Elles s'affichent chez tous les cabinets, y compris ceux
 * qui ont payé pour ne plus voir notre marque : ni logo ni lettre, seulement
 * un disque clair dans un anneau, sur un fond chaud — un repère calme, qui
 * n'appartient à personne.
 *
 * Engendrées plutôt que dessinées, pour qu'on puisse les refaire à
 * l'identique : `node scripts/icones-rappels.mjs`. Aucune dépendance — un
 * encodeur PNG tient en quarante lignes avec le zlib de Node.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const ICI = dirname(fileURLToPath(import.meta.url))
const SORTIE = join(ICI, '..', 'public', 'icones')

const HAUT = [0x3d, 0x31, 0x23]
const BAS = [0x28, 0x1f, 0x15]
const CLAIR = [0xf4, 0xef, 0xe6]

/** Un bloc PNG : longueur, type, données, somme de contrôle. */
function bloc(type, donnees) {
  const longueur = Buffer.alloc(4)
  longueur.writeUInt32BE(donnees.length)
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees])
  const somme = Buffer.alloc(4)
  somme.writeUInt32BE(crc32(corps) >>> 0)
  return Buffer.concat([longueur, corps, somme])
}

function png(taille, pixel) {
  const ligne = taille * 4 + 1
  const brut = Buffer.alloc(ligne * taille)
  for (let y = 0; y < taille; y += 1) {
    brut[y * ligne] = 0 // aucun filtre
    for (let x = 0; x < taille; x += 1) {
      const [r, g, b, a] = pixel(x, y)
      const i = y * ligne + 1 + x * 4
      brut[i] = r
      brut[i + 1] = g
      brut[i + 2] = b
      brut[i + 3] = a
    }
  }
  const entete = Buffer.alloc(13)
  entete.writeUInt32BE(taille, 0)
  entete.writeUInt32BE(taille, 4)
  entete[8] = 8 // 8 bits par canal
  entete[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', entete),
    bloc('IDAT', deflateSync(brut, { level: 9 })),
    bloc('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Part du pixel couverte par le motif, sur 16 échantillons : c'est ce qui
 * adoucit les bords au lieu de les laisser en escalier.
 */
function couverture(x, y, taille, dedans) {
  let n = 0
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      const u = (x + (i + 0.5) / 4) / taille - 0.5
      const v = (y + (j + 0.5) / 4) / taille - 0.5
      if (dedans(Math.hypot(u, v))) n += 1
    }
  }
  return n / 16
}

// Le motif tient dans un rayon de 0,32 : sous les 0,40 que garantit un
// masque adaptatif, il n'est jamais rogné.
const disque = (r) => r <= 0.17
const anneau = (r) => r >= 0.285 && r <= 0.315

function melange(fond, dessus, part) {
  return fond.map((c, i) => Math.round(c + (dessus[i] - c) * part))
}

function icone(taille) {
  return png(taille, (x, y) => {
    const t = y / (taille - 1)
    let c = HAUT.map((h, i) => Math.round(h + (BAS[i] - h) * t))
    c = melange(c, CLAIR, couverture(x, y, taille, anneau) * 0.4)
    c = melange(c, CLAIR, couverture(x, y, taille, disque))
    return [...c, 255]
  })
}

/** Android n'en garde que la transparence : blanc sur rien. */
function badge(taille) {
  return png(taille, (x, y) => {
    const a = Math.max(couverture(x, y, taille, disque), couverture(x, y, taille, (r) => r >= 0.3 && r <= 0.38))
    return [255, 255, 255, Math.round(a * 255)]
  })
}

mkdirSync(SORTIE, { recursive: true })
const fichiers = {
  'rappel-192.png': icone(192),
  'rappel-512.png': icone(512),
  'rappel-masquable-512.png': icone(512),
  'apple-touch-180.png': icone(180),
  'badge-96.png': badge(96),
}
for (const [nom, contenu] of Object.entries(fichiers)) {
  writeFileSync(join(SORTIE, nom), contenu)
  console.log(`${nom}  ${contenu.length} octets`)
}
