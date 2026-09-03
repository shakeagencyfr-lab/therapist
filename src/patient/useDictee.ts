import { useCallback, useEffect, useRef, useState } from 'react'
import { createTranscriber, isSpeechSupported, type Transcriber } from '@/services/speech'

/**
 * Dicter au lieu d'écrire.
 *
 * Le même moteur que la séance de la thérapeute (src/services/speech.ts),
 * réduit à ce dont un champ de texte a besoin : ce qui est reconnu s'ajoute à
 * la fin, et ce qui est en cours de reconnaissance s'affiche à part, en gris,
 * jusqu'à ce que le navigateur le valide.
 *
 * L'AUDIO QUITTE LE TÉLÉPHONE, et c'est la seule chose à savoir avant de
 * proposer ce bouton. Contrairement à ce que « API du navigateur » laisse
 * croire, Chrome envoie le son à un service de reconnaissance distant. Sur un
 * journal intime, ce n'est pas un détail de mise en œuvre : c'est une
 * information que la personne qui parle doit avoir avant d'appuyer, et
 * l'écran la donne. Le jour où la transcription se fera sous contrat, c'est
 * ce module qui changera, pas les écrans.
 *
 * Le micro s'arrête tout seul au démontage : un composant qui disparaît en
 * laissant l'écoute ouverte continue d'envoyer du son.
 */
/**
 * Verser un segment dicté dans un texte en prose.
 *
 * `appendSegment`, côté séance, met chaque segment sur SA LIGNE : c'est
 * juste pour une transcription, où le retour à la ligne est le seul indice
 * de tour de parole qui existe. Dans un journal, cela produirait un poème —
 * une ligne par phrase — là où quelqu'un dicte un paragraphe.
 *
 * Ici les segments se suivent donc séparés d'une espace, et les retours à la
 * ligne que la personne a tapés elle-même sont préservés.
 *
 * `suite` est vrai quand le navigateur renvoie la MÊME phrase, plus
 * complète : elle remplace alors la précédente au lieu de s'ajouter derrière.
 * Sans cette règle, « j'ai mal dormi » suivi de « j'ai mal dormi cette nuit »
 * s'écrirait deux fois.
 */
export function ajouterDicte(courant: string, segment: string, suite: boolean): string {
  const propre = segment.replace(/\s+/g, ' ').trim()
  if (!propre) return courant
  if (!courant) return propre

  if (suite) {
    // Ce qui suit la dernière coupure : c'est la phrase en cours d'écriture.
    const coupe = Math.max(courant.lastIndexOf('\n') + 1, 0)
    const debut = courant.slice(0, coupe)
    const derniere = courant.slice(coupe).trimStart()
    const marge = courant.slice(coupe).length - derniere.length
    if (propre.startsWith(derniere)) {
      return debut + courant.slice(coupe, coupe + marge) + propre
    }
    // Republication plus courte de ce qui est déjà écrit : rien à ajouter.
    if (derniere.startsWith(propre)) return courant
  }

  return /[\s\n]$/.test(courant) ? courant + propre : `${courant} ${propre}`
}

export interface Dictee {
  /** Le navigateur sait-il transcrire ? Chrome et Edge, pas Firefox ni Safari. */
  possible: boolean
  ecoute: boolean
  /** Ce que le navigateur entend, pas encore validé. */
  interim: string
  erreur: string
  basculer: () => void
  arreter: () => void
}

export function useDictee(
  valeur: string,
  onTexte: (suite: string) => void,
): Dictee {
  const [ecoute, setEcoute] = useState(false)
  const [interim, setInterim] = useState('')
  const [erreur, setErreur] = useState('')
  const transcripteur = useRef<Transcriber | null>(null)

  /* La valeur courante du champ, lue au moment où un segment arrive : sans
     cette référence, le rappel du transcripteur garderait la valeur qu'avait
     le champ au démarrage de l'écoute, et chaque phrase écraserait la
     précédente. */
  const courante = useRef(valeur)
  courante.current = valeur

  const arreter = useCallback(() => {
    transcripteur.current?.stop()
    transcripteur.current = null
    setEcoute(false)
    setInterim('')
  }, [])

  // Un composant démonté ne doit pas laisser le micro ouvert.
  useEffect(() => arreter, [arreter])

  const basculer = useCallback(() => {
    if (ecoute) {
      arreter()
      return
    }
    if (!isSpeechSupported()) {
      setErreur(
        "Ce navigateur ne sait pas écrire sous la dictée. Chrome le fait, sur Android comme sur ordinateur.",
      )
      return
    }
    const suivant = createTranscriber({
      onFinal: (texte, suite) => {
        const ecrit = ajouterDicte(courante.current, texte, suite)
        courante.current = ecrit
        onTexte(ecrit)
        setInterim('')
      },
      onInterim: setInterim,
      onError: (code) => {
        setErreur(
          code === 'not-allowed'
            ? "Le micro n'est pas autorisé. Autorisez-le pour ce site, puis réessayez."
            : code === 'no-speech'
              ? "Je n'ai rien entendu. Réessayez en parlant un peu plus près."
              : "La dictée s'est interrompue. Réessayez, ou écrivez à la main.",
        )
        arreter()
      },
    })
    if (!suivant || !suivant.start()) {
      setErreur("Le micro n'a pas pu démarrer ici. Vous pouvez écrire à la main.")
      return
    }
    transcripteur.current = suivant
    setErreur('')
    setEcoute(true)
  }, [arreter, ecoute, onTexte])

  return { possible: isSpeechSupported(), ecoute, interim, erreur, basculer, arreter }
}
