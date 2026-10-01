import { useEffect, useState } from 'react'
import { useMaybeAuth } from '@/auth/session'
import { EN_DEMONSTRATION, useBibliothequeHypnoses, type BibliothequeData } from '@/cabinet/useBibliothequeHypnoses'
import { useEcritureBibliotheque, type EcritureBibliotheque } from '@/cabinet/useEcritureBibliotheque'
import { useJetons, useDevis } from '@/cabinet/useJetons'
import { GesteAConfirmer } from '@/components/GesteAConfirmer'
import { Button, Card, Notice, Overline, Segmented, TextArea, TextInput, Title } from '@/components/ui'
import { HYPNOSE_SEED_INTENTIONS, HYPNOSE_SEEDS } from '@/data/bibliothequeHypnoses'
import {
  AVERTISSEMENT_SEANCE,
  bilanBibliotheque,
  consequenceDeLaSuppression,
  hypnosePourPdf,
  metaDeLaBibliotheque,
  refusIntention,
} from '@/lib/bibliothequeHypnoses'
import { plural } from '@/lib/format'
import { telechargerHypnose } from '@/lib/hypnosePdf'
import { logoPourPdf } from '@/lib/logoPdf'
import { libelleReprise } from '@/lib/texteHypnose'
import { MOUVEMENTS_HYPNOSE, NOM_MOUVEMENT, pointDeReprise } from '@/services/aiClient'
import { useStore } from '@/state/store'
import type { HypnoseDeBibliotheque, PatientId } from '@/types/domain'
import { CoutEnJetons, VersLaRecharge } from '@/views/jetons/CoutEnJetons'
import { VerrouHypnose } from '@/views/jetons/VerrouHypnose'
import { TexteMouvement } from '@/views/therapist/TexteMouvement'
import s from './BibliothequeHypnoses.module.css'

/* Les onglets de l'atelier ------------------------------------------ */

export type OngletAtelier = 'modules' | 'hypnoses'

const ONGLETS: Array<{ value: OngletAtelier; label: string }> = [
  { value: 'modules', label: 'Modules' },
  { value: 'hypnoses', label: 'Hypnoses' },
]

/**
 * « Modules | Hypnoses », en tête de l'atelier — seulement pour un cabinet
 * qui a l'option Hypnose (src/views/atelier/AtelierView.tsx). Sans elle,
 * l'atelier reste celui des modules, sans onglet.
 */
export function OngletsAtelier({ valeur, onChange }: { valeur: OngletAtelier; onChange: (v: OngletAtelier) => void }) {
  return (
    <div className={s.onglets} role="group" aria-label="Partie de l’atelier">
      <Segmented options={ONGLETS} value={valeur} onChange={onChange} />
    </div>
  )
}

/* L'onglet « Hypnoses » ----------------------------------------------- */

/** Ce que le banc de rendu ouvre d'emblée, sans clic. */
export interface OuvertureInitiale {
  /** L'hypnose dépliée pour la lecture. */
  ouverte?: string
  /** L'hypnose dont le choix des patients est ouvert. */
  attribution?: string
}

/**
 * La bibliothèque d'hypnoses du cabinet (0071), dans l'atelier.
 *
 * À gauche, on en écrit une : une intention, un titre si l'on veut, et l'IA
 * écrit les quatre mouvements d'un script général — pour personne en
 * particulier. À droite, les hypnoses du cabinet : celles écrites en séance
 * y entrent d'elles-mêmes en se refermant, celles de l'atelier aussi. On les
 * lit, on corrige un mouvement, on télécharge le PDF, et on les attribue à
 * d'autres patients, comme un module.
 *
 * LA LISTE NE NOMME PERSONNE. Une hypnose née en séance dit d'où elle vient
 * (« Écrite en séance »), jamais de qui : la bibliothèque se montre au
 * cabinet entier, et son nom n'a rien à faire à côté d'une hypnose qu'on
 * s'apprête à lire à quelqu'un d'autre. Avant de l'attribuer, l'écran
 * demande de la relire — elle peut porter des détails de cette personne.
 */
