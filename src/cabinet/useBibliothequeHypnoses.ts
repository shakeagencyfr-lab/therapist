import { useCallback, useEffect, useRef, useState } from 'react'
import { useMaybeCabinet } from '@/cabinet/context'
import { BIBLIOTHEQUE_HYPNOSES_DEMO } from '@/data/bibliothequeHypnoses'
import { poserMouvement } from '@/lib/bibliothequeHypnoses'
import { corrigerTexte } from '@/lib/texteHypnose'
import { useRetour } from '@/lib/useRetour'
import type { HypnoseDeBibliotheque, HypnoseMouvement, PatientId } from '@/types/domain'
import type { GestesBibliothequeHypnoses } from './bibliothequeHypnoses'

/**
 * La bibliothèque d'hypnoses du cabinet (0071), pour l'onglet « Hypnoses » de
 * l'atelier.
 *
 *   demo          aucun cabinet réel (démonstration, banc de rendu) : une
 *                 petite bibliothèque d'exemple se lit, se télécharge, et
 *                 rien ne s'y écrit — chaque geste dit pourquoi ;
 *   chargement    la lecture est partie ;
 *   pret          la liste est là — vide ou pas ;
 *   echec         la lecture a échoué : ce n'est pas « aucune hypnose » ;
 *   indisponible  la base n'a pas encore 0071.
 */
export type EtatBibliotheque = 'demo' | 'chargement' | 'pret' | 'echec' | 'indisponible'

interface Resultat {
  ok: boolean
  message: string
}

/** Ce que la démonstration répond à chaque geste qui écrirait. */
export const EN_DEMONSTRATION = {
  ecrire:
    "En démonstration, aucune hypnose ne s'écrit : dans votre cabinet, elle rejoindrait cette bibliothèque, prête à être relue et attribuée.",
  corriger: 'En démonstration, aucune correction ne s’enregistre.',
  attribuer:
    "En démonstration, aucune hypnose ne s'attribue : dans votre cabinet, elle rejoindrait la fiche des patients cochés, avec ses quatre mouvements.",
  supprimer: "En démonstration, la bibliothèque ne se modifie pas : rien n'a été retiré.",
} as const

export interface BibliothequeData {
  etat: EtatBibliotheque
  liste: HypnoseDeBibliotheque[]
  /** Les gestes en base — null en démonstration. L'écriture s'en sert. */
  gestes: GestesBibliothequeHypnoses | null
  recharger: () => Promise<void>
  corrigerMouvement: (h: HypnoseDeBibliotheque, m: HypnoseMouvement, texte: string) => Promise<Resultat>
  renommer: (h: HypnoseDeBibliotheque, titre: string) => Promise<Resultat>
  supprimer: (h: HypnoseDeBibliotheque) => Promise<Resultat>
  attribuer: (h: HypnoseDeBibliotheque, patientIds: PatientId[]) => Promise<Resultat>
}

/**
 * `actif` à faux, rien ne se lit : l'onglet des modules n'en a pas besoin, et
 * un cabinet sans l'option ne voit pas l'onglet.
 */
