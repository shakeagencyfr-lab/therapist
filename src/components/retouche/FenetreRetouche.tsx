import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button, Notice, TextArea } from '@/components/ui'
import type { Devis } from '@/lib/jetonsIA'
import {
  BORNE_RETOUR,
  EXEMPLES_RETOUR,
  retourLu,
  type CibleRetouche,
  type IssueRetouche,
  type RetourDeLaPraticienne,
} from '@/lib/retouche'
import { CoutEnJetons, VersLaRecharge } from '@/views/jetons/CoutEnJetons'
import { PouceBas } from './Pouces'
import s from './Retouche.module.css'

/** Ce qui se laisse atteindre au clavier, dans la fenêtre. */
const FOCALISABLES = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

export interface FenetreRetoucheProps {
  cible: CibleRetouche
  /** Ce qui sera retouché, dit dans la fenêtre : « l'induction », « la synthèse ». */
  libelle: string
  /** Le prix de la retouche en mode jetons ; null sinon (src/cabinet/useJetons.ts). */
  devis: Devis | null
  onFermer: () => void
  /**
   * Lance la retouche. Réussie, la ligne sous le texte prend le relais et la
   * fenêtre se ferme ; en échec, elle reste ouverte avec le message — ce que
   * la praticienne a écrit n'est pas perdu.
   */
  onOptimiser: (retour: RetourDeLaPraticienne, retenir: boolean) => Promise<IssueRetouche>
  /** Ce qui est déjà saisi : le banc de rendu, et rien d'autre. */
  initial?: { probleme?: string; attendu?: string; retenir?: boolean; echec?: { message: string; statut?: number | null } }
}

/**
 * La fenêtre du pouce baissé : ce que l'IA a mal fait, ce qu'elle aurait dû
 * faire, et « Optimiser ».
 *
 * Deux questions plutôt qu'une zone libre : « c'est trop rapide » ne dit pas
 * à l'IA ce qu'il faut à la place, et « plus lent » ne lui dit pas ce qui
 * n'allait pas. Les deux ensemble font une consigne qu'elle peut suivre — et
 * que la praticienne peut retenir pour la suite.
 *
 * UNE VRAIE FENÊTRE. `role="dialog"`, le titre pour nom, le clavier gardé à
 * l'intérieur tant qu'elle est ouverte, Échap pour la fermer, et le focus
 * rendu au pouce qui l'a ouverte. Posée au niveau du document (un portail) :
 * dans une carte qui bouge, une position fixe se fixe à la carte.
 */
