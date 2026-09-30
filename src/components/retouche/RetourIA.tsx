import { useState } from 'react'
import { useMaybeCabinet } from '@/cabinet/context'
import { useDevis } from '@/cabinet/useJetons'
import {
  actionDeLaRetouche,
  estCibleRetouche,
  type CibleVote,
  type IssueRetouche,
  type RetourDeLaPraticienne,
  type Vote,
} from '@/lib/retouche'
import { FenetreRetouche } from './FenetreRetouche'
import { PouceBas, PouceHaut } from './Pouces'
import s from './Retouche.module.css'

export interface RetourIAProps {
  cible: CibleVote
  /** Ce qui serait retouché, dit dans la fenêtre : « l'induction », « la synthèse ». */
  libelle?: string
  /**
   * Retoucher ce texte, et l'enregistrer par le chemin habituel de l'écran.
   * Absent : les pouces seuls — l'avis se compte, rien ne se réécrit (les
   * mots, la vigilance, les questions du brouillon ; un texte déjà parti).
   */
  onRetoucher?: (retour: RetourDeLaPraticienne) => Promise<IssueRetouche>
  /** Le texte en place, pour savoir s'il a été corrigé à la main depuis la retouche. */
  version?: string
  /** Une écriture, un enregistrement en cours : les gestes attendent. */
  occupe?: boolean
  /**
   * Le nom du patient dont le texte parle (sa fiche : « Camille Laurent »),
   * quand l'écran le connaît. Une consigne retenue part chez TOUS les
   * patients : celle qui porte son prénom ou son nom est refusée avant
   * d'être retenue. Absent — l'atelier écrit pour personne en particulier —,
   * ce contrôle-là ne se fait pas ; l'avertissement, lui, reste.
   */
  patient?: string
  className?: string
}

type Reussie = Extract<IssueRetouche, { ok: true }>

/**
 * Les deux pouces sous un texte de l'IA, et ce qui s'ensuit.
 *
 * LE POUCE LEVÉ COMPTE UN AVIS, et reste levé : c'est l'accusé de réception.
 * Un second clic le relâche à l'écran — l'avis, lui, est déjà compté ; il ne
 * dit rien du patient ni du texte (0066).
 *
 * LE POUCE BAISSÉ COMPTE AUSSI, et ouvre la fenêtre de retouche quand le
 * texte se retouche. La retouche faite, une ligne le dit sous le texte, avec
 * de quoi revenir à la version d'avant : l'écran qui l'a remplacée la garde
 * en mémoire, et la réenregistre par son chemin habituel.
 *
 * Le cabinet est absent (démonstration, banc de rendu) : les pouces
 * s'enfoncent sans rien écrire. Les écrans ne les montrent de toute façon
 * que dans un cabinet réel.
 */
