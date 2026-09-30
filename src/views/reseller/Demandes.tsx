/**
 * L'onglet « Demandes » de l'espace revendeur : les demandes d'essai laissées
 * sur la page d'accueil de la plateforme (0060).
 *
 * Seul le revendeur qui ACCUEILLE ces demandes voit l'onglet ; la base, elle,
 * ne rend les lignes qu'à ses membres. On y lit la demande, on la classe
 * (nouvelle, contactée, cabinet ouvert, sans suite), on y garde une note
 * interne — et « Ouvrir le cabinet » pré-remplit le formulaire d'ouverture
 * du portefeuille, où le revendeur vérifie l'identifiant avant d'ouvrir.
 *
 * Une demande contient une adresse et un téléphone : des données
 * personnelles, pas des données de santé. On n'en garde que ce que la
 * personne a écrit, et on peut l'effacer.
 */
import { useEffect, useState } from 'react'
import { Button, EmptyState, Notice, Pill, Segmented, TextArea } from '@/components/ui'
import {
  invitationPourLaDemande,
  libelleFourchette,
  libelleOffre,
  libelleStatut,
  NOTE_MAX,
  preremplissage,
  STATUTS,
  type DemandeEssai,
  type StatutDemande,
} from '@/lib/demandesRevendeur'
import { useResellerData } from '@/reseller/context'
import type { DonneesDemandes, Geste } from '@/reseller/useDemandes'
import { useStore } from '@/state/store'
import type { PlanCode } from '@/types/reseller'
import s from './Demandes.module.css'

