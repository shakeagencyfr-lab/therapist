import { useCallback, useState } from 'react'
import { buildPatientContext, generateModule } from '@/services/aiClient'
import { useStore } from '@/state/store'
import type { ModuleCree } from './useCabinet'
import type { DraftProposal, PatientId } from '@/types/domain'

/**
 * Les consignes des modules d'une séance, écrites juste après l'envoi.
 *
 * Le brouillon de séance propose des modules — un titre, un « pourquoi », un
 * type — et rien de plus. Le patient recevait donc un titre à cocher : il
 * savait qu'on attendait quelque chose de lui, sans savoir quoi. La consigne
 * complète — durée, moment, étapes, à quoi ça sert — vient de la même route
 * que l'atelier, avec le dossier de la personne en contexte.
 *
 * ELLE S'ÉCRIT APRÈS L'ENVOI, PAS PENDANT. La séance est déjà versée quand
 * ces appels partent : si le réseau lâche au troisième module, la note, les
 * modules et les audios sont en place, et il ne manque que du texte que la
 * thérapeute peut écrire elle-même. L'inverse — tout tenir en otage le temps
 * de cinq appels — perdrait une séance entière pour une consigne.
 *
 * UN ÉCHEC PAR MODULE NE FAIT PAS ÉCHOUER LES AUTRES. Chacun est indépendant,
 * et celui qui n'aboutit pas garde le « pourquoi » de la séance, qui vaut
 * mieux que rien.
 */
export interface EcritureConsignes {
  /** Le module en cours d'écriture, pour l'afficher. */
  enCours: string
  /** Combien sont écrites, sur combien. */
  faits: number
  total: number
  ecrit: boolean
  echecs: number
  ecrire: (patientId: PatientId, modules: ModuleCree[], propositions: DraftProposal[]) => Promise<void>
}

export function useEcritureConsignes(
  majConsigne: (moduleId: string, consigne: { duree: string; quand: string; steps: string[]; why: string }) => Promise<{ ok: boolean }>,
): EcritureConsignes {
  const { read } = useStore()
  const [enCours, setEnCours] = useState('')
  const [faits, setFaits] = useState(0)
  const [total, setTotal] = useState(0)
  const [ecrit, setEcrit] = useState(false)
  const [echecs, setEchecs] = useState(0)

  const ecrire = useCallback(
    async (patientId: PatientId, modules: ModuleCree[], propositions: DraftProposal[]) => {
      if (!modules.length) return
      setEcrit(true)
      setTotal(modules.length)
      setFaits(0)
      setEchecs(0)

      const contexte = buildPatientContext(read(), patientId)
      let n = 0
      let rates = 0

      for (const module of modules) {
        setEnCours(module.title)
        /* Le « pourquoi » de la séance est le brief : c'est la thérapeute qui
           a décidé de ce module, l'IA ne fait que l'écrire en entier. */
        const pourquoi = propositions.find((p) => p.titre === module.title)?.pourquoi ?? ''
        try {
          const rendu = await generateModule({
            intent: pourquoi ? `${module.title}. ${pourquoi}` : module.title,
            type: module.kind,
            // Pas de quiz sur un module de séance : il n'a pas été relu, et
            // un quiz faux est pire qu'une absence de quiz.
            quiz: false,
            context: contexte,
          })
          await majConsigne(module.id, {
            duree: rendu.duree,
            quand: rendu.quand,
            steps: rendu.steps,
            why: rendu.pourquoi || pourquoi,
          })
        } catch {
          rates += 1
          setEchecs(rates)
        }
        n += 1
        setFaits(n)
      }

      setEnCours('')
    },
    [majConsigne, read],
  )

  return { enCours, faits, total, ecrit, echecs, ecrire }
}
