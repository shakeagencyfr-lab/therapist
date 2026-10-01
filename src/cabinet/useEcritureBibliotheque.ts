import { useCallback, useRef, useState } from 'react'
import {
  AiError,
  MOUVEMENTS_HYPNOSE,
  NOM_MOUVEMENT,
  genererHypnose,
  messageDEchec,
  pointDeReprise,
  type MouvementEcrit,
  type MouvementHypnose,
} from '@/services/aiClient'
import { refusIntention, titreDeLaBibliotheque, titreLibreDe } from '@/lib/bibliothequeHypnoses'
import type { HypnoseDeBibliotheque } from '@/types/domain'
import type { GestesBibliothequeHypnoses } from './bibliothequeHypnoses'

/** Ce qu'il faut garder d'une écriture d'atelier pour la reprendre. */
interface Chantier {
  intention: string
  /** Le titre donné par la praticienne ; vide : celui de l'induction. */
  titreLibre: string
  /** La ligne ouverte dans la bibliothèque ; nulle tant que son ouverture a échoué. */
  id: string | null
}

/**
 * Écrire une hypnose pour la bibliothèque du cabinet, depuis l'atelier (0071).
 *
 * LE PENDANT DE useEcritureHypnose, SANS PATIENT. La mécanique est la même et
 * ses deux pièges y sont fermés de la même façon : l'écriture se voit dès le
 * clic, et un second clic ne relance rien tant que la première tourne. Une
 * écriture interrompue se reprend au premier mouvement manquant, les acquis
 * partant comme précédents ; et une ligne restée interrompue dans la liste se
 * reprend depuis la base, après un rechargement.
 *
 * Ce qui change : la ligne s'ouvre dans la bibliothèque, pas sur une fiche ;
 * les mouvements y sont versés d'un bloc — la colonne `mouvements` entière à
 * chaque mouvement écrit —, et le serveur ne reçoit AUCUN dossier : c'est un
 * script général, porté par la seule intention. Pas de retouche par l'IA
 * ici : elle relit le dossier d'un patient, et il n'y en a pas.
 *
 * L'identifiant de la ligne part avec chaque mouvement : en mode jetons, il
 * relie les quatre appels, et l'hypnose se paie une fois (0068).
 */
export interface EcritureBibliotheque {
  ecriture: boolean
  enCours: string
  ecrits: MouvementEcrit[]
  erreur: string
  /** Le statut HTTP de l'échec : 402, les jetons manquent ; 403, l'option est fermée. */
  statut: number | null
  fini: boolean
  /** Tout ce qui est écrit est dans la bibliothèque — et refermé, si les quatre y sont. */
  conservee: boolean
  /** La ligne en cours d'écriture : la liste la montre « en cours », sans ses gestes. */
  ligne: string | null
  aReprendre: MouvementHypnose | null
  aEnregistrer: boolean
  ecrire: (intention: string, titre: string) => Promise<void>
  reprendre: () => Promise<void>
  /** Reprendre une ligne d'atelier restée interrompue dans la bibliothèque. */
  reprendreLigne: (h: HypnoseDeBibliotheque) => Promise<void>
  reinitialiser: () => void
}

/**
 * `gestes` : null en démonstration — rien ne s'écrit, et l'écran le dit.
 * `apres` : relire la bibliothèque, pour que la ligne y paraisse ou s'y mette à jour.
 */
