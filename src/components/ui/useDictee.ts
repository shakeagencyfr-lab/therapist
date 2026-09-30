import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import {
  abonnerEcoute,
  createTranscriber,
  ecouteEnCours,
  isSpeechSupported,
  type Transcriber,
} from '@/services/speech'
import {
  DICTEE_IMPOSSIBLE,
  ajouterDicte,
  insererDicte,
  messageDictee,
  type PositionDictee,
} from '@/lib/dictee'

/**
 * Dicter au lieu d'écrire.
 *
 * Le même moteur que la séance de la thérapeute (src/services/speech.ts),
 * réduit à ce dont un champ de texte a besoin : ce qui est reconnu s'écrit
 * dans le champ, et ce qui est en cours de reconnaissance s'affiche à part,
 * en gris, jusqu'à ce que le navigateur le valide.
 *
 * L'AUDIO QUITTE L'APPAREIL, et c'est la seule chose à savoir avant de
 * proposer ce bouton. Contrairement à ce que « API du navigateur » laisse
 * croire, le son part chez l'éditeur du navigateur pour être transcrit :
 * Google pour Chrome, Microsoft pour Edge, Apple pour Safari. Sur un journal
 * intime comme sur une note clinique, ce n'est pas un détail de mise en
 * œuvre : c'est une information que la personne qui parle doit avoir avant
 * d'appuyer, et l'écran la donne. Le jour où la transcription se fera sous
 * contrat, c'est ce module qui changera, pas les écrans.
 *
 * Le micro s'arrête tout seul au démontage : un composant qui disparaît en
 * laissant l'écoute ouverte continue d'envoyer du son.
 */

export interface Dictee {
  /** Le navigateur sait-il transcrire ? Chrome, Edge et Safari ; pas Firefox. */
  possible: boolean
  ecoute: boolean
  /** Ce que le navigateur entend, pas encore validé. */
  interim: string
  erreur: string
  basculer: () => void
  arreter: () => void
}

/** Le texte à dire quand le navigateur relâche le micro sans prévenir. */
const RELANCE_REFUSEE = 'La dictée s’est arrêtée d’elle-même. Touchez le micro pour reprendre.'

/**
 * La dictée de l'espace patient : ce qui est dit s'ajoute à la fin du texte.
 *
 * Elle s'arrête au premier silence prolongé (« Je n'ai rien entendu ») : sur
 * un téléphone, chaque relance du micro sonne, et un micro oublié ouvert
 * sonnerait toutes les huit secondes.
 */
export function useDictee(valeur: string, onTexte: (suite: string) => void): Dictee {
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
      setErreur(DICTEE_IMPOSSIBLE)
      return
    }
    const suivant = createTranscriber(
      {
        onFinal: (texte) => {
          const suite = ajouterDicte(courante.current, texte, dernier.current)
          dernier.current = suite.segment
          courante.current = suite.texte
          onTexte(suite.texte)
          setInterim('')
        },
        onInterim: setInterim,
        onError: (code) => {
          setErreur(messageDictee(code))
          arreter()
        },
        // Le micro s'est refermé sans nous : l'écran cesse d'écouter.
        onFin: (raison) => {
          if (transcripteur.current !== suivant) return
          arreter()
          if (raison === 'relance') setErreur(RELANCE_REFUSEE)
        },
      },
      'champ',
    )
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

/* LA DICTÉE DANS UN CHAMP DE LA PRATICIENNE ---------------------------------
 *
 * Même moteur, autre contrat : le champ ne sait rien de la dictée. Il reçoit
 * ses changements par son onChange habituel — la valeur est posée par le
 * mutateur natif, puis un événement « input » part, exactement comme une
 * frappe. Chaque écran garde donc son code ; il ajoute `dictee` au champ. */

/** Ce que le bouton micro d'un champ a besoin de savoir pour s'afficher. */
export interface DicteeChamp {
  ecoute: boolean
  /** Ce que le navigateur entend, pas encore validé : jamais écrit dans le champ. */
  interim: string
  erreur: string
  /** La séance tient le micro : le bouton attend qu'elle le rende. */
  occupe: boolean
  /** La mention de confidentialité est à montrer (la première fois). */
  mention: boolean
  basculer: () => void
}

/** Sans une parole pendant ce temps, le micro se ferme de lui-même. */
const SILENCE_MAX_MS = 120_000

