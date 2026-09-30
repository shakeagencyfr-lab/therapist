import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button, Notice, TextArea } from '@/components/ui'
import { useJetons } from '@/cabinet/useJetons'
import type { Devis } from '@/lib/jetonsIA'
import {
  BORNE_PREFERENCE,
  BORNE_RETOUR,
  EXEMPLES_RETOUR,
  consigneLue,
  retourLu,
  type CibleRetouche,
  type IssueRetouche,
  type RetourDeLaPraticienne,
} from '@/lib/retouche'
import { CoutEnJetons, VersLaRecharge } from '@/views/jetons/CoutEnJetons'
import { PouceBas } from './Pouces'
import s from './Retouche.module.css'

/** Le micro d'un champ, quand il écoute (src/components/ui/Dictee.tsx). */
const MICRO_OUVERT = 'button[aria-pressed="true"][aria-label="Arrêter la dictée"]'

/** Ce qui se laisse atteindre au clavier, dans la fenêtre. */
const FOCALISABLES = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

export interface FenetreRetoucheProps {
  cible: CibleRetouche
  /** Ce qui sera retouché, dit dans la fenêtre : « l'induction », « la synthèse ». */
  libelle: string
  /** Le prix de la retouche en mode jetons ; null sinon (src/cabinet/useJetons.ts). */
  devis: Devis | null
  /**
   * Ferme la fenêtre. Appelé aussi PENDANT la retouche — ✕, « Annuler »,
   * Échap : c'est alors un abandon, et l'écran qui la porte ne pose pas le
   * texte qui reviendrait (RetourIA, `Retoucheur`).
   */
  onFermer: () => void
  /**
   * Lance la retouche. Réussie, la ligne sous le texte prend le relais et la
   * fenêtre se ferme ; en échec, elle reste ouverte avec le message — ce que
   * la praticienne a écrit n'est pas perdu.
   *
   * `consigne` : la consigne à retenir, relue (consigneLue) — null quand
   * « Retenir » n'est pas cochée.
   */
  onOptimiser: (retour: RetourDeLaPraticienne, consigne: string | null) => Promise<IssueRetouche>
  /**
   * Le nom du patient dont le texte parle, quand l'écran le connaît : une
   * consigne à retenir qui le contient est refusée. Absent (l'atelier, qui
   * écrit pour personne en particulier) : ce contrôle-là ne se fait pas.
   */
  patient?: string
  /** Ce qui est déjà saisi : le banc de rendu, et rien d'autre. */
  initial?: {
    probleme?: string
    attendu?: string
    retenir?: boolean
    consigne?: string
    echec?: { message: string; statut?: number | null }
    /** La retouche partie : ce que la fenêtre montre pendant l'appel. */
    envoi?: boolean
  }
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
 * CE QUI SE RETIENT SE RELIT. Cochée, « Retenir » ouvre un champ à part,
 * « Consigne à retenir », prérempli de la seconde réponse : c'est ce champ,
 * et lui seul, qui rejoint les préférences du cabinet — et il part chez
 * tous les patients. La réponse parle souvent d'une personne (un souvenir,
 * un lieu) : la praticienne l'y réduit à une consigne de style, sous les
 * yeux, avec son compte de caractères. Trop longue, ou portant le nom du
 * patient, elle ferme « Optimiser » et dit pourquoi : rien n'est payé ni
 * retenu à moitié.
 *
 * UNE VRAIE FENÊTRE. `role="dialog"`, le titre pour nom, le clavier gardé à
 * l'intérieur tant qu'elle est ouverte, Échap pour la fermer, et le focus
 * rendu au pouce qui l'a ouverte. Posée au niveau du document (un portail) :
 * dans une carte qui bouge, une position fixe se fixe à la carte.
 *
 * PENDANT LA RETOUCHE, LE CLAVIER RESTE DEDANS. Tout s'y fermait — champs,
 * case, ✕, « Annuler », « Optimiser » — : le focus tombait sur la page, et
 * Tab menait derrière le voile, jusqu'aux gestes qui changent le texte en
 * cours de retouche. Les réponses restent fermées (elles sont parties) ;
 * « Optimiser » garde le focus en disant qu'il travaille ; ✕, « Annuler »
 * et Échap ABANDONNENT la retouche — l'écran n'en posera pas le texte.
 *
 * UNE DICTÉE EN COURS PASSE AVANT. Le micro dit « Arrêter la dictée
 * (Échap) » : Échap l'arrête, et la fenêtre reste — elle se fermait, et
 * jetait les deux réponses avec la dictée. « Optimiser » attend aussi
 * qu'elle soit finie : partie avant, la retouche perdait les derniers mots
 * dits, et la dictée disparaissait d'un coup sous des champs fermés.
 */