export function FenetreRetouche({ cible, libelle, devis, onFermer, onOptimiser, initial }: FenetreRetoucheProps) {
  const [probleme, setProbleme] = useState(initial?.probleme ?? '')
  const [attendu, setAttendu] = useState(initial?.attendu ?? '')
  const [retenir, setRetenir] = useState(initial?.retenir ?? false)
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState<{ message: string; statut?: number | null } | null>(initial?.echec ?? null)
  const carte = useRef<HTMLDivElement>(null)
  const id = useId()
  const idTitre = `${id}-titre`
  const idSous = `${id}-sous`
  const exemple = EXEMPLES_RETOUR[cible]
  const pret = retourLu(probleme, attendu).ok && !envoi && !devis?.manque

  /* Le focus entre dans la fenêtre, et revient au pouce en sortant. La page
     derrière ne défile plus : sur un téléphone, elle glissait sous le doigt. */
  useEffect(() => {
    const avant = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const defilement = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    carte.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
    return () => {
      document.body.style.overflow = defilement
      avant?.focus()
    }
  }, [])

  function fermer() {
    // Une retouche partie ne s'abandonne pas en route : son résultat arriverait sans fenêtre.
    if (!envoi) onFermer()
  }

  function clavier(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      fermer()
      return
    }
    if (e.key !== 'Tab' || !carte.current) return
    const elements = Array.from(carte.current.querySelectorAll<HTMLElement>(FOCALISABLES))
    if (!elements.length) return
    const premier = elements[0]!
    const dernier = elements[elements.length - 1]!
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault()
      dernier.focus()
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault()
      premier.focus()
    }
  }

  async function optimiser() {
    const lu = retourLu(probleme, attendu)
    if (!lu.ok) {
      setEchec({ message: lu.message })
      return
    }
    if (envoi) return
    setEnvoi(true)
    setEchec(null)
    const r = await onOptimiser({ probleme: lu.probleme, attendu: lu.attendu }, retenir)
    // Réussie, la fenêtre est déjà fermée par l'écran qui la porte.
    if (!r.ok) {
      setEnvoi(false)
      setEchec({ message: r.message, statut: r.statut })
    }
  }

  const fenetre = (
    <div
      className={s.voile}
      onMouseDown={(e) => {
        // Un clic sur le voile, pas dans la carte : comme « Annuler ».
        if (e.target === e.currentTarget) fermer()
      }}
    >
      <div
        ref={carte}
        className={s.fenetre}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        aria-describedby={idSous}
        onKeyDown={clavier}
      >
        <div className={s.tete}>
          <span className={s.embleme} aria-hidden>
            <PouceBas className={s.emblemeIcone} />
          </span>
          <div className={s.titres}>
            <h2 id={idTitre} className={s.titre}>
              Retour sur l'IA
            </h2>
            <p id={idSous} className={s.sousTitre}>
              Qu'est-ce que l'IA a mal fait, et qu'aurait-elle dû faire ?
            </p>
          </div>
          <button type="button" className={s.fermer} onClick={fermer} aria-label="Fermer" disabled={envoi}>
            ✕
          </button>
        </div>

        <p className={s.porte}>
          La retouche porte sur {libelle} ; le reste ne change pas.
        </p>

        <label className={s.champ}>
          <span className={s.etiquette}>
            Qu'est-ce que l'IA a mal fait ?{' '}
            <span className={s.requis} aria-hidden>
              *
            </span>
          </span>
          <TextArea
            className={s.zone}
            rows={3}
            value={probleme}
            maxLength={BORNE_RETOUR}
            required
            aria-required="true"
            disabled={envoi}
            placeholder={exemple.probleme}
            onChange={(e) => setProbleme(e.target.value)}
          />
        </label>

        <label className={s.champ}>
          <span className={s.etiquette}>
            Que se serait-il dû passer ?{' '}
            <span className={s.requis} aria-hidden>
              *
            </span>
          </span>
          <TextArea
            className={s.zone}
            rows={3}
            value={attendu}
            maxLength={BORNE_RETOUR}
            required
            aria-required="true"
            disabled={envoi}
            placeholder={exemple.attendu}
            onChange={(e) => setAttendu(e.target.value)}
          />
        </label>

        <label className={s.retenir}>
          <input
            type="checkbox"
            className={s.case}
            checked={retenir}
            disabled={envoi}
            onChange={(e) => setRetenir(e.target.checked)}
          />
          <span>Retenir cette préférence pour les prochaines générations</span>
        </label>

        <CoutEnJetons devis={devis} sujet="Cette retouche" className={s.cout} />

        {echec ? (
          <div role="alert">
            <Notice tone="warn">
              {echec.message}
              {/* Le chemin de la recharge, là où le refus se lit — sauf si la
                  phrase du prix le montre déjà. */}
              {echec.statut === 402 && !devis?.manque ? (
                <>
                  {' '}
                  <VersLaRecharge />
                </>
              ) : null}
            </Notice>
          </div>
        ) : null}

        <div className={s.pied}>
          <Button variant="ghost" onClick={fermer} disabled={envoi}>
            Annuler
          </Button>
          <Button variant="primary" onClick={() => void optimiser()} disabled={!pret} aria-busy={envoi || undefined}>
            {envoi ? (
              <>
                <span className={s.rouage} aria-hidden />
                Optimisation…
              </>
            ) : (
              'Optimiser'
            )}
          </Button>
        </div>
      </div>
    </div>
  )

  // Hors navigateur (banc de rendu), la fenêtre se rend en place.
  return typeof document === 'undefined' ? fenetre : createPortal(fenetre, document.body)
}
