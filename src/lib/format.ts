/** Formatage partagé par plusieurs écrans. */

/** `mm:ss` sur deux chiffres — minuteur de séance. */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
}

/** `m:ss` — position de lecture audio. */
export function timecode(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

/** Durée `mm:ss` en secondes. Une durée inconnue (« — ») vaut 0, pas NaN. */
export function durationToSeconds(duration: string): number {
  const [m = 0, s = 0] = duration.split(':').map((n) => parseInt(n, 10) || 0)
  return m * 60 + s
}

/** Montant en euros, virgule décimale, plancher explicite sous un centime. */
export function euro(amount: number): string {
  return amount < 0.01 ? 'moins de 0,01 €' : `${amount.toFixed(2).replace('.', ',')} €`
}

/** Accord singulier / pluriel. */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
}

/** Montant en euros à partir de centimes : « 79,00 € ». */
export function euroCents(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`
}

/** Date du jour, « 1 septembre » — fil d'Ariane et horodatage de séance. */
export function dateDuJour(now: Date = new Date()): string {
  return now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

/**
 * Une date de base, telle qu'on la lit : « 3 octobre 2026 ».
 *
 * Les horodatages sortent de Postgres en ISO — « 2026-10-03T00:00:00+00:00 ».
 * Affiché tel quel, à côté de « Échéance le », c'est illisible ; et une date
 * illisible est une date qu'on ne vérifie pas.
 */
export function dateLongue(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