/**
 * Le délai avant de dire « la dictée a fini d'écrire ». Le navigateur livre
 * la dernière phrase APRÈS l'arrêt du micro : on l'attend un peu.
 */
const DELAI_FIN_MS = 1200

const CLE_MENTION = 'klaro.dictee.mentionVue'

/* Le stockage du navigateur peut être refusé (navigation privée, réglage
   strict) : la mention revient alors à chaque chargement, rien de plus. */
let mentionVueIci = false
function mentionDejaVue(): boolean {
  if (mentionVueIci) return true
  try {
    return window.localStorage.getItem(CLE_MENTION) === '1'
  } catch {
    return false
  }
}
function marquerMentionVue(): void {
  mentionVueIci = true
  try {
    window.localStorage.setItem(CLE_MENTION, '1')
  } catch {
    /* rien : voir plus haut */
  }
}

function micDeLaSeance(): boolean {
  return ecouteEnCours() === 'seance'
}

/**
 * Écrire dans un champ contrôlé par React comme le ferait une frappe.
 *
 * Poser `el.value` directement ne suffit pas : React garde la dernière
 * valeur qu'il a vue sur l'élément lui-même, conclut que rien n'a changé et
 * n'appelle pas onChange. Le mutateur du prototype passe à côté de ce
 * suivi ; l'événement « input » fait le reste.
 */
