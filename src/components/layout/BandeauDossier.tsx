import { Notice } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'

/**
 * Ce que le dossier n'a pas pu lire, dit là où on le regarde.
 *
 * `recharger()` lance dix-huit requêtes et n'en vérifiait que huit. Les dix
 * autres pouvaient échouer sans un mot : l'écran présentait alors leur
 * absence comme un fait, et une thérapeute ne peut pas distinguer « il n'y en
 * a pas » de « je n'ai pas pu le lire ». Elle republiait par-dessus.
 *
 * Le message d'échec complet, lui, n'était visible que sur l'écran vide —
 * c'est-à-dire jamais, dès qu'une fiche existait.
 */
export function BandeauDossier() {
  const cabinet = useMaybeCabinet()
  if (!cabinet?.reel) return null
  const message = cabinet.erreur || cabinet.incomplet
  if (!message) return null
  return (
    <Notice tone={cabinet.erreur ? 'hot' : 'warn'} style={{ margin: '12px 20px 0' }}>
      {message}
    </Notice>
  )
}