export function BibliothequeHypnoses({ initial = {} }: { initial?: OuvertureInitiale } = {}) {
  const biblio = useBibliothequeHypnoses()
  const ecriture = useEcritureBibliotheque(biblio.gestes, biblio.recharger)
  const [ouverte, setOuverte] = useState(initial.ouverte ?? '')
  const [attribution, setAttribution] = useState(initial.attribution ?? '')

  /* Écrite et rangée : elle s'ouvre dans la liste, prête à être relue. */
  useEffect(() => {
    if (ecriture.fini && ecriture.conservee && ecriture.ligne) setOuverte(ecriture.ligne)
  }, [ecriture.fini, ecriture.conservee, ecriture.ligne])

  return (
    <>
      <h1 className={s.h1}>La bibliothèque d'hypnoses</h1>
      <p className={s.intro}>
        Les hypnoses que vous écrivez en séance la rejoignent d'elles-mêmes ; vous pouvez aussi en
        écrire ici, pour personne en particulier. Vous les relisez, vous les corrigez, puis vous les
        attribuez à d'autres patients, comme un module : chacun reçoit sa copie, dans sa fiche.
      </p>
      <div className={s.grille}>
        <div className={s.colonne}>
          <CarteCreation biblio={biblio} ecriture={ecriture} onOuvrir={setOuverte} />
        </div>
        <div className={s.colonne}>
          <ListeBibliotheque
            biblio={biblio}
            ecriture={ecriture}
            ouverte={ouverte}
            onOuvrir={setOuverte}
            attribution={attribution}
            onAttribuer={setAttribution}
          />
        </div>
      </div>
    </>
  )
}

/* Créer une hypnose ----------------------------------------------------- */

