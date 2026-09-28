import { useCallback, useRef, useState } from 'react'
import { useMaybeCabinet } from '@/cabinet/context'
import {
  MOUVEMENTS_HYPNOSE,
  NOM_MOUVEMENT,
  buildPatientContext,
  genererHypnose,
  messageDEchec,
  pointDeReprise,
  type MouvementEcrit,
  type MouvementHypnose,
} from '@/services/aiClient'
import { corrigerTexte, rangDuMouvement } from '@/lib/texteHypnose'
import { useStore } from '@/state/store'
import type { Hypnose, PatientId, SessionDraft } from '@/types/domain'

/**
 * Ce qu'il faut garder d'une écriture pour la reprendre : à qui elle est
 * destinée, sur quelle matière, avec quelle intention, et où elle s'écrit.
 */
interface Chantier {
  patientId: PatientId
  brouillon: SessionDraft
  intention: string
  /** La séance dont l'hypnose naît ; nulle si elle part de la fiche. */
  sessionId: string | null
  /**
   * La ligne ouverte en base ; nulle sans cabinet réel (démonstration), ou
   * tant que son ouverture a échoué — une reprise la retente.
   */
  hypnoseId: string | null
}

/** Le rendu d'un geste d'écriture en base, comme ceux du cabinet. */
interface Resultat {
  ok: boolean
  message: string
}

/**
 * Écrire une hypnose, d'où qu'on la lance.
 *
 * Deux écrans en ont besoin — la note de séance, et la fiche du patient
 * quand on veut en refaire une. Le même code sert aux deux : la mécanique est
 * délicate (quatre appels, une ligne ouverte en base avant d'écrire, chaque
 * mouvement versé dès qu'il arrive) et la dupliquer, c'est se garantir que
 * les deux copies divergeront.
 *
 * DEUX PIÈGES Y SONT FERMÉS, tous deux constatés en production.
 *
 *   L'ÉCRITURE SE VOIT DÈS LE CLIC. Le drapeau était autrefois posé dans le
 *   rappel de progression, donc après le premier mouvement : trente secondes
 *   d'écran muet, un bouton resté cliquable, et la thérapeute qui reclique.
 *   Deux écritures en parallèle, deux hypnoses en base, les inductions
 *   empilées.
 *
 *   UN SECOND APPEL NE RELANCE RIEN tant que le premier tourne.
 *
 * ET UNE ÉCRITURE INTERROMPUE SE REPREND. Un échec au troisième mouvement
 * laissait les deux premiers en base — c'est ce que promet leur versement
 * au fil de l'eau — mais aucun geste ne permettait d'en repartir : l'écran
 * restait figé sur deux coches, sans bouton, et la seule issue était de
 * tout repayer. On reprend au premier mouvement manquant, les acquis
 * partant comme précédents, et l'on ferme quand on préfère abandonner.
 */