export function RetourIA({
  cible,
  libelle = 'ce texte',
  onRetoucher,
  version,
  occupe = false,
  patient,
  className,
}: RetourIAProps) {
  const cabinet = useMaybeCabinet()
  const retouchable = Boolean(onRetoucher) && estCibleRetouche(cible)
  const devis = useDevis(estCibleRetouche(cible) ? actionDeLaRetouche(cible) : 'retouche')
  const [vote, setVote] = useState<Vote | null>(null)
  const [ouverte, setOuverte] = useState(false)
  const [reussie, setReussie] = useState<Reussie | null>(null)
  const [annulation, setAnnulation] = useState(false)
  /** Ce que la ligne ajoute : la préférence retenue, la version rétablie, un échec. */
  const [note, setNote] = useState('')

  function compter(v: Vote) {
    // Un avis perdu ne se dit pas : il ne manque à personne.
    void cabinet?.retouches.voter(cible, v)
  }

  function leverLePouce() {
    if (vote === 'haut') {
      setVote(null)
      return
    }
    setVote('haut')
    compter('haut')
  }

  function baisserLePouce() {
    if (vote !== 'bas') {
      setVote('bas')
      compter('bas')
    }
    if (retouchable) {
      setNote('')
      setOuverte(true)
    }
  }

  async function optimiser(retour: RetourDeLaPraticienne, consigne: string | null): Promise<IssueRetouche> {
    if (!onRetoucher || !estCibleRetouche(cible)) return { ok: false, message: 'Ce texte ne se retouche pas.' }
    let r: IssueRetouche
    try {
      r = await onRetoucher(retour)
    } catch {
      return { ok: false, message: "La retouche n'a pas pu être faite. Le texte en place n'a pas bougé." }
    }
    if (!r.ok) return r
    setOuverte(false)
    setReussie(r)
    setNote('')
    /* RETENUE APRÈS LA RÉUSSITE SEULEMENT : une retouche qui échoue n'a rien
       appris à personne, et ne laisse rien en base. Ce qui se retient est la
       consigne relue dans la fenêtre — jamais la réponse brute, qui parlait
       de ce patient et partirait chez tous. */
    if (consigne && cabinet) {
      try {
        setNote((await cabinet.retouches.retenir(cible, consigne, patient)).message)
      } catch {
        setNote("La préférence n'a pas pu être retenue. La retouche, elle, est faite.")
      }
    }
    return r
  }

  async function annuler() {
    if (!reussie?.annuler || annulation) return
    setAnnulation(true)
    let r: { ok: boolean; message: string }
    try {
      r = await reussie.annuler()
    } catch {
      r = { ok: false, message: '' }
    }
    setAnnulation(false)
    if (r.ok) {
      setReussie(null)
      setNote("Version d'avant rétablie.")
    } else {
      setNote(r.message || "La version d'avant n'a pas pu être rétablie.")
    }
  }

  /* Corrigé à la main depuis la retouche : « Annuler la retouche »
     écraserait cette correction. La ligne se retire. */
  const aJour = reussie && (reussie.version === undefined || version === undefined || reussie.version === version)

  return (
    <div className={[s.rangee, className ?? ''].filter(Boolean).join(' ')}>
      <div className={s.pouces}>
        <button
          type="button"
          className={vote === 'haut' ? `${s.pouce} ${s.pouceHaut}` : s.pouce}
          aria-label="Ce contenu me convient"
          aria-pressed={vote === 'haut'}
          title="Ce contenu me convient"
          disabled={occupe}
          onClick={leverLePouce}
        >
          <PouceHaut plein={vote === 'haut'} />
        </button>
        <button
          type="button"
          className={vote === 'bas' ? `${s.pouce} ${s.pouceBas}` : s.pouce}
          aria-label="Ce contenu ne me convient pas"
          aria-pressed={vote === 'bas'}
          aria-haspopup={retouchable ? 'dialog' : undefined}
          title={retouchable ? 'Ce contenu ne me convient pas — demander une retouche' : 'Ce contenu ne me convient pas'}
          disabled={occupe}
          onClick={baisserLePouce}
        >
          <PouceBas plein={vote === 'bas'} />
        </button>
      </div>

      <p className={s.statut} role="status">
        {aJour ? (
          <>
            {reussie.libelle ?? "Version retouchée par l'IA"}
            {reussie.annuler ? (
              <>
                {' — '}
                <button type="button" className={s.lien} onClick={() => void annuler()} disabled={annulation || occupe}>
                  {annulation ? 'Retour à la version d’avant…' : 'Annuler la retouche'}
                </button>
              </>
            ) : null}
            {note ? <span className={s.note}> {note}</span> : null}
          </>
        ) : note ? (
          note
        ) : vote === 'haut' ? (
          'Merci, c’est noté.'
        ) : vote === 'bas' && !retouchable ? (
          'Merci, c’est noté.'
        ) : null}
      </p>

      {ouverte && estCibleRetouche(cible) ? (
        <FenetreRetouche
          cible={cible}
          libelle={libelle}
          devis={devis}
          patient={patient}
          onFermer={() => setOuverte(false)}
          onOptimiser={optimiser}
        />
      ) : null}
    </div>
  )
}
