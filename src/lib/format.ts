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

/** Durée `mm:ss` en secondes. */
export function durationToSeconds(duration: string): number {
  const [m, s] = duration.split(':').map((n) => parseInt(n, 10) || 0)
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