export interface EcritureHypnose {
  /** Un mouvement s'écrit en ce moment. */
  ecriture: boolean
  /** Son nom, pour l'annoncer. */
  enCours: string
  /** Les mouvements déjà rendus, dans l'ordre. */
  ecrits: MouvementEcrit[]
  erreur: string
  fini: boolean
  /**
   * Ce qui est écrit a-t-il vraiment rejoint la base ?
   *
   * Distincte de `fini` : le texte peut être entièrement écrit et n'exister
   * que dans cet onglet — sans cabinet réel, ou sur un refus d'écriture. Le
   * dire « conservé » dans ce cas le fait perdre au premier rechargement,
   * alors qu'il vient de coûter l'appel le plus cher du produit.
   *
   * Vrai quand chaque mouvement écrit a été versé et, si les quatre sont là,
   * quand l'hypnose a été refermée. Après un échec, elle dit donc si les
   * mouvements déjà écrits sont gardés.
   */
  conservee: boolean
  /**
   * Le mouvement où reprendre, après un échec ; null s'il n'y a rien à
   * reprendre (pas d'échec, ou écriture en cours).
   */
  aReprendre: MouvementHypnose | null
  /**
   * Les quatre mouvements sont écrits, mais la base ne les a pas tous reçus
   * (ou n'a pas refermé l'hypnose) : un nouvel essai d'enregistrement, sans
   * rien réécrire, a un sens. `reprendre` le fait.
   */
  aEnregistrer: boolean
  ecrire: (patientId: PatientId, brouillon: SessionDraft, intention: string) => Promise<void>
  /**
   * Reprendre l'écriture qui vient d'échouer, au premier mouvement manquant —
   * ou, les quatre écrits, réessayer de les enregistrer.
   */
  reprendre: () => Promise<void>
  /**
   * Reprendre une hypnose interrompue retrouvée en base — après un
   * rechargement, l'écriture en mémoire est perdue, pas ce qu'elle a versé.
   */
  reprendreHypnose: (patientId: PatientId, brouillon: SessionDraft, hypnose: Hypnose) => Promise<void>
  /**
   * Corriger le texte d'un mouvement déjà écrit. La praticienne le lit à
   * voix haute : une tournure qui ne passe pas dans sa bouche doit pouvoir
   * se reprendre avant la séance, pas se contourner en la lisant.
   */
  corriger: (mouvement: MouvementHypnose, texte: string) => Promise<Resultat>
  /**
   * Repartir d'un écran vierge, sans toucher à ce qui est en base. Une
   * hypnose interrompue y reste : le dossier est relu pour que la fiche la
   * montre, reprenable.
   */
  reinitialiser: () => void
}