function CarteCreation({
  biblio,
  ecriture,
  onOuvrir,
}: {
  biblio: BibliothequeData
  ecriture: EcritureBibliotheque
  onOuvrir: (id: string) => void
}) {
  const [intention, setIntention] = useState('')
  const [titre, setTitre] = useState('')
  const [refus, setRefus] = useState('')
  const devis = useDevis('hypnose')
  const jetons = useJetons()
  const demo = biblio.etat === 'demo'
  const enChantier = ecriture.ecriture || ecriture.ecrits.length > 0 || Boolean(ecriture.erreur)

  function lancer() {
    const r = refusIntention(intention)
    if (r) {
      setRefus(r)
      return
    }
    setRefus('')
    void ecriture.ecrire(intention, titre)
  }

  function fermer() {
    if (ecriture.fini && ecriture.conservee && ecriture.ligne) onOuvrir(ecriture.ligne)
    ecriture.reinitialiser()
    if (ecriture.fini) {
      setIntention('')
      setTitre('')
    }
  }

  const bilan = bilanBibliotheque({
    fini: ecriture.fini,
    conservee: ecriture.conservee,
    ecrits: ecriture.ecrits.length,
    interrompue: Boolean(ecriture.erreur),
  })

  return (
    <Card padded={false} className={s.creation}>
      <Title as="h2">Créer une hypnose</Title>
      <p className={s.sousTitre}>
        Un script général, pour la bibliothèque du cabinet : quatre mouvements, une trentaine de
        minutes de lecture, sans détail propre à une personne.
      </p>

      {!enChantier ? (
        <>
          <label className={s.champ}>
            <Overline>Votre intention</Overline>
            <TextArea
              dictee
              className={s.intention}
              rows={4}
              value={intention}
              onChange={(e) => {
                setIntention(e.target.value)
                if (refus) setRefus('')
              }}
              placeholder="Ex. : une hypnose pour retrouver le sommeil quand les pensées tournent le soir, en relâchant le corps peu à peu."
            />
          </label>
          <div className={s.amorces}>
            {HYPNOSE_SEEDS.map((seed) => (
              <button
                key={seed}
                type="button"
                className={s.amorce}
                onClick={() => {
                  setIntention(HYPNOSE_SEED_INTENTIONS[seed] ?? seed)
                  setRefus('')
                }}
              >
                {seed}
              </button>
            ))}
          </div>
          <label className={s.champ}>
            <Overline>Titre (facultatif)</Overline>
            <TextInput
              dictee
              className={s.titre}
              value={titre}
              maxLength={300}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Sinon, celui que l'induction lui donnera"
            />
          </label>

          <Button
            variant="primary"
            block
            className={s.ecrire}
            disabled={demo || Boolean(devis?.manque)}
            onClick={lancer}
          >
            Écrire l'hypnose
          </Button>
          <CoutEnJetons devis={devis} sujet="Cette hypnose" />
          {demo ? <p className={s.aide}>{EN_DEMONSTRATION.ecrire}</p> : null}
          {refus ? <Notice tone="warn">{refus}</Notice> : null}
        </>
      ) : (
        <div className={s.progression} aria-live="polite">
          {ecriture.enCours ? (
            <p className={s.encours}>
              <span className={s.point} aria-hidden />
              {ecriture.enCours} en cours d'écriture… chaque mouvement demande une trentaine de secondes.
            </p>
          ) : null}
          <ol className={s.avancement}>
            {MOUVEMENTS_HYPNOSE.map((m, i) => {
              const ecrit = ecriture.ecrits[i]
              return (
                <li key={m} className={ecrit ? s.fait : s.attente}>
                  <span className={s.puce}>{ecrit ? '✓' : i + 1}</span>
                  <span>{ecrit?.titre || NOM_MOUVEMENT[m]}</span>
                </li>
              )
            })}
          </ol>

          {ecriture.erreur ? (
            <div role="alert" className={s.echec}>
              <Notice tone="warn">
                {ecriture.erreur}
                {/* Le chemin de la recharge, comme sous une retouche — jamais
                    pour un cabinet qui paie avec sa propre clé : son 402 dit
                    une clé refusée, que lui seul règle. */}
                {ecriture.statut === 402 && jetons?.mode !== 'cle_cabinet' && !devis?.manque ? (
                  <>
                    {' '}
                    <VersLaRecharge />
                  </>
                ) : null}
              </Notice>
              {/* L'option fermée entre-temps : le verrou dit pourquoi, et comment la rouvrir. */}
              {ecriture.statut === 403 ? <VerrouHypnose dejaEcrites /> : null}
            </div>
          ) : null}

          {!ecriture.ecriture && (ecriture.fini || ecriture.erreur) ? (
            <div className={s.finiLigne}>
              {bilan ? (
                bilan.ton === 'neutre' ? (
                  <p className={s.bilan}>{bilan.texte}</p>
                ) : (
                  <Notice tone={bilan.ton}>{bilan.texte}</Notice>
                )
              ) : null}
              <span className={s.gestes}>
                {ecriture.aReprendre ? (
                  <Button variant="primary" disabled={Boolean(devis?.manque)} onClick={() => void ecriture.reprendre()}>
                    {libelleReprise(ecriture.aReprendre)}
                  </Button>
                ) : null}
                {ecriture.aEnregistrer ? (
                  <Button variant="primary" onClick={() => void ecriture.reprendre()}>
                    Réessayer de l'enregistrer
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={fermer}>
                  {ecriture.fini && ecriture.conservee ? 'Écrire une autre hypnose' : 'Fermer'}
                </Button>
              </span>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  )
}

/* Les hypnoses du cabinet --------------------------------------------------- */

function ListeBibliotheque({
  biblio,
  ecriture,
  ouverte,
  onOuvrir,
  attribution,
  onAttribuer,
}: {
  biblio: BibliothequeData
  ecriture: EcritureBibliotheque
  ouverte: string
  onOuvrir: (id: string) => void
  attribution: string
  onAttribuer: (id: string) => void
}) {
  const auth = useMaybeAuth()
  const devis = useDevis('hypnose')
  const [notice, setNotice] = useState<{ ton: 'ok' | 'warn'; texte: string } | null>(null)
  const [retrait, setRetrait] = useState('')
  const [pdf, setPdf] = useState('')
  const { etat, liste } = biblio

  async function retirer(h: HypnoseDeBibliotheque) {
    setRetrait(h.id)
    setNotice(null)
    const r = await biblio.supprimer(h)
    setRetrait('')
    setNotice({ ton: r.ok ? 'ok' : 'warn', texte: r.message })
    if (r.ok) {
      if (ouverte === h.id) onOuvrir('')
      if (attribution === h.id) onAttribuer('')
    }
  }

  async function enregistrerPdf(h: HypnoseDeBibliotheque) {
    if (pdf) return
    setPdf(h.id)
    try {
      // La marque du cabinet : son logo s'il en a déposé un, sa couleur d'accent.
      const branding = auth?.context?.cabinet?.branding
      await telechargerHypnose(hypnosePourPdf(h), '', auth?.context?.cabinet?.name ?? '', {
        logo: await logoPourPdf(branding?.logoUrl),
        accent: branding?.accent ?? null,
      })
    } catch {
      setNotice({ ton: 'warn', texte: "Le PDF n'a pas pu être fabriqué. Réessayez." })
    }
    setPdf('')
  }

  return (
    <Card padded={false} className={s.liste}>
      <div className={s.listeTete}>
        <Title as="h2">Hypnoses du cabinet</Title>
        {liste.length ? <span className={s.compte}>{plural(liste.length, 'hypnose', 'hypnoses')}</span> : null}
      </div>
      <p className={s.sousTitre}>
        Écrites en séance ou dans l'atelier, réutilisables pour d'autres patients.
      </p>

      {etat === 'demo' ? (
        <p className={s.aide}>
          Bibliothèque de démonstration : elle se lit et se télécharge, rien ne s'y enregistre.
        </p>
      ) : null}
      {etat === 'chargement' && !liste.length ? <p className={s.aide}>Lecture de la bibliothèque…</p> : null}
      {etat === 'echec' ? (
        <Notice tone="warn">
          La bibliothèque n'a pas pu être lue. Ce qui manque ici n'est pas vide : il n'a pas été chargé.{' '}
          <button type="button" className={s.lien} onClick={() => void biblio.recharger()}>
            Relire
          </button>
        </Notice>
      ) : null}
      {etat === 'indisponible' ? (
        <Notice tone="warn">
          La bibliothèque d'hypnoses n'est pas encore disponible sur votre cabinet. Réessayez plus tard, ou
          prévenez l'assistance.
        </Notice>
      ) : null}
      {notice?.texte ? <Notice tone={notice.ton}>{notice.texte}</Notice> : null}

      {(etat === 'pret' || etat === 'demo') && liste.length === 0 ? (
        <p className={s.vide}>
          Aucune hypnose pour l'instant. Celles que vous écrirez en séance la rejoindront en se refermant ;
          celles que vous créez ici aussi.
        </p>
      ) : null}

      {liste.length ? (
        <ul className={s.items}>
          {liste.map((h) => {
            const enCours = ecriture.ecriture && ecriture.ligne === h.id
            const ouvert = ouverte === h.id
            const choix = attribution === h.id
            const manquant = h.complete ? null : (pointDeReprise(h.mouvements).restants[0] ?? null)
            return (
              <li key={h.id} className={s.item}>
                <div className={s.ligne}>
                  <div className={s.texteLigne}>
                    <span className={s.titreLigne}>{h.titre}</span>
                    <span className={s.meta}>{metaDeLaBibliotheque(h, enCours)}</span>
                  </div>
                  {!enCours ? (
                    <div className={s.actions}>
                      <button
                        type="button"
                        className={s.petit}
                        aria-expanded={ouvert}
                        onClick={() => onOuvrir(ouvert ? '' : h.id)}
                      >
                        {ouvert ? 'Fermer' : 'Ouvrir'}
                      </button>
                      {h.complete ? (
                        <button
                          type="button"
                          className={s.petit}
                          aria-expanded={choix}
                          onClick={() => onAttribuer(choix ? '' : h.id)}
                        >
                          Attribuer à…
                        </button>
                      ) : manquant && h.origine === 'atelier' ? (
                        <button
                          type="button"
                          className={s.petit}
                          disabled={ecriture.ecriture || !biblio.gestes || Boolean(devis?.manque)}
                          onClick={() => void ecriture.reprendreLigne(h)}
                        >
                          {libelleReprise(manquant)}
                        </button>
                      ) : null}
                      <GesteAConfirmer
                        libelle="Supprimer"
                        confirmer="Retirer de la bibliothèque"
                        libelleEnCours="Suppression…"
                        enCours={retrait === h.id}
                        disabled={Boolean(retrait) && retrait !== h.id}
                        onConfirmer={() => void retirer(h)}
                        consequence={consequenceDeLaSuppression(h.titre)}
                      />
                    </div>
                  ) : null}
                </div>

                {choix && !enCours ? (
                  <Attribution
                    hypnose={h}
                    attribuer={biblio.attribuer}
                    onFermer={() => onAttribuer('')}
                  />
                ) : null}

                {ouvert && !enCours ? (
                  <div className={s.corps}>
                    <RenommerHypnose key={`${h.id}:${h.titre}`} hypnose={h} renommer={biblio.renommer} />
                    {h.intention ? (
                      <p className={s.intentionLue}>
                        <Overline>Intention</Overline> {h.intention}
                      </p>
                    ) : null}
                    {h.mouvements.map((m) => (
                      <TexteMouvement
                        key={m.mouvement}
                        ecrit={m}
                        classes={{ article: s.mouvement, titre: s.mouvementTitre, para: s.para }}
                        onCorriger={ecriture.ecriture ? undefined : (texte) => biblio.corrigerMouvement(h, m, texte)}
                      />
                    ))}
                    <div className={s.piedLecture}>
                      <Button
                        variant="secondary"
                        disabled={pdf === h.id || !h.mouvements.length}
                        onClick={() => void enregistrerPdf(h)}
                        aria-label={`Télécharger « ${h.titre} » en PDF`}
                      >
                        {pdf === h.id ? 'Préparation…' : 'Télécharger le PDF'}
                      </Button>
                      <span className={s.aide}>
                        Une correction change la copie de la bibliothèque ; les patients qui l'ont déjà
                        reçue gardent la leur.
                      </span>
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </Card>
  )
}

/* Le titre ------------------------------------------------------------------------ */

/**
 * Le titre se corrige à part des mouvements : c'est par lui qu'on retrouve
 * l'hypnose dans la liste, et une induction retitrée par l'IA ne dit pas
 * toujours ce qu'on cherchera. Le bouton ne paraît qu'une fois le titre changé.
 */
function RenommerHypnose({
  hypnose,
  renommer,
}: {
  hypnose: HypnoseDeBibliotheque
  renommer: BibliothequeData['renommer']
}) {
  const [saisie, setSaisie] = useState(hypnose.titre)
  const [envoi, setEnvoi] = useState(false)
  const [refus, setRefus] = useState('')
  const change = saisie.trim() !== hypnose.titre

  async function enregistrer() {
    if (!change || envoi) return
    setEnvoi(true)
    setRefus('')
    const r = await renommer(hypnose, saisie)
    setEnvoi(false)
    if (!r.ok) setRefus(r.message)
  }

  return (
    <div className={s.renommer}>
      <label className={s.champ}>
        <Overline>Titre</Overline>
        <TextInput
          className={s.titre}
          value={saisie}
          maxLength={300}
          disabled={envoi}
          onChange={(e) => setSaisie(e.target.value)}
          aria-label={`Titre de l'hypnose « ${hypnose.titre} »`}
        />
      </label>
      {change ? (
        <span className={s.gestes}>
          <Button variant="secondary" disabled={envoi || !saisie.trim()} onClick={() => void enregistrer()}>
            {envoi ? 'Enregistrement…' : 'Enregistrer le titre'}
          </Button>
          <Button variant="ghost" disabled={envoi} onClick={() => setSaisie(hypnose.titre)}>
            Annuler
          </Button>
        </span>
      ) : null}
      {refus ? <Notice tone="warn">{refus}</Notice> : null}
    </div>
  )
}

/* Attribuer à… ------------------------------------------------------------------ */

/**
 * Le choix des patients, comme pour un module : des cases, puis un bouton qui
 * dit à combien. Chacun reçoit une copie complète dans sa fiche ; « déjà
 * attribuée » évite d'en donner deux à la même personne sans le savoir.
 */
export function Attribution({
  hypnose,
  attribuer,
  onFermer,
}: {
  hypnose: HypnoseDeBibliotheque
  attribuer: BibliothequeData['attribuer']
  onFermer: () => void
}) {
  const { state } = useStore()
  const [coches, setCoches] = useState<Record<PatientId, boolean>>({})
  const [envoi, setEnvoi] = useState(false)
  const [retour, setRetour] = useState<{ ton: 'ok' | 'warn'; texte: string } | null>(null)
  const choisis = state.patientOrder.filter((key) => coches[key])

  async function envoyer() {
    if (!choisis.length || envoi) return
    setEnvoi(true)
    setRetour(null)
    const r = await attribuer(hypnose, choisis)
    setEnvoi(false)
    setRetour({ ton: r.ok ? 'ok' : 'warn', texte: r.message })
    if (r.ok) setCoches({})
  }

  return (
    <div className={s.attribution}>
      {hypnose.origine === 'seance' ? <Notice tone="warn">{AVERTISSEMENT_SEANCE}</Notice> : null}
      <div className={s.attributionTete}>
        <span className={s.attributionTitre}>Attribuer à</span>
        <span className={s.compte}>
          {choisis.length
            ? plural(choisis.length, 'patient sélectionné', 'patients sélectionnés')
            : 'Aucun patient sélectionné'}
        </span>
      </div>
      {state.patientOrder.length ? (
        <div className={s.patients}>
          {state.patientOrder.map((key) => {
            const patient = state.patients[key]
            if (!patient) return null
            const on = Boolean(coches[key])
            const deja = hypnose.attribueeA.includes(key)
            return (
              <button
                key={key}
                type="button"
                className={on ? `${s.patient} ${s.patientOn}` : s.patient}
                aria-pressed={on}
                onClick={() => setCoches((prev) => ({ ...prev, [key]: !prev[key] }))}
              >
                <span className={on ? `${s.case} ${s.caseOn}` : s.case} aria-hidden>
                  {on ? '✓' : ''}
                </span>
                <span className={s.patientTexte}>
                  <span className={s.patientNom}>{patient.name}</span>
                  <span className={s.patientSous}>{patient.subtitle}</span>
                </span>
                {deja ? <span className={s.deja}>déjà attribuée</span> : null}
              </button>
            )
          })}
        </div>
      ) : (
        <p className={s.aide}>Aucun patient suivi pour l'instant : ajoutez une fiche, puis revenez.</p>
      )}
      <div className={s.attributionPied}>
        <Button variant="primary" disabled={!choisis.length || envoi} onClick={() => void envoyer()}>
          {envoi
            ? 'Attribution…'
            : choisis.length
              ? `Attribuer à ${plural(choisis.length, 'patient', 'patients')}`
              : 'Attribuer'}
        </Button>
        <Button variant="ghost" disabled={envoi} onClick={onFermer}>
          Fermer
        </Button>
        <span className={s.aide}>Chacun reçoit sa copie, dans la liste des hypnoses de sa fiche.</span>
      </div>
      {retour?.texte ? <Notice tone={retour.ton}>{retour.texte}</Notice> : null}
    </div>
  )
}