function poserValeur(el: HTMLInputElement | HTMLTextAreaElement, valeur: string): void {
  const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const mutateur = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (mutateur) mutateur.call(el, valeur)
  else el.value = valeur
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

interface OptionsDicteeChamp {
  /** Le champ accepte la dictée maintenant : ni désactivé, ni en lecture seule. */
  actif: boolean
  /** La valeur contrôlée du champ, pour voir l'application la réécrire. */
  valeur: unknown
  /**
   * Appelé quand la dictée a fini d'écrire. Pour les champs qui
   * n'enregistrent qu'à la sortie (onBlur) : le bouton garde le champ sous
   * le curseur, la sortie ne vient donc pas d'elle-même.
   */
  onFin?: () => void
  /**
   * Appelé quand une dictée commence dans ce champ (vrai), puis quand elle
   * est vraiment finie (faux) : le micro fermé ET les derniers mots dits
   * arrivés — ou jetés, par un abandon ou un démontage. Pour l'écran qui
   * doit savoir qu'une dictée tourne : une fenêtre qu'Échap fermerait au
   * lieu d'arrêter le micro, un envoi qui partirait sans les derniers mots.
   */
  onEnCours?: (enCours: boolean) => void
}

/**
 * La dictée d'un champ : elle écrit au curseur, sans jamais écrire le texte
 * provisoire, et s'arrête d'elle-même quand il le faut.
 *
 * Quand s'arrête-t-elle ?
 *   — au bouton, à Échap, quand l'onglet passe en arrière-plan, après deux
 *     minutes de silence : le micro se ferme, les derniers mots dits
 *     arrivent encore ;
 *   — au démontage, quand le champ se désactive, quand son formulaire part,
 *     quand l'application réécrit le champ (envoyé puis vidé, modèle choisi,
 *     brouillon régénéré) : le micro se ferme ET ce qui arriverait encore
 *     est jeté. Sans ce jeton de génération, la dernière phrase revenait
 *     remplir un champ que l'envoi venait de vider ;
 *   — quand un autre micro s'ouvre : il n'y en a qu'un à la fois.
 */
export function useDicteeChamp(
  ref: RefObject<HTMLInputElement | HTMLTextAreaElement>,
  { actif, valeur, onFin, onEnCours }: OptionsDicteeChamp,
): DicteeChamp {
  const [ecoute, setEcoute] = useState(false)
  const [interim, setInterim] = useState('')
  const [erreur, setErreur] = useState('')
  const [mention, setMention] = useState(false)
  const occupe = useSyncExternalStore(abonnerEcoute, micDeLaSeance, () => false)

  const transcripteur = useRef<Transcriber | null>(null)
  /** Chaque écoute, et chaque abandon, change de génération. */
  const generation = useRef(0)
  /** Où la dictée écrit, et la valeur qu'elle a laissée dans le champ. */
  const position = useRef<PositionDictee & { laissee: string }>({ ancre: 0, precedent: '', laissee: '' })
  /** La dictée a changé le texte depuis le dernier « fini ». */
  const modifie = useRef(false)
  /** Un événement « input » est passé depuis le dernier rendu. */
  const saisie = useRef(false)
  /** La dictée est en train de poser sa valeur (pour ne pas se prendre pour une frappe). */
  const enEcriture = useRef(false)
  const valeurVue = useRef(valeur)
  const minuterieFin = useRef<number | null>(null)
  const minuterieSilence = useRef<number | null>(null)
  const mentionMontree = useRef(false)
  const onFinCourant = useRef(onFin)
  onFinCourant.current = onFin
  const onEnCoursCourant = useRef(onEnCours)
  onEnCoursCourant.current = onEnCours
  /** Ce que l'écran sait : une dictée tourne-t-elle dans ce champ ? */
  const enCoursAnnonce = useRef(false)

  /** Dit à l'écran qu'une dictée commence, ou qu'elle est finie — une fois chaque. */
  const annoncerEnCours = useCallback((enCours: boolean) => {
    if (enCoursAnnonce.current === enCours) return
    enCoursAnnonce.current = enCours
    onEnCoursCourant.current?.(enCours)
  }, [])

  /** « La dictée a fini d'écrire » — une fois, et seulement si elle a écrit. */
  const annoncerFin = useCallback(() => {
    if (minuterieFin.current !== null) {
      window.clearTimeout(minuterieFin.current)
      minuterieFin.current = null
    }
    /* Toujours atteint après un arrêt — le délai des derniers mots, un
       abandon, un démontage : c'est ici que la dictée est vraiment finie,
       qu'elle ait écrit ou non. */
    annoncerEnCours(false)
    if (!modifie.current) return
    modifie.current = false
    onFinCourant.current?.()
  }, [annoncerEnCours])

  const programmerFin = useCallback(() => {
    if (minuterieFin.current !== null) window.clearTimeout(minuterieFin.current)
    minuterieFin.current = window.setTimeout(annoncerFin, DELAI_FIN_MS)
  }, [annoncerFin])

  const oublierSilence = useCallback(() => {
    if (minuterieSilence.current === null) return
    window.clearTimeout(minuterieSilence.current)
    minuterieSilence.current = null
  }, [])

  /** L'écran cesse d'écouter. Le transcripteur, lui, est déjà arrêté. */
  const repos = useCallback(() => {
    oublierSilence()
    setEcoute(false)
    setInterim('')
    if (mentionMontree.current) {
      mentionMontree.current = false
      marquerMentionVue()
    }
    setMention(false)
    programmerFin()
  }, [oublierSilence, programmerFin])

  /** Ferme le micro ; les derniers mots, déjà dits, peuvent encore arriver. */
  const arreter = useCallback(() => {
    const t = transcripteur.current
    transcripteur.current = null
    t?.stop()
    repos()
  }, [repos])

  /** Ferme le micro ET jette ce qui arriverait encore. */
  const abandonner = useCallback(() => {
    generation.current++
    if (transcripteur.current) arreter()
    annoncerFin()
  }, [annoncerFin, arreter])

  const guetterSilence = useCallback(() => {
    oublierSilence()
    minuterieSilence.current = window.setTimeout(() => {
      minuterieSilence.current = null
      if (!transcripteur.current) return
      arreter()
      setErreur('Micro fermé après deux minutes sans parole.')
    }, SILENCE_MAX_MS)
  }, [arreter, oublierSilence])

  /** Verse un segment validé dans le champ, s'il est encore de cette écoute. */
  const verser = useCallback(
    (gen: number, texte: string) => {
      if (gen !== generation.current) return
      const el = ref.current
      if (!el) return
      if (transcripteur.current) guetterSilence()

      let { ancre, precedent } = position.current
      if (el.value !== position.current.laissee) {
        // La personne a écrit pendant la dictée : on reprend à son curseur.
        ancre = document.activeElement === el ? (el.selectionEnd ?? el.value.length) : el.value.length
        precedent = ''
      }
      const r = insererDicte(el.value, { ancre, precedent }, texte, el.maxLength > 0 ? el.maxLength : undefined)
      if (r.valeur !== el.value) {
        enEcriture.current = true
        try {
          poserValeur(el, r.valeur)
        } finally {
          enEcriture.current = false
        }
        modifie.current = true
        if (document.activeElement === el) {
          try {
            el.setSelectionRange(r.ancre, r.ancre)
          } catch {
            // Certains types de champ n'ont pas de curseur : rien à placer.
          }
        }
      }
      position.current = { ancre: r.ancre, precedent: r.precedent, laissee: el.value }
      if (r.tronque) setErreur('Le champ est plein : la fin de la dictée n’a pas été écrite.')
      setInterim('')
      // Arrivé après l'arrêt : le « fini » attend encore un peu.
      if (!transcripteur.current) programmerFin()
    },
    [guetterSilence, programmerFin, ref],
  )

  const actifCourant = useRef(actif)
  actifCourant.current = actif

  const basculer = useCallback(() => {
    if (transcripteur.current) {
      arreter()
      return
    }
    const el = ref.current
    if (!el || !actifCourant.current) return
    // Ce qu'une dictée précédente a écrit est dit fini avant d'en ouvrir une autre.
    annoncerFin()
    setErreur('')
    const gen = ++generation.current
    const t = createTranscriber(
      {
        onFinal: (texte) => verser(gen, texte),
        onInterim: (texte) => {
          if (transcripteur.current !== t) return
          setInterim(texte)
          guetterSilence()
        },
        onError: (code) => {
          // Un silence : l'écoute reprend d'elle-même, rien à dire.
          if (code === 'no-speech' || transcripteur.current !== t) return
          setErreur(messageDictee(code))
          arreter()
        },
        onFin: (raison) => {
          if (transcripteur.current !== t) return
          transcripteur.current = null
          repos()
          if (raison === 'relance') setErreur(RELANCE_REFUSEE)
        },
      },
      'champ',
    )
    if (!t) {
      setErreur(DICTEE_IMPOSSIBLE)
      return
    }
    // La dictée écrit là où était le curseur ; sans curseur, à la fin.
    const ancre = document.activeElement === el ? (el.selectionEnd ?? el.value.length) : el.value.length
    position.current = { ancre, precedent: '', laissee: el.value }
    if (!t.start()) {
      setErreur(
        micDeLaSeance()
          ? 'Le micro sert à l’enregistrement de la séance : mettez-le en pause pour dicter ici.'
          : "Le micro n'a pas pu démarrer ici. Vous pouvez écrire à la main.",
      )
      return
    }
    transcripteur.current = t
    modifie.current = false
    annoncerEnCours(true)
    const montrer = !mentionDejaVue()
    mentionMontree.current = montrer
    setMention(montrer)
    setEcoute(true)
    guetterSilence()
  }, [annoncerEnCours, annoncerFin, arreter, guetterSilence, ref, repos, verser])

  // Le champ, ses frappes et son formulaire.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const surSaisie = () => {
      saisie.current = true
      // Une frappe efface le message d'hier ; l'écriture de la dictée, non.
      if (!enEcriture.current) setErreur('')
    }
    const formulaire = el.form
    el.addEventListener('input', surSaisie)
    // Le formulaire part avec ce qui est écrit : ce qui arriverait ensuite
    // tomberait dans un champ que l'envoi va vider.
    formulaire?.addEventListener('submit', abandonner)
    return () => {
      el.removeEventListener('input', surSaisie)
      formulaire?.removeEventListener('submit', abandonner)
    }
  }, [abandonner, ref])

  /* L'application a réécrit le champ — vidé après un envoi, rempli d'un
     modèle, brouillon régénéré — sans aucune frappe : ce que la dictée
     écrirait encore ne correspond plus à rien. */
  useLayoutEffect(() => {
    const change = !Object.is(valeurVue.current, valeur)
    valeurVue.current = valeur
    const parSaisie = saisie.current
    saisie.current = false
    if (change && !parSaisie) abandonner()
  })

  // Désactivé ou passé en lecture seule : le micro se ferme.
  useEffect(() => {
    if (!actif) abandonner()
  }, [actif, abandonner])

  // Échap, ou l'onglet qui passe en arrière-plan : le micro se ferme.
  useEffect(() => {
    if (!ecoute) return
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') arreter()
    }
    const surMasquage = () => {
      if (document.visibilityState === 'hidden') arreter()
    }
    window.addEventListener('keydown', surTouche)
    document.addEventListener('visibilitychange', surMasquage)
    return () => {
      window.removeEventListener('keydown', surTouche)
      document.removeEventListener('visibilitychange', surMasquage)
    }
  }, [arreter, ecoute])

  // Un composant démonté ne doit pas laisser le micro ouvert.
  useEffect(() => abandonner, [abandonner])

  return { ecoute, interim, erreur, occupe, mention, basculer }
}
