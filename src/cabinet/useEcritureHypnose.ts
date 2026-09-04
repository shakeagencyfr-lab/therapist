import { useCallback, useState } from 'react'
import { useMaybeCabinet } from '@/cabinet/context'
import {
  AiError,
  MOUVEMENTS_HYPNOSE,
  NOM_MOUVEMENT,
  buildPatientContext,
  genererHypnose,
  type MouvementEcrit,
} from '@/services/aiClient'
import { useStore } from '@/state/store'
import type { PatientId, SessionDraft } from '@/types/domain'

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
   * L'hypnose a-t-elle vraiment rejoint la base ?
   *
   * Distincte de `fini` : le texte peut être entièrement écrit et n'exister
   * que dans cet onglet — sans cabinet réel, ou sur un refus d'écriture. Le
   * dire « conservé » dans ce cas le fait perdre au premier rechargement,
   * alors qu'il vient de coûter l'appel le plus cher du produit.
   */
  conservee: boolean
  ecrire: (patientId: PatientId, brouillon: SessionDraft, intention: string) => Promise<void>
  /** Repartir d'un écran vierge, sans toucher à ce qui est en base. */
  reinitialiser: () => void
}

export function useEcritureHypnose(): EcritureHypnose {
  const { state, read } = useStore()
  const cabinet = useMaybeCabinet()

  const [ecriture, setEcriture] = useState(false)
  const [enCours, setEnCours] = useState('')
  const [ecrits, setEcrits] = useState<MouvementEcrit[]>([])
  const [erreur, setErreur] = useState('')
  const [fini, setFini] = useState(false)
  /** L'hypnose a-t-elle vraiment rejoint la base ? */
  const [conservee, setConservee] = useState(true)

  const reinitialiser = useCallback(() => {
    setEcrits([])
    setErreur('')
    setFini(false)
    setConservee(true)
    setEnCours('')
  }, [])

  const ecrire = useCallback(
    async (patientId: PatientId, brouillon: SessionDraft, intention: string) => {
      if (ecriture) return
      setEcriture(true)
      setEnCours(NOM_MOUVEMENT[MOUVEMENTS_HYPNOSE[0]])
      setErreur('')
      setFini(false)
      setEcrits([])
      setConservee(true)

      const prenom = read().patients[patientId]?.name.split(' ')[0] ?? 'votre patient'

      // L'hypnose s'ouvre en base AVANT d'être écrite : chaque mouvement y est
      // versé dès qu'il arrive, et rien n'est perdu si l'un d'eux échoue.
      const hypnoseId = cabinet?.reel
        ? await cabinet.creerHypnose(patientId, state.sessionId || null, intention.trim())
        : null

      try {
        const tous = await genererHypnose(
          {
            context: buildPatientContext(read(), patientId),
            mots: brouillon.mots ?? [],
            themes: brouillon.themes ?? [],
            synthese: brouillon.synthese ?? '',
            intention: intention.trim(),
          },
          async (ecrit, rang) => {
            setEcrits((prev) => [...prev, ecrit])
            // Le mouvement SUIVANT, celui qui commence à s'écrire.
            const suivant = MOUVEMENTS_HYPNOSE[rang]
            setEnCours(suivant ? NOM_MOUVEMENT[suivant] : '')
            /* Chaque mouvement est versé dès qu'il arrive — et l'on RETIENT
               si le versement a eu lieu. Sans hypnoseId, ou sur un refus de
               la base, le texte n'existe que dans cet onglet : l'annoncer
               « conservé » le fait perdre au premier rechargement. */
            if (!hypnoseId) {
              setConservee(false)
            } else {
              const versee = await cabinet?.ajouterMouvement(hypnoseId, ecrit, rang)
              if (!versee?.ok) setConservee(false)
            }
          },
        )
        if (hypnoseId) {
          // Le titre de la séance est celui de son induction : c'est la
          // métaphore qui la porte d'un bout à l'autre.
          const achevee = await cabinet?.acheverHypnose(
            hypnoseId,
            tous[0]?.titre || `Séance pour ${prenom}`,
          )
          if (!achevee?.ok) setConservee(false)
        }
        setFini(true)
      } catch (err) {
        setErreur(err instanceof AiError ? err.message : "L'hypnose n'a pas pu être écrite.")
      } finally {
        setEnCours('')
        setEcriture(false)
      }
    },
    [cabinet, ecriture, read, state.sessionId],
  )

  return { ecriture, enCours, ecrits, erreur, fini, conservee, ecrire, reinitialiser }
}