export function FenetreRetouche({ cible, libelle, devis, onFermer, onOptimiser, patient, initial }: FenetreRetoucheProps) {
  const [probleme, setProbleme] = useState(initial?.probleme ?? '')
  const [attendu, setAttendu] = useState(initial?.attendu ?? '')
  const [retenir, setRetenir] = useState(initial?.retenir ?? false)
  /* La consigne, une fois que la praticienne l'a touchée ; null : elle suit
     encore la seconde réponse, qu'elle recopie telle quelle. */
  const [consigneSaisie, setConsigneSaisie] = useState<string | null>(initial?.consigne ?? null)
  const [envoi, setEnvoi] = useState(initial?.envoi ?? false)
  const [echec, setEchec] = useState<{ message: string; statut?: number | null } | null>(initial?.echec ?? null)
  /** Les champs où une dictée tourne (micro ouvert, ou derniers mots en route). */
  const [dictees, setDictees] = useState<Record<string, boolean>>({})
  const dicteeEnCours = Object.values(dictees).some(Boolean)
  const suivreLaDictee = (champ: string) => (enCours: boolean) =>
    setDictees((prev) => (Boolean(prev[champ]) === enCours ? prev : { ...prev, [champ]: enCours }))
  const jetons = useJetons()
  const carte = useRef<HTMLDivElement>(null)
  /** Abandonnée pendant la retouche, la fenêtre n'est plus là quand elle revient. */
  const montee = useRef(true)
  const id = useId()
  const idTitre = `${id}-titre`
  const idSous = `${id}-sous`
  const idAide = `${id}-aide`
  const idCompte = `${id}-compte`
  const idRefus = `${id}-refus`
  const exemple = EXEMPLES_RETOUR[cible]
  const consigne = consigneSaisie ?? attendu.trim()
  const longueur = consigne.trim().length
  const consigneRelue = consigneLue(consigne, patient)
  /* Un champ vide se voit sans phrase ; le reste — trop long, un nom — se
     dit sous le champ, là où il se corrige. */
  const refusConsigne = retenir && !consigneRelue.ok && consigne.trim() ? consigneRelue.message : ''
  const pret =
    retourLu(probleme, attendu).ok &&
    (!retenir || consigneRelue.ok) &&
    !envoi &&
    !devis?.manque &&
    !dicteeEnCours

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

  useEffect(() => {
    montee.current = true
    return () => {
      montee.current = false
    }
  }, [])

  /**
   * Fermer — et, la retouche partie, l'abandonner : l'écran qui porte la
   * fenêtre ne posera pas le texte qui reviendra (RetourIA).
   */
  function fermer() {
    onFermer()
  }

  function clavier(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      /* Un micro ouvert : Échap l'arrête (useDicteeChamp l'écoute sur la
         fenêtre du navigateur — la touche doit donc passer), et la fenêtre
         reste. Le micro fermé, un second Échap la ferme. */
      if (carte.current?.querySelector(MICRO_OUVERT)) return
      e.stopPropagation()
      fermer()
      return
    }
    if (e.key !== 'Tab' || !carte.current) return
    const elements = Array.from(carte.current.querySelectorAll<HTMLElement>(FOCALISABLES))
    // Rien à atteindre : Tab ne sort pas pour autant de la fenêtre.
    if (!elements.length) {
      e.preventDefault()
      return
    }
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
    // Refusée avant la retouche, pas après : sinon elle serait payée, et la fenêtre fermée.
    const relue = retenir ? consigneLue(consigne, patient) : null
    if (relue && !relue.ok) {
      setEchec({ message: relue.message })
      return
    }
    if (envoi || dicteeEnCours) return
    setEnvoi(true)
    setEchec(null)
    const r = await onOptimiser({ probleme: lu.probleme, attendu: lu.attendu }, relue?.ok ? relue.consigne : null)
    /* Réussie, la fenêtre est déjà fermée par l'écran qui la porte ;
       abandonnée, elle l'a été par la praticienne : rien à y dire. */
    if (!montee.current) return
    if (!r.ok) {
      setEnvoi(false)
      setEchec({ message: r.message, statut: r.statut })
    }
  }

  const fenetre = (
    <div
      className={s.voile}
      onMouseDown={(e) => {
        /* Un clic sur le voile, pas dans la carte : comme « Annuler » — sauf
           pendant la retouche, qu'un clic à côté n'abandonne pas. ✕,
           « Annuler » et Échap le font, et le disent. */
        if (e.target === e.currentTarget && !envoi) fermer()
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
          <button
            type="button"
            className={s.fermer}
            onClick={fermer}
            aria-label={envoi ? 'Abandonner la retouche' : 'Fermer'}
            title={envoi ? 'Abandonner la retouche : le texte en place ne bougera pas' : undefined}
          >
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
            dictee
            value={probleme}
            maxLength={BORNE_RETOUR}
            required
            aria-required="true"
            disabled={envoi}
            placeholder={exemple.probleme}
            onChange={(e) => setProbleme(e.target.value)}
            onDicteeEnCours={suivreLaDictee('probleme')}
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
            dictee
            value={attendu}
            maxLength={BORNE_RETOUR}
            required
            aria-required="true"
            disabled={envoi}
            placeholder={exemple.attendu}
            onChange={(e) => setAttendu(e.target.value)}
            onDicteeEnCours={suivreLaDictee('attendu')}
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

        {retenir ? (
          <div className={s.consigne}>
            <label className={s.champ}>
              <span className={s.etiquette}>Consigne à retenir</span>
              <TextArea
                className={s.zone}
                rows={3}
                dictee
                value={consigne}
                maxLength={BORNE_PREFERENCE}
                aria-required="true"
                aria-invalid={refusConsigne ? true : undefined}
                aria-describedby={`${idAide} ${idCompte}${refusConsigne ? ` ${idRefus}` : ''}`}
                disabled={envoi}
                placeholder={exemple.attendu}
                onChange={(e) => setConsigneSaisie(e.target.value)}
                onDicteeEnCours={suivreLaDictee('consigne')}
              />
            </label>
            <p id={idAide} className={s.aide}>
              Elle s'appliquera à tous vos patients, pour ce type de texte : n'y mettez ni nom ni détail
              propre à ce patient.
            </p>
            {/* Le compte se lit avec le champ (aria-describedby), sans
                s'annoncer à chaque lettre ; le refus, lui, s'annonce. */}
            <p id={idCompte} className={longueur > BORNE_PREFERENCE ? `${s.compte} ${s.compteDepasse}` : s.compte}>
              {`${longueur} / ${BORNE_PREFERENCE} caractères`}
            </p>
            <p id={idRefus} className={s.refus} role="status">
              {refusConsigne}
            </p>
          </div>
        ) : null}

        <CoutEnJetons devis={devis} sujet="Cette retouche" className={s.cout} />

        {echec ? (
          <div role="alert">
            <Notice tone="warn">
              {echec.message}
              {/* Le chemin de la recharge, là où le refus se lit — sauf si la
                  phrase du prix le montre déjà. Et jamais pour un cabinet qui
                  paie avec sa propre clé : son 402 dit une clé refusée ou un
                  crédit Anthropic épuisé (server/ai.ts), que lui seul règle —
                  le renvoyer vers les jetons de son revendeur l'égarait. La
                  phrase du serveur, seule, dit déjà quoi faire. */}
              {echec.statut === 402 && jetons?.mode !== 'cle_cabinet' && !devis?.manque ? (
                <>
                  {' '}
                  <VersLaRecharge />
                </>
              ) : null}
            </Notice>
          </div>
        ) : null}

        {/* Ce qui retient « Optimiser », ou ce que « Annuler » fera : dit
            sous les yeux, pas seulement par un bouton grisé. */}
        {envoi ? (
          <p className={s.aide} role="status">
            {devis
              ? "Retouche en cours. « Annuler » l'abandonne : le texte en place ne bougera pas, mais une retouche déjà partie reste décomptée si elle aboutit."
              : "Retouche en cours. « Annuler » l'abandonne : le texte en place ne bougera pas."}
          </p>
        ) : dicteeEnCours ? (
          <p className={s.aide} role="status">
            Dictée en cours : arrêtez-la (le micro, ou Échap) pour optimiser — les derniers mots dits arrivent encore.
          </p>
        ) : null}

        <div className={s.pied}>
          <Button variant="ghost" onClick={fermer}>
            Annuler
          </Button>
          {/* Pendant la retouche, le bouton reste atteignable (aria-disabled,
              pas disabled) : c'est lui qui a le focus, et un bouton fermé le
              laissait tomber hors de la fenêtre. Un second clic ne relance
              rien (optimiser). */}
          <Button
            variant="primary"
            onClick={() => void optimiser()}
            disabled={!pret && !envoi}
            aria-disabled={envoi || undefined}
            aria-busy={envoi || undefined}
          >
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