/** « 28 sept. 2026, 10 h 40 » */
function moment(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function tonDuStatut(statut: string): 'accent' | 'neutral' | 'ok' | 'warn' {
  if (statut === 'nouvelle') return 'accent'
  if (statut === 'ouverte') return 'ok'
  return 'neutral'
}

function Detail({ demande, donnees }: { demande: DemandeEssai; donnees: DonneesDemandes }) {
  const { set } = useStore()
  const { invitations, offres } = useResellerData()
  const [note, setNote] = useState(demande.note_interne)
  const [enCours, setEnCours] = useState(false)
  const [retour, setRetour] = useState<Geste | null>(null)
  const [effacer, setEffacer] = useState(false)
  const dejaInvitee = invitationPourLaDemande(demande, invitations)

  async function agir(geste: () => Promise<Geste>) {
    if (enCours) return
    setEnCours(true)
    setRetour(null)
    const r = await geste()
    setEnCours(false)
    setRetour(r)
  }

  function ouvrirLeCabinet() {
    const { rNewPlan, ...champs } = preremplissage(
      demande,
      offres.map((o) => o.code),
    )
    set({
      ...champs,
      ...(rNewPlan ? { rNewPlan: rNewPlan as PlanCode } : {}),
      rView: 'portfolio',
      rNewOpen: true,
      rNotice: `Le formulaire d’ouverture est pré-rempli avec la demande de ${demande.nom}. Vérifiez l’identifiant — il fait l’adresse du cabinet — puis ouvrez-le. La demande restera à marquer « Cabinet ouvert ».`,
      rNoticeTon: 'ok',
    })
    window.scrollTo({ top: 0 })
  }

  return (
    <section className={s.detail} aria-labelledby={`demande-${demande.id}`}>
      <div className={s.detailTete}>
        <div>
          <h2 id={`demande-${demande.id}`} className={s.detailNom}>
            {demande.nom}
          </h2>
          <p className={s.detailSous}>
            {demande.cabinet} · {demande.ville}
          </p>
        </div>
        <Pill tone={tonDuStatut(demande.statut)}>{libelleStatut(demande.statut)}</Pill>
      </div>

      <dl className={s.fiche}>
        <div>
          <dt>Adresse</dt>
          <dd>
            <a href={`mailto:${demande.email}`}>{demande.email}</a>
          </dd>
        </div>
        <div>
          <dt>Téléphone</dt>
          <dd>{demande.telephone ? <a href={`tel:${demande.telephone.replace(/[^0-9+]/g, '')}`}>{demande.telephone}</a> : '—'}</dd>
        </div>
        <div>
          <dt>Patients suivis</dt>
          <dd>{libelleFourchette(demande.patients)}</dd>
        </div>
        <div>
          <dt>Offre qui l’intéresse</dt>
          <dd>{libelleOffre(demande.offre)}</dd>
        </div>
        <div>
          <dt>Reçue</dt>
          <dd>{moment(demande.created_at)}</dd>
        </div>
        <div>
          <dt>Consentement au recontact</dt>
          <dd>donné le {moment(demande.consentement_le)}</dd>
        </div>
      </dl>

      {demande.message ? (
        <div className={s.message}>
          <p className={s.etiquette}>Son message</p>
          <p className={s.messageTexte}>{demande.message}</p>
        </div>
      ) : null}

      {dejaInvitee && demande.statut !== 'ouverte' ? (
        <Notice tone="ok" style={{ marginBottom: 16 }}>
          Une invitation d’ouverture attend déjà cette adresse : le cabinet a été ouvert.{' '}
          <button
            type="button"
            className={s.lienBouton}
            disabled={enCours}
            onClick={() => void agir(() => donnees.changerStatut(demande.id, 'ouverte'))}
          >
            Marquer « Cabinet ouvert »
          </button>
        </Notice>
      ) : null}

      <div className={s.bloc}>
        <p className={s.etiquette} id={`statut-${demande.id}`}>
          Statut{demande.statut_le ? <span className={s.date}> · changé le {moment(demande.statut_le)}</span> : null}
        </p>
        <div role="group" aria-labelledby={`statut-${demande.id}`}>
          <Segmented
            options={STATUTS.map((st) => ({ value: st.valeur, label: st.libelle }))}
            value={demande.statut}
            onChange={(statut: StatutDemande) => void agir(() => donnees.changerStatut(demande.id, statut))}
          />
        </div>
      </div>

      <div className={s.bloc}>
        <label className={s.etiquette} htmlFor={`note-${demande.id}`}>
          Note interne
        </label>
        <TextArea
          dictee
          id={`note-${demande.id}`}
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Rappelée le…, rendez-vous de démonstration…"
        />
        <div className={s.actionsNote}>
          <Button
            variant="secondary"
            disabled={enCours || note === demande.note_interne}
            onClick={() => void agir(() => donnees.enregistrerNote(demande.id, note))}
          >
            Enregistrer la note
          </Button>
        </div>
      </div>

      {retour ? (
        <Notice tone={retour.ok ? 'ok' : 'warn'} style={{ marginBottom: 16 }}>
          {retour.message}
        </Notice>
      ) : null}

      <div className={s.actions}>
        <Button variant="primary" onClick={ouvrirLeCabinet}>
          Ouvrir le cabinet
        </Button>
        {effacer ? (
          <span className={s.confirmation}>
            <span>Effacer définitivement cette demande ?</span>
            <Button
              variant="secondary"
              disabled={enCours}
              onClick={() =>
                void agir(async () => {
                  const r = await donnees.effacer(demande.id)
                  if (r.ok) setEffacer(false)
                  return r
                })
              }
            >
              Effacer
            </Button>
            <Button variant="ghost" onClick={() => setEffacer(false)}>
              Annuler
            </Button>
          </span>
        ) : (
          <Button variant="danger" onClick={() => setEffacer(true)}>
            Effacer la demande
          </Button>
        )}
      </div>
    </section>
  )
}

export function Demandes({ donnees }: { donnees: DonneesDemandes }) {
  const [choisie, setChoisie] = useState<string | null>(null)
  const actuelle = donnees.demandes.find((d) => d.id === choisie) ?? donnees.demandes[0] ?? null

  /* Une demande effacée ne laisse pas l'écran pointer dans le vide. */
  useEffect(() => {
    if (choisie && !donnees.demandes.some((d) => d.id === choisie)) setChoisie(null)
  }, [choisie, donnees.demandes])

  return (
    <div>
      {!donnees.reel ? (
        <p className={s.demo}>Démonstration : deux demandes fictives, rien n’est enregistré.</p>
      ) : null}
      {donnees.erreur ? (
        <Notice tone="warn" style={{ marginBottom: 16 }}>
          {donnees.erreur}{' '}
          <button type="button" className={s.lienBouton} onClick={() => void donnees.recharger()}>
            Réessayer
          </button>
        </Notice>
      ) : null}

      {donnees.chargement ? (
        <p className={s.demo}>Lecture des demandes…</p>
      ) : donnees.demandes.length === 0 ? (
        <EmptyState>
          Aucune demande pour l’instant. Celles que laissent les praticiennes sur la page d’accueil
          arrivent ici, les nouvelles en tête.
        </EmptyState>
      ) : (
        <div className={s.grille}>
          <ul className={s.liste} aria-label="Demandes d’essai">
            {donnees.demandes.map((d) => {
              const on = actuelle?.id === d.id
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    className={on ? `${s.ligne} ${s.ligneOn}` : s.ligne}
                    aria-pressed={on}
                    onClick={() => setChoisie(d.id)}
                  >
                    <span className={s.ligneNoms}>
                      <span className={d.statut === 'nouvelle' ? `${s.ligneNom} ${s.nouvelle}` : s.ligneNom}>{d.nom}</span>
                      <span className={s.ligneSous}>
                        {d.cabinet} · {d.ville}
                      </span>
                      <span className={s.ligneDate}>{moment(d.created_at)}</span>
                    </span>
                    <Pill tone={tonDuStatut(d.statut)}>{libelleStatut(d.statut)}</Pill>
                  </button>
                </li>
              )
            })}
          </ul>
          {actuelle ? <Detail key={actuelle.id} demande={actuelle} donnees={donnees} /> : null}
        </div>
      )}
    </div>
  )
}
