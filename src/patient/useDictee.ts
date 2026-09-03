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
 * `appendSegment`, côté séance, met chaque segment sur SA LIGNE, et compare
 * le nouveau segment à cette dernière ligne pour savoir s'il la prolonge.
 * En passant à la prose — une espace au lieu d'un retour à la ligne — j'ai
 * supprimé l'ancre : la « dernière ligne » devenait tout le texte accumulé,
 * plus rien ne correspondait, et CHAQUE REPUBLICATION S'AJOUTAIT. Le
 * navigateur renvoyant la même phrase de plus en plus complète, on relisait
 * « bonjour je ne me sens pas bien » huit fois de suite.
 *
 * On garde donc explicitement le DERNIER SEGMENT reçu, et c'est à lui qu'on
 * compare. Il ne dépend plus de la forme du texte, ni du drapeau `suite` du
 * navigateur — que trois moteurs interprètent de trois façons.
 *
 * Quatre cas, dans cet ordre :
 *   — le segment répète mot pour mot le précédent : on ne fait rien ;
 *   — il le prolonge : il prend sa place, à la fin du texte ;
 *   — il est plus court que lui : c'est une republication tronquée, rien ;
 *   — sinon c'est une phrase neuve : elle s'ajoute derrière une espace.
 */
export function ajouterDicte(
  courant: string,
  segment: string,
  precedent: string,
): { texte: string; segment: string } {
  const propre = segment.replace(/\s+/g, ' ').trim()
  if (!propre) return { texte: courant, segment: precedent }
  if (!courant) return { texte: propre, segment: propre }

  if (precedent) {
    // Répétition à l'identique, ou republication plus courte : rien à écrire.
    if (propre === precedent || precedent.startsWith(propre)) {
      return { texte: courant, segment: precedent }
    }
    /* La même phrase, plus complète : elle remplace la précédente là où elle
       se trouve — à la fin. On ne cherche qu'à la fin, pour ne pas réécrire
       une phrase identique prononcée plus tôt dans le texte. */
    if (propre.startsWith(precedent) && courant.endsWith(precedent)) {
      return { texte: courant.slice(0, courant.length - precedent.length) + propre, segment: propre }
    }
  }

  // Déjà écrit à la fin : le navigateur republie après une coupure.
  if (courant.endsWith(propre)) return { texte: courant, segment: propre }

  const texte = /\s$/.test(courant) ? courant + propre : `${courant} ${propre}`
  return { texte, segment: propre }
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

  /** Le dernier segment reçu : c'est à lui qu'on compare, pas au texte. */
  const dernier = useRef('')

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
      onFinal: (texte) => {
        const suite = ajouterDicte(courante.current, texte, dernier.current)
        dernier.current = suite.segment
        courante.current = suite.texte
        onTexte(suite.texte)
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
    dernier.current = ''
    setErreur('')
    setEcoute(true)
  }, [arreter, ecoute, onTexte])

  return { possible: isSpeechSupported(), ecoute, interim, erreur, basculer, arreter }
}