export function useBibliothequeHypnoses(actif = true): BibliothequeData {
  const cabinet = useMaybeCabinet()
  /* LA DÉMONSTRATION, C'EST L'ABSENCE DE CABINET — pas un cabinet qui se
     charge. Un vrai cabinet a toujours son fournisseur (src/Root.tsx) ; tant
     que son dossier n'est pas lu, la bibliothèque attend. Prendre « pas
     encore réel » pour la démonstration montrerait les hypnoses d'exemple, le
     temps d'un chargement, dans le cabinet d'une vraie praticienne. */
  const demo = cabinet === null
  const gestes: GestesBibliothequeHypnoses | null = cabinet?.reel ? (cabinet.bibliothequeHypnoses ?? null) : null
  const [etat, setEtat] = useState<EtatBibliotheque>(demo ? 'demo' : 'chargement')
  const [liste, setListe] = useState<HypnoseDeBibliotheque[]>(demo ? BIBLIOTHEQUE_HYPNOSES_DEMO : [])
  // Une lecture en retard ne remplace pas une lecture plus récente.
  const derniere = useRef(0)
  const enAttente = cabinet?.erreur
    ? 'Le dossier du cabinet n’a pas pu être chargé : la bibliothèque non plus. Rechargez la page.'
    : 'Le dossier du cabinet se charge encore : réessayez dans un instant.'
  const pasEncore = useCallback(
    (enDemo: string): Resultat => ({ ok: false, message: demo ? enDemo : enAttente }),
    [demo, enAttente],
  )

  const recharger = useCallback(async () => {
    if (demo) {
      setEtat('demo')
      setListe(BIBLIOTHEQUE_HYPNOSES_DEMO)
      return
    }
    if (!gestes) {
      setEtat(cabinet?.erreur ? 'echec' : 'chargement')
      return
    }
    const numero = ++derniere.current
    const lu = await gestes.lire()
    if (numero !== derniere.current) return
    if (lu === 'indisponible') {
      setEtat('indisponible')
      return
    }
    if (!lu) {
      // Illisible : on garde ce qu'on montrait, et l'on dit que ce n'est plus sûr.
      setEtat('echec')
      return
    }
    setListe(lu)
    setEtat('pret')
  }, [cabinet?.erreur, demo, gestes])

  useEffect(() => {
    if (!actif) return
    void recharger()
  }, [recharger, actif])

  // Une consœur du cabinet écrit ou attribue pendant que l'onglet est ouvert.
  const relire = useCallback(() => {
    if (actif && gestes) void recharger()
  }, [actif, gestes, recharger])
  useRetour(relire)

  const corrigerMouvement = useCallback(
    async (h: HypnoseDeBibliotheque, m: HypnoseMouvement, texte: string): Promise<Resultat> => {
      if (!gestes) return pasEncore(EN_DEMONSTRATION.corriger)
      const correction = corrigerTexte(texte)
      if (!correction.ok) return correction
      /* La copie de la bibliothèque, seule : les patients qui l'ont déjà
         reçue gardent la leur, telle qu'elle leur a été attribuée. */
      const r = await gestes.verser(h.id, poserMouvement(h.mouvements, { ...m, texte: correction.texte }))
      if (!r.ok) {
        return { ok: false, message: "La correction n'a pas pu être enregistrée : la bibliothèque garde le texte d'avant." }
      }
      await recharger()
      return { ok: true, message: '' }
    },
    [gestes, pasEncore, recharger],
  )

  const renommer = useCallback(
    async (h: HypnoseDeBibliotheque, titre: string): Promise<Resultat> => {
      if (!gestes) return pasEncore(EN_DEMONSTRATION.corriger)
      const r = await gestes.renommer(h.id, titre)
      if (r.ok) await recharger()
      return r
    },
    [gestes, pasEncore, recharger],
  )

  const supprimer = useCallback(
    async (h: HypnoseDeBibliotheque): Promise<Resultat> => {
      if (!gestes) return pasEncore(EN_DEMONSTRATION.supprimer)
      const r = await gestes.supprimer(h.id)
      if (r.ok) {
        await recharger()
        return { ok: true, message: `« ${h.titre} » ne figure plus dans la bibliothèque.` }
      }
      return r
    },
    [gestes, pasEncore, recharger],
  )

  const attribuer = useCallback(
    async (h: HypnoseDeBibliotheque, patientIds: PatientId[]): Promise<Resultat> => {
      if (!gestes) return pasEncore(EN_DEMONSTRATION.attribuer)
      const r = await gestes.attribuer(h.id, h.titre, patientIds)
      if (r.ok) {
        // Le compte de la liste, et les fiches qui la portent désormais.
        await Promise.all([recharger(), cabinet?.recharger()])
      }
      return r
    },
    [cabinet, gestes, pasEncore, recharger],
  )

  return { etat, liste, gestes, recharger, corrigerMouvement, renommer, supprimer, attribuer }
}