export function useEcritureBibliotheque(
  gestes: GestesBibliothequeHypnoses | null,
  apres: () => Promise<void> | void,
): EcritureBibliotheque {
  const [ecriture, setEcriture] = useState(false)
  const [enCours, setEnCours] = useState('')
  const [ecrits, setEcrits] = useState<MouvementEcrit[]>([])
  const [erreur, setErreur] = useState('')
  const [statut, setStatut] = useState<number | null>(null)
  const [fini, setFini] = useState(false)
  const [conservee, setConservee] = useState(true)
  const [ligne, setLigne] = useState<string | null>(null)

  /* Ce que les rappels asynchrones lisent vit dans des références : une
     écriture dure deux minutes, et l'état du rendu où elle a commencé serait
     périmé à son retour. */
  const chantier = useRef<Chantier | null>(null)
  const acquis = useRef<MouvementEcrit[]>([])
  /** Combien de mouvements, depuis l'induction, la bibliothèque a reçus. */
  const verses = useRef(0)
  const achevee = useRef(false)
  /** Le verrou : deux clics dans la même image voient tous deux l'ancien rendu. */
  const enVol = useRef(false)

  const poser = useCallback((liste: MouvementEcrit[]) => {
    acquis.current = liste
    setEcrits(liste)
  }, [])

  const estConservee = useCallback((): boolean => {
    if (!chantier.current?.id) return false
    const tous = verses.current >= acquis.current.length
    const complete = acquis.current.length === MOUVEMENTS_HYPNOSE.length
    return tous && (!complete || achevee.current)
  }, [])

  /** Verse ce qui est écrit, d'un bloc ; retient jusqu'où la base l'a reçu. */
  const verser = useCallback(
    async (ch: Chantier, liste: MouvementEcrit[]): Promise<void> => {
      if (!ch.id || !gestes) return
      const r = await gestes.verser(ch.id, liste)
      if (r.ok) verses.current = liste.length
    },
    [gestes],
  )

  const derouler = useCallback(
    async (ch: Chantier, deja: readonly MouvementEcrit[]) => {
      if (enVol.current || !gestes) return
      enVol.current = true
      const { acquis: base, restants } = pointDeReprise(deja)
      setEcriture(true)
      setErreur('')
      setStatut(null)
      setFini(false)
      achevee.current = false
      poser(base)
      setEnCours(restants[0] ? NOM_MOUVEMENT[restants[0]] : '')

      try {
        /* La ligne s'ouvre AVANT d'être écrite : chaque mouvement y est versé
           dès qu'il arrive, et son identifiant fait payer l'hypnose une fois.
           Sans elle, on n'écrit rien — un texte qui n'irait nulle part, et
           que le mode jetons refuserait de toute façon. */
        if (!ch.id) {
          ch.id = await gestes.ouvrir(ch.intention, ch.titreLibre)
          setLigne(ch.id)
        }
        if (!ch.id) {
          setErreur("La bibliothèque n'a pas pu ouvrir cette hypnose : rien n'a été écrit, ni décompté. Réessayez.")
          return
        }
        if (verses.current < base.length) await verser(ch, base)
        setConservee(estConservee())

        const tous = await genererHypnose(
          {
            // Personne en particulier : ni dossier, ni mots, ni synthèse.
            context: null,
            mots: [],
            themes: [],
            synthese: '',
            intention: ch.intention,
            hypnoseId: ch.id,
          },
          async (ecrit, rang) => {
            poser([...acquis.current, ecrit])
            const suivant = MOUVEMENTS_HYPNOSE[rang]
            setEnCours(suivant ? NOM_MOUVEMENT[suivant] : '')
            await verser(ch, acquis.current)
            setConservee(estConservee())
          },
          base,
        )

        /* On referme d'un seul geste : les quatre mouvements, le titre, et
           « entière ». Un versement manqué en route est rattrapé ici. */
        const r = await gestes.achever(ch.id, titreDeLaBibliotheque(ch.titreLibre, tous), tous)
        if (r.ok) verses.current = tous.length
        achevee.current = r.ok
        setConservee(estConservee())
        setFini(true)
      } catch (err) {
        setErreur(messageDEchec(err, "L'hypnose n'a pas pu être écrite."))
        setStatut(err instanceof AiError ? err.status : null)
        setConservee(estConservee())
      } finally {
        setEnCours('')
        setEcriture(false)
        enVol.current = false
        // La ligne paraît dans la liste, entière ou interrompue.
        void apres()
      }
    },
    [apres, estConservee, gestes, poser, verser],
  )

  const ecrire = useCallback(
    async (intention: string, titre: string) => {
      /* Une intention trop courte ne part pas : l'écran le dit sous le
         champ (refusIntention), avant tout appel et sans rien ouvrir. */
      if (enVol.current || refusIntention(intention)) return
      chantier.current = { intention: intention.trim(), titreLibre: titre.trim(), id: null }
      verses.current = 0
      setLigne(null)
      setConservee(true)
      await derouler(chantier.current, [])
    },
    [derouler],
  )

  const reprendre = useCallback(async () => {
    const ch = chantier.current
    if (!ch) return
    await derouler(ch, acquis.current)
  }, [derouler])

  const reprendreLigne = useCallback(
    async (h: HypnoseDeBibliotheque) => {
      if (enVol.current) return
      const deja: MouvementEcrit[] = h.mouvements.map((m) => ({ mouvement: m.mouvement, titre: m.titre, texte: m.texte }))
      chantier.current = { intention: h.intention, titreLibre: titreLibreDe(h), id: h.id }
      verses.current = deja.length
      setLigne(h.id)
      await derouler(chantier.current, deja)
    },
    [derouler],
  )

  const reinitialiser = useCallback(() => {
    if (enVol.current) return
    chantier.current = null
    verses.current = 0
    achevee.current = false
    poser([])
    setErreur('')
    setStatut(null)
    setFini(false)
    setConservee(true)
    setEnCours('')
    setLigne(null)
  }, [poser])

  const aReprendre = !ecriture && erreur && chantier.current ? (pointDeReprise(ecrits).restants[0] ?? null) : null
  const aEnregistrer = !ecriture && fini && !conservee && !!gestes

  return {
    ecriture,
    enCours,
    ecrits,
    erreur,
    statut,
    fini,
    conservee,
    ligne,
    aReprendre,
    aEnregistrer,
    ecrire,
    reprendre,
    reprendreLigne,
    reinitialiser,
  }
}
