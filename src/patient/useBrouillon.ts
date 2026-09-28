import { useCallback, useState } from 'react'
import { useMaybeAuth } from '@/auth/session'
import {
  cleDeBrouillon,
  garderBrouillon,
  lireBrouillon,
  oublierBrouillon,
  stockageDeLOnglet,
} from '@/lib/brouillon'

/**
 * Un champ de texte dont le brouillon survit à l'écran qui le porte.
 *
 * S'utilise comme `useState` : `[texte, poser]`, plus `oublier` pour le jour
 * où le texte est enregistré. Le brouillon se range sous le patient connecté
 * (lu dans la session) et sous `nom` — « journal.texte », « mot »,
 * « note.<module> » ; sans patient connu, rien n'est gardé et le champ se
 * comporte comme avant.
 *
 * `depart` est ce qui est déjà enregistré — la note d'un exercice, par
 * exemple. Un brouillon identique n'en est pas un, et n'est pas gardé.
 *
 * La clé est lue au montage : un écran qui change de sujet (un autre
 * exercice) doit être remonté, par sa `key`, comme il l'est déjà pour son
 * propre état.
 */
export function useBrouillon(
  nom: string,
  depart = '',
): readonly [string, (suite: string) => void, () => void] {
  const patientId = useMaybeAuth()?.context?.patient?.id ?? null
  const cle = patientId ? cleDeBrouillon(patientId, nom) : null

  const [texte, setTexte] = useState(() => (cle ? lireBrouillon(stockageDeLOnglet(), cle) : null) ?? depart)

  const poser = useCallback(
    (suite: string) => {
      setTexte(suite)
      if (cle) garderBrouillon(stockageDeLOnglet(), cle, suite, depart)
    },
    [cle, depart],
  )

  /** Le texte est enregistré : il n'y a plus de brouillon à rendre. */
  const oublier = useCallback(() => {
    if (cle) oublierBrouillon(stockageDeLOnglet(), cle)
  }, [cle])

  return [texte, poser, oublier] as const
}