export function useEcritureHypnose(): EcritureHypnose {
  const { read } = useStore()
  const cabinet = useMaybeCabinet()

  const [ecriture, setEcriture] = useState(false)
  const [enCours, setEnCours] = useState('')
  const [ecrits, setEcrits] = useState<MouvementEcrit[]>([])
  const [erreur, setErreur] = useState('')
  const [fini, setFini] = useState(false)
  const [conservee, setConservee] = useState(true)

  /* CE QUE LES RAPPELS ASYNCHRONES LISENT VIT DANS DES RÉFÉRENCES. Une
     écriture dure deux minutes : l'état React qu'elle aurait capturé serait
     celui du rendu où elle a commencé, et une reprise repartirait de là. */
  const chantier = useRef<Chantier | null>(null)
  /** Les mouvements écrits, dans l'ordre, depuis l'induction. */
  const acquis = useRef<MouvementEcrit[]>([])
  /** Ceux que la base a reçus. */
  const versees = useRef(new Set<MouvementHypnose>())
  /** L'hypnose est refermée en base (les quatre y sont). */
  const achevee = useRef(false)
  /**
   * Le verrou. L'état `ecriture` ne suffit pas : deux clics dans la même
   * image voient tous deux l'ancien rendu, et lanceraient deux écritures.
   */
  const enVol = useRef(false)

  const poser = useCallback((liste: MouvementEcrit[]) => {
    acquis.current = liste
    setEcrits(liste)
  }, [])

  /** Tout ce qui est écrit est-il en base — et l'hypnose refermée si elle est finie ? */
  const estConservee = useCallback((): boolean => {
    const ch = chantier.current
    if (!ch?.hypnoseId) return false
    const tousVerses = acquis.current.every((e) => versees.current.has(e.mouvement))
    const complete = acquis.current.length === MOUVEMENTS_HYPNOSE.length
    return tousVerses && (!complete || achevee.current)
  }, [])

  /** Verse un mouvement, et retient s'il l'a été : c'est ce que `conservee` dit. */
  const verser = useCallback(
    async (ch: Chantier, ecrit: MouvementEcrit): Promise<boolean> => {
      if (!ch.hypnoseId || !cabinet?.reel) return false
      const r = await cabinet.ajouterMouvement(ch.hypnoseId, ecrit, rangDuMouvement(ecrit.mouvement))
      if (r.ok) versees.current.add(ecrit.mouvement)
      return r.ok
    },
    [cabinet],
  )

  /**
   * Le déroulé commun à l'écriture, à la reprise et au nouvel essai
   * d'enregistrement : ouvrir la ligne si elle ne l'est pas, reverser ce qui
   * est écrit et que la base n'a pas reçu, écrire ce qui manque, refermer.
   *
   * LES ACQUIS NE SE RÉÉCRIVENT PAS : ils ont été payés, et ils partent comme
   * précédents du premier mouvement manquant, pour que la suite reprenne les
   * images déjà posées (voir `pointDeReprise`).
   */
  const derouler = useCallback(
    async (ch: Chantier, deja: readonly MouvementEcrit[]) => {
      if (enVol.current) return
      enVol.current = true
      const { acquis: base, restants } = pointDeReprise(deja)
      // L'écriture se voit dès le clic, avant même l'ouverture de la ligne.
      setEcriture(true)
      setErreur('')
      setFini(false)
      achevee.current = false
      poser(base)
      setEnCours(restants[0] ? NOM_MOUVEMENT[restants[0]] : '')

      try {
        /* L'hypnose s'ouvre en base AVANT d'être écrite : chaque mouvement y
           est versé dès qu'il arrive, et rien n'est perdu si l'un d'eux
           échoue. Une ouverture refusée se retente à la reprise. */
        if (!ch.hypnoseId && cabinet?.reel) {
          ch.hypnoseId = await cabinet.creerHypnose(ch.patientId, ch.sessionId, ch.intention)
        }
        for (const ecrit of base) {
          if (!versees.current.has(ecrit.mouvement)) await verser(ch, ecrit)
        }
        setConservee(estConservee())

        const tous = await genererHypnose(
          {
            context: buildPatientContext(read(), ch.patientId),
            mots: ch.brouillon.mots ?? [],
            themes: ch.brouillon.themes ?? [],
            synthese: ch.brouillon.synthese ?? '',
            intention: ch.intention,
          },
          async (ecrit, rang) => {
            poser([...acquis.current, ecrit])
            // Le mouvement SUIVANT, celui qui commence à s'écrire.
            const suivant = MOUVEMENTS_HYPNOSE[rang]
            setEnCours(suivant ? NOM_MOUVEMENT[suivant] : '')
            await verser(ch, ecrit)
            setConservee(estConservee())
          },
          base,
        )

        /* On ne referme que ce qui est entier en base : une hypnose marquée
           complète avec trois mouvements sur quatre se lirait, et s'imprimerait,
           comme si la séance s'arrêtait au milieu. */
        if (ch.hypnoseId && cabinet?.reel && tous.every((e) => versees.current.has(e.mouvement))) {
          const prenom = read().patients[ch.patientId]?.name.split(' ')[0] ?? 'votre patient'
          // Le titre de la séance est celui de son induction : c'est la
          // métaphore qui la porte d'un bout à l'autre.
          const r = await cabinet.acheverHypnose(ch.hypnoseId, tous[0]?.titre || `Séance pour ${prenom}`)
          achevee.current = r.ok
        }
        setConservee(estConservee())
        setFini(true)
      } catch (err) {
        /* Le message du serveur, tel quel : il dit la cause et le remède
           (clé manquante, service saturé). Le remplacer par « Réessayez »
           renvoyait en boucle une praticienne dont la clé manque. */
        setErreur(messageDEchec(err, "L'hypnose n'a pas pu être écrite."))
        setConservee(estConservee())
      } finally {
        setEnCours('')
        setEcriture(false)
        enVol.current = false
      }
    },
    [cabinet, estConservee, poser, read, verser],
  )

  const ecrire = useCallback(
    async (patientId: PatientId, brouillon: SessionDraft, intention: string) => {
      if (enVol.current) return
      const now = read()
      /* La séance d'où l'hypnose naît — SI c'est celle de cette fiche. La
         séance en mémoire n'est pas effacée en changeant de fiche : lancée
         depuis la fiche d'un autre patient, l'hypnose se rattachait à une
         séance qui n'était pas la sienne. */
      const sessionId = now.sessionPatient === patientId ? now.sessionId : null
      chantier.current = { patientId, brouillon, intention: intention.trim(), sessionId, hypnoseId: null }
      versees.current = new Set()
      setConservee(true)
      await derouler(chantier.current, [])
    },
    [derouler, read],
  )

  const reprendre = useCallback(async () => {
    const ch = chantier.current
    if (!ch) return
    await derouler(ch, acquis.current)
  }, [derouler])

  /* Après un rechargement, l'écriture en mémoire est perdue ; ce qu'elle a
     versé ne l'est pas. On repart de la ligne en base et de ses mouvements.
     La matière est le dernier brouillon de la fiche — celui dont l'hypnose
     est née, sauf si une séance a été analysée depuis : les mouvements déjà
     écrits, passés en précédents, gardent alors le fil. */
  const reprendreHypnose = useCallback(
    async (patientId: PatientId, brouillon: SessionDraft, hypnose: Hypnose) => {
      if (enVol.current) return
      const deja: MouvementEcrit[] = hypnose.mouvements.map((m) => ({
        mouvement: m.mouvement,
        titre: m.titre,
        texte: m.texte,
      }))
      chantier.current = {
        patientId,
        brouillon,
        intention: hypnose.intention,
        sessionId: null,
        hypnoseId: hypnose.id,
      }
      versees.current = new Set(deja.map((e) => e.mouvement))
      await derouler(chantier.current, deja)
    },
    [derouler],
  )

  const corriger = useCallback(
    async (mouvement: MouvementHypnose, texte: string): Promise<Resultat> => {
      // Un mouvement écrit sert de précédent au suivant : on ne le change
      // pas sous les pieds d'une écriture en cours.
      if (enVol.current) {
        return { ok: false, message: "Attendez la fin de l'écriture pour corriger un mouvement." }
      }
      const correction = corrigerTexte(texte)
      if (!correction.ok) return correction
      const avant = acquis.current.find((e) => e.mouvement === mouvement)
      if (!avant) return { ok: false, message: "Ce mouvement n'est pas encore écrit." }
      const corrige: MouvementEcrit = { ...avant, texte: correction.texte }

      const ch = chantier.current
      if (ch?.hypnoseId && cabinet?.reel) {
        const r = await cabinet.ajouterMouvement(ch.hypnoseId, corrige, rangDuMouvement(mouvement))
        if (!r.ok) {
          return {
            ok: false,
            message: "La correction n'a pas pu être enregistrée : le dossier garde le texte d'avant.",
          }
        }
        versees.current.add(mouvement)
        // Refermée, l'hypnose est déjà sur la fiche : elle doit y lire le
        // texte corrigé, et le PDF avec elle.
        if (achevee.current) await cabinet.recharger()
      }
      poser(acquis.current.map((e) => (e.mouvement === mouvement ? corrige : e)))
      setConservee(estConservee())
      return { ok: true, message: '' }
    },
    [cabinet, estConservee, poser],
  )

  const reinitialiser = useCallback(() => {
    if (enVol.current) return
    const interrompue = !!chantier.current?.hypnoseId && !achevee.current
    chantier.current = null
    versees.current = new Set()
    achevee.current = false
    poser([])
    setErreur('')
    setFini(false)
    setConservee(true)
    setEnCours('')
    /* La ligne ouverte n'est pas refermée et reste en base. La fiche ne
       relit son dossier qu'au retour sur l'onglet : sans cette relecture,
       l'hypnose interrompue n'y apparaissait pas, et l'on ne pouvait ni la
       reprendre ni l'effacer. */
    if (interrompue && cabinet?.reel) void cabinet.recharger()
  }, [cabinet, poser])

  const aReprendre = !ecriture && erreur ? (pointDeReprise(ecrits).restants[0] ?? null) : null
  const aEnregistrer = !ecriture && fini && !conservee && !!cabinet?.reel

  return {
    ecriture,
    enCours,
    ecrits,
    erreur,
    fini,
    conservee,
    aReprendre,
    aEnregistrer,
    ecrire,
    reprendre,
    reprendreHypnose,
    corriger,
    reinitialiser,
  }
}
