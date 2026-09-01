/**
 * Chiffrement des secrets d'intégration — clé Anthropic, clé Stripe — que
 * les cabinets confient au serveur.
 *
 * Ces clés sont des moyens de paiement. Elles ne dorment donc pas en clair
 * dans une table, même réservée au rôle de service : une sauvegarde qui
 * fuite, un export, une console ouverte, et elles seraient lisibles. Ici,
 * AES-256-GCM avec une clé que seul le serveur détient (INTEGRATIONS_KEY),
 * un vecteur d'initialisation neuf à chaque chiffrement, et l'étiquette
 * d'authentification qui fait échouer tout déchiffrement d'une valeur
 * altérée.
 *
 * Sans INTEGRATIONS_KEY, on refuse d'enregistrer : un secret stocké en clair
 * « en attendant » ne se rattrape jamais.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { HttpError } from './errors.js'

const VERSION = 'v1'

/** La clé de chiffrement, dérivée de la variable d'environnement. */
function cle(): Buffer {
  const brute = (process.env.INTEGRATIONS_KEY ?? '').trim()
  if (!brute) {
    throw new HttpError(
      503,
      "Le chiffrement des clés n'est pas configuré sur ce serveur (INTEGRATIONS_KEY absente). Rien n'a été enregistré.",
    )
  }
  // Quelle que soit la forme donnée (base64, hex, phrase), on en tire 32
  // octets stables : ce qui compte est qu'elle soit longue et secrète.
  return createHash('sha256').update(brute, 'utf8').digest()
}

/** Le chiffrement est-il possible ? Pour le dire à l'écran avant d'essayer. */
export function chiffrementConfigure(): boolean {
  return (process.env.INTEGRATIONS_KEY ?? '').trim().length > 0
}

/** Chiffre une valeur. Rend `v1:<iv>:<tag>:<données>` en base64. */
export function chiffrer(clair: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', cle(), iv)
  const donnees = Buffer.concat([cipher.update(clair, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), donnees.toString('base64')].join(':')
}

/** Déchiffre une valeur produite par `chiffrer`. Lève si elle a été altérée. */
export function dechiffrer(scelle: string): string {
  const [version, iv, tag, donnees] = scelle.split(':')
  if (version !== VERSION || !iv || !tag || !donnees) {
    throw new HttpError(500, 'Secret illisible : format inconnu.')
  }
  const decipher = createDecipheriv('aes-256-gcm', cle(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(donnees, 'base64')), decipher.final()]).toString('utf8')
}

/**
 * Ce qu'on montre d'une clé : ses quatre derniers caractères. Assez pour
 * reconnaître laquelle est enregistrée, jamais assez pour s'en servir.
 */
export function empreinte(valeur: string): string {
  const propre = valeur.trim()
  return propre.length <= 4 ? '••••' : `…${propre.slice(-4)}`
}
