/**
 * Les demandes d'essai de la page d'accueil, pour le revendeur qui les
 * accueille (0060).
 *
 * À part de useReseller : l'onglet est le seul à s'en servir, et le
 * portefeuille n'a pas à attendre ni à relire ces lignes. La base décide de
 * tout — qui lit (les membres du revendeur qui accueille), ce qui s'écrit
 * (le statut et la note, rien d'autre) ; cet écran ne fait que ne pas
 * proposer ce qu'elle refuserait.
 *
 * Sans base (démonstration, banc de rendu), deux demandes fictives montrent
 * l'écran ; les gestes n'y touchent que la mémoire de la page.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  compterNouvelles,
  NOTE_MAX,
  trierDemandes,
  type DemandeEssai,
  type StatutDemande,
} from '@/lib/demandesRevendeur'

const COLONNES =
  'id, created_at, nom, email, telephone, cabinet, ville, patients, offre, message, consentement_le, statut, statut_le, note_interne'

/** Deux demandes fictives, pour la démonstration sans base. */
const DEMONSTRATION: DemandeEssai[] = [
  {
    id: 'demo-1',
    created_at: '2026-09-28T08:40:00Z',
    nom: 'Claire Fontaine',
    email: 'claire@cabinet-fontaine.fr',
    telephone: '06 12 34 56 78',
    cabinet: 'Cabinet Claire Fontaine',
    ville: 'Nantes',
    patients: '10-25',
    offre: 'cabinet',
    message: 'Je reçois surtout pour l’arrêt du tabac et les troubles du sommeil. Je voudrais voir l’espace patient.',
    consentement_le: '2026-09-28T08:40:00Z',
    statut: 'nouvelle',
    statut_le: null,
    note_interne: '',
  },
  {
    id: 'demo-2',
    created_at: '2026-09-25T16:05:00Z',
    nom: 'Hélène Marchand',
    email: 'contact@helene-marchand-hypnose.fr',
    telephone: null,
    cabinet: 'Hélène Marchand Hypnose',
    ville: 'Bordeaux',
    patients: 'moins-10',
    offre: 'a-voir',
    message: null,
    consentement_le: '2026-09-25T16:05:00Z',
    statut: 'contactee',
    statut_le: '2026-09-26T09:00:00Z',
    note_interne: 'Rappelée le 26, rendez-vous de démonstration jeudi.',
  },
]

export interface Geste {
  ok: boolean
  message: string
}

export interface DonneesDemandes {
  /** Ce revendeur accueille-t-il les demandes de la plateforme ? Sinon, pas d'onglet. */
  accueille: boolean
  /** Triées : les nouvelles d'abord, puis la plus récente. */
  demandes: DemandeEssai[]
  nouvelles: number
  /** Vrai quand les demandes viennent de la base et non de la démonstration. */
  reel: boolean
  chargement: boolean
  erreur: string
  recharger: () => Promise<void>
  changerStatut: (id: string, statut: StatutDemande) => Promise<Geste>
  enregistrerNote: (id: string, note: string) => Promise<Geste>
  effacer: (id: string) => Promise<Geste>
}

export function useDemandes(): DonneesDemandes {
  const sansBase = !supabase()
  const [accueille, setAccueille] = useState(sansBase)
  const [demandes, setDemandes] = useState<DemandeEssai[]>(() => (sansBase ? trierDemandes(DEMONSTRATION) : []))
  const [chargement, setChargement] = useState(!sansBase)
  const [erreur, setErreur] = useState('')

  const recharger = useCallback(async () => {
    const db = supabase()
    if (!db) return
    setErreur('')
    /* Le revendeur accueille-t-il ? La colonne se lit sur sa propre ligne
       (« revendeur lit son organisation »). Une lecture qui échoue — base
       d'avant 0060 comprise — vaut « non » : pas d'onglet, rien de cassé. */
    const { data: orgs, error: errOrg } = await db.from('resellers').select('id, accueille_demandes')
    const oui = !errOrg && ((orgs ?? []) as Array<{ accueille_demandes?: boolean }>).some((o) => o.accueille_demandes === true)
    setAccueille(oui)
    if (!oui) {
      setDemandes([])
      setChargement(false)
      return
    }
    const { data, error } = await db
      .from('demandes_essai')
      .select(COLONNES)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) {
      setErreur("Les demandes n'ont pas pu être lues. Réessayez dans un instant.")
      setChargement(false)
      return
    }
    setDemandes(trierDemandes((data ?? []) as DemandeEssai[]))
    setChargement(false)
  }, [])

  useEffect(() => {
    void recharger()
  }, [recharger])

  /** Remplace une ligne en mémoire, et garde l'ordre de la liste. */
  const poser = useCallback((id: string, champs: Partial<DemandeEssai>) => {
    setDemandes((prev) => trierDemandes(prev.map((d) => (d.id === id ? { ...d, ...champs } : d))))
  }, [])

  const changerStatut = useCallback(
    async (id: string, statut: StatutDemande): Promise<Geste> => {
      const db = supabase()
      if (!db) {
        poser(id, { statut, statut_le: new Date().toISOString() })
        return { ok: true, message: 'Statut changé (démonstration).' }
      }
      const { data, error } = await db
        .from('demandes_essai')
        .update({ statut })
        .eq('id', id)
        .select('statut, statut_le')
        .maybeSingle<{ statut: StatutDemande; statut_le: string | null }>()
      if (error || !data) return { ok: false, message: "Le statut n'a pas pu être enregistré. Réessayez." }
      poser(id, data)
      return { ok: true, message: 'Statut enregistré.' }
    },
    [poser],
  )

  const enregistrerNote = useCallback(
    async (id: string, note: string): Promise<Geste> => {
      const propre = note.slice(0, NOTE_MAX)
      const db = supabase()
      if (!db) {
        poser(id, { note_interne: propre })
        return { ok: true, message: 'Note enregistrée (démonstration).' }
      }
      const { data, error } = await db
        .from('demandes_essai')
        .update({ note_interne: propre })
        .eq('id', id)
        .select('note_interne')
        .maybeSingle<{ note_interne: string }>()
      if (error || !data) return { ok: false, message: "La note n'a pas pu être enregistrée. Réessayez." }
      poser(id, data)
      return { ok: true, message: 'Note enregistrée.' }
    },
    [poser],
  )

  const effacer = useCallback(async (id: string): Promise<Geste> => {
    const db = supabase()
    if (db) {
      const { data, error } = await db.from('demandes_essai').delete().eq('id', id).select('id')
      if (error || !data?.length) return { ok: false, message: "La demande n'a pas pu être effacée. Réessayez." }
    }
    setDemandes((prev) => prev.filter((d) => d.id !== id))
    return { ok: true, message: 'Demande effacée.' }
  }, [])

  return {
    accueille,
    demandes,
    nouvelles: compterNouvelles(demandes),
    reel: !sansBase,
    chargement,
    erreur,
    recharger,
    changerStatut,
    enregistrerNote,
    effacer,
  }
}
