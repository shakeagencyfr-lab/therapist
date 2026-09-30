import { useEffect, useState } from 'react'
import { useMaybeAuth } from '@/auth/session'
import { GesteAConfirmer } from '@/components/GesteAConfirmer'
import { Button, EmptyState, FieldLabel, Marque, Notice, Pill, StatCard, TextInput } from '@/components/ui'
import {
  auteurDit,
  dateDuContrat,
  libelleContrat,
  noteDuContrat,
  phraseDuJournal,
  tonContrat,
  type EntreeJournal,
} from '@/lib/contrat'
import { adresseCabinet } from '@/lib/domaine'
import { adressePlausible, echeanceDite, invitationExpiree, libelleRole } from '@/lib/equipe'
import { dateLongue, euroCents, plural } from '@/lib/format'
import {
  consequencesFermeture,
  depenseAnalyseDite,
  fermetureDite,
  praticiennesDites,
} from '@/lib/revendeur'
import { useResellerData } from '@/reseller/context'
import { useJetonsRevendeur } from '@/reseller/useJetonsRevendeur'
import type { Exceptions, ReglageContrat, Resultat } from '@/reseller/useReseller'
import { adherenceLabel, levierOuvert, maxPatientsOf } from '@/state/resellerSelectors'
import { useStore } from '@/state/store'
import { LEVIERS, type PortfolioRow } from '@/types/reseller'
import { InvitationOuverture } from './CabinetPortfolio'
import { LigneException } from './PlansView'
import s from './FicheCabinet.module.css'

/**
 * La fiche d'un cabinet, chez le revendeur.
 *
 * Cliquer un cabinet du portefeuille ouvrait l'éditeur de marque : le seul
 * écran qui existait. Le revendeur n'avait nulle part où lire, d'un coup, ce
 * qui le regarde d'un cabinet — son contrat et ses échéances, son offre, ses
 * praticiennes, ses chiffres, l'histoire de son contrat — ni où faire le
 * geste qui manquait le plus : le fermer, et le rouvrir.
 *
 * Toujours sans un patient ni un dossier : les chiffres sont des compteurs,
 * et l'assiduité s'efface sous trois fiches actives comme partout ailleurs.
 */
export function FicheCabinet() {
  const { rows, fermes, chargement, erreur } = useResellerData()
  const { state, set } = useStore()
  const row = [...rows, ...fermes].find((r) => r.cabinet.id === state.rSel)

  const retour = (
    <div className={s.retour}>
      <Button variant="ghost" onClick={() => set({ rView: 'portfolio' })}>
        ← Portefeuille
      </Button>
    </div>
  )

  if (!row) {
    return (
      <>
        {retour}
        {erreur ? (
          <Notice tone="warn" style={{ marginBottom: 18 }}>
            {erreur}
          </Notice>
        ) : null}
        {chargement ? (
          <p className={s.hint}>Chargement de la fiche…</p>
        ) : (
          <EmptyState>
            Ce cabinet n'est pas, ou plus, dans votre portefeuille. Revenez au portefeuille pour en
            choisir un autre.
          </EmptyState>
        )}
      </>
    )
  }

  return (
    <>
      {retour}
      {/* Changer de cabinet repart de sa fiche : la clé jette l'état du précédent. */}
      <Fiche key={row.cabinet.id} row={row} />
    </>
  )
}

function Fiche({ row }: { row: PortfolioRow }) {
  const {
    reel,
    praticiennes,
    invitations,
    offres,
    erreur,
    fermerCabinet,
    lireJournalDuCabinet,
    reglerContrat,
    reglerExceptions,
    inviterPraticienne,
    relancerInvitation,
    changerInvitation,
    annulerInvitation,
  } = useResellerData()
  const { state, set } = useStore()
  /* Fermer et rouvrir sont au PROPRIÉTAIRE du compte (0057) : on ne montre
     pas le bouton à qui la base le refuserait. */
  const proprietaire = useMaybeAuth()?.context?.reseller?.role === 'owner'
  /* En jetons (0065), la dépense d'analyse n'est plus celle du cabinet : c'est
     la clé du revendeur qui la paie. La note sous les chiffres le dit. */
  const modeJetons = useJetonsRevendeur()?.etat?.mode === 'jetons'

  const id = row.cabinet.id
  const nom = row.cabinet.name
  const ferme = row.cabinet.archived
  const c = row.subscription
  const equipe = praticiennes.filter((p) => p.cabinet_id === id)
  const attente = invitations.filter((i) => i.cabinet_id === id)
  const ouverture = attente.find((i) => i.role === 'owner')
  const consoeurs = attente.filter((i) => i.role !== 'owner')

  const [echec, setEchec] = useState('')
  const [enCours, setEnCours] = useState('')

  /** Les messages du geste précédent ne survivent pas au suivant. */
  function nettoyer() {
    setEchec('')
    if (state.rNotice) set({ rNotice: '' })
  }

  /** Un geste à la fois, et ce qu'on en dit. Vrai s'il a abouti. */
  async function agir(cle: string, geste: () => Promise<Resultat>): Promise<boolean> {
    if (enCours) return false
    setEnCours(cle)
    nettoyer()
    const r = await geste()
    setEnCours('')
    if (r.ok) set({ rNotice: r.message, rNoticeTon: r.partiel ? 'warn' : 'ok' })
    else setEchec(r.message)
    return r.ok
  }

  /* L'historique se relit quand le contrat bouge — un statut changé ici, une
     fermeture, un collègue dans un autre onglet — et à l'ouverture. */
  const signature = [
    c.plan,
    c.status,
    c.trialEndsAt ?? '',
    c.periodEndAt ?? '',
    c.maxPatientsOverride ?? '',
    c.shopOverride ?? '',
    c.marqueBlancheOverride ?? '',
    c.siteOverride ?? '',
    ferme ? 'ferme' : 'ouvert',
  ].join('|')
  const [journal, setJournal] = useState<{ lu: boolean; entrees: EntreeJournal[]; erreur: string }>({
    lu: false,
    entrees: [],
    erreur: '',
  })
  useEffect(() => {
    let vivant = true
    void lireJournalDuCabinet(id).then((r) => {
      if (vivant) setJournal({ lu: true, entrees: r.entrees, erreur: r.erreur })
    })
    return () => {
      vivant = false
    }
  }, [id, lireJournalDuCabinet, signature])

  function nomOffre(code: string): string {
    return offres.find((p) => p.code === code)?.label ?? code
  }

  const max = maxPatientsOf(c, row.plan)
  const assiduite = adherenceLabel(row)
  const ouverts = LEVIERS.filter((l) => levierOuvert(c, row.plan, l.code))
  const date = dateDuContrat(c)

  return (
    <>
      {erreur ? (
        <Notice tone="warn" style={{ marginBottom: 18 }}>
          {erreur}
        </Notice>
      ) : null}
      {state.rNotice ? (
        <Notice tone={state.rNoticeTon} style={{ marginBottom: 18 }}>
          {state.rNotice}
        </Notice>
      ) : null}
      {echec ? (
        <Notice tone="warn" style={{ marginBottom: 18 }}>
          {echec}
        </Notice>
      ) : null}

      <section className={s.tete}>
        <Marque
          className={s.marque}
          style={{ background: ferme ? 'var(--c-text-faint)' : row.cabinet.branding.accent }}
          logo={row.cabinet.branding.logo}
          url={row.cabinet.branding.logoUrl}
        />
        <div className={s.identite}>
          <h2 className={s.nom}>{nom}</h2>
          <p className={s.sous}>
            {adresseCabinet(row.cabinet.slug)} · {row.cabinet.since}
          </p>
        </div>
        <div className={s.etat}>
          {ferme ? (
            <Pill tone="neutral">{fermetureDite(row.cabinet.fermeLe)}</Pill>
          ) : (
            <Pill tone={tonContrat(c)}>{libelleContrat(c)}</Pill>
          )}
          {!ferme ? (
            <Button onClick={() => set({ rView: 'brand', rSel: id, rNotice: '' })}>Éditer la marque</Button>
          ) : null}
        </div>
      </section>

      {!reel ? (
        <p className={s.hint}>Démonstration : ce cabinet est fictif. Connectez-vous pour voir les vôtres.</p>
      ) : null}

      {ferme ? (
        <Notice tone="hot" style={{ marginBottom: 18 }}>
          {nom} est fermé{row.cabinet.fermeLe ? ` depuis le ${dateLongue(row.cabinet.fermeLe)}` : ''}. Ses
          patients n'ont plus accès à leur espace, sa page publique ne répond plus, et personne ne peut
          y entrer. Rien n'a été effacé : sa praticienne garde ses dossiers, et tout revient à la
          réouverture.
        </Notice>
      ) : null}

      <div className={s.chiffres}>
        <StatCard
          label="Fiches actives"
          value={row.stats.patientsActive}
          unit={max === null ? 'sans plafond' : `sur ${max}`}
          progress={max ? Math.min(100, (row.stats.patientsActive / max) * 100) : 100}
        />
        <StatCard
          label="Assiduité"
          value={assiduite.value}
          unit={assiduite.suppressed ? 'masquée sous trois fiches' : 'sur sept jours'}
          progress={assiduite.suppressed ? 0 : (row.stats.adherenceAvg ?? 0)}
        />
        <StatCard label="Séances" value={row.stats.sessions30d} unit="sur 30 jours" progress={100} />
        <StatCard
          label="Analyse"
          value={depenseAnalyseDite(row.stats.analyseCentsMois)}
          unit="ce mois-ci"
          progress={100}
        />
      </div>
      <p className={s.note}>
        {modeJetons
          ? "Vos jetons sont activés : cette dépense d'analyse est payée par votre clé, et le cabinet la règle en jetons (onglet Jetons IA)."
          : "La dépense d'analyse est réglée par le cabinet, sur sa propre clé : elle ne vous est pas imputée. Elle sert à répondre à une praticienne qui s'étonne de sa facture."}
      </p>

      <div className={s.grille}>
        <div className={s.colonne}>
          <section className={s.panel}>
            <h3 className={s.titre}>Contrat et offre</h3>
            <dl className={s.faits}>
              <div>
                <dt>Offre</dt>
                <dd>
                  {row.plan.label}
                  {row.plan.priceCents ? ` · ${euroCents(row.plan.priceCents)} par mois` : ''}
                </dd>
              </div>
              <div>
                <dt>Contrat</dt>
                <dd>{libelleContrat(c)}</dd>
              </div>
              <div>
                <dt>{c.status === 'essai' ? "Fin de l'essai" : 'Échéance'}</dt>
                <dd>{date || '—'}</dd>
              </div>
              <div>
                <dt>Ce qu'elle ouvre</dt>
                <dd>
                  {max === null ? 'Fiches sans limite' : plural(max, 'fiche active', 'fiches actives')}
                  {ouverts.length ? `, ${ouverts.map((l) => l.label.toLowerCase()).join(', ')}` : ', application seule'}
                </dd>
              </div>
            </dl>
            <p className={s.aide}>{noteDuContrat(c)}</p>
            {/* Le même éditeur que l'écran Offres : un seul composant pour un
                seul contrat. Un cabinet fermé garde son contrat réglable — on
                peut le résilier après l'avoir fermé. */}
            <LigneException
              row={row}
              onSave={async (champs: Exceptions) => {
                await agir('exception', () => reglerExceptions(id, champs))
              }}
              onContrat={(reglage: ReglageContrat) => agir('contrat', () => reglerContrat(id, reglage))}
            />
          </section>

          <section className={s.panel}>
            <h3 className={s.titre}>Historique du contrat</h3>
            {!journal.lu ? <p className={s.hint}>Lecture de l'historique…</p> : null}
            {journal.erreur ? <Notice tone="warn">{journal.erreur}</Notice> : null}
            {journal.lu && !journal.erreur && !journal.entrees.length ? (
              <p className={s.hint}>
                {reel
                  ? 'Aucun changement enregistré pour ce cabinet.'
                  : "L'historique des cabinets de démonstration n'est pas tenu."}
              </p>
            ) : null}
            {journal.entrees.length ? (
              <ul className={s.journal}>
                {journal.entrees.map((e, i) => (
                  <li key={`${e.quand}-${i}`} className={s.journalLigne}>
                    <span className={s.journalQuand}>{dateLongue(e.quand)}</span>
                    <span>
                      {phraseDuJournal(e, nomOffre)} <span className={s.journalAuteur}>{auteurDit(e.auteur)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>

        <div className={s.colonne}>
          <section className={s.panel}>
            <div className={s.titreLigne}>
              <h3 className={s.titre}>Praticiennes</h3>
              <span className={s.compte}>{praticiennesDites(equipe.length)}</span>
            </div>
            {equipe.length ? (
              <ul className={s.liste}>
                {equipe.map((m, i) => (
                  <li key={`${m.display_name}-${i}`} className={s.ligne}>
                    <span className={s.qui}>{m.display_name}</span>
                    <Pill tone={m.role === 'owner' ? 'accent' : 'neutral'}>{libelleRole(m.role)}</Pill>
                  </li>
                ))}
              </ul>
            ) : null}

            {!equipe.length && reel && !ferme ? (
              ouverture ? (
                <InvitationOuverture
                  invitation={ouverture}
                  cabinet={nom}
                  enCours={enCours === 'invitation'}
                  onGeste={(geste, saisie) =>
                    agir('invitation', () =>
                      geste === 'relancer'
                        ? relancerInvitation(ouverture.id)
                        : geste === 'annuler'
                          ? annulerInvitation(ouverture.id)
                          : changerInvitation(ouverture.id, saisie?.email ?? '', saisie?.nom),
                    )
                  }
                />
              ) : (
                <InviterTitulaire
                  cabinet={nom}
                  enCours={enCours === 'invitation'}
                  onInviter={(email, nomSaisi) =>
                    agir('invitation', () => inviterPraticienne(id, email, nomSaisi))
                  }
                />
              )
            ) : null}

            {!equipe.length && ferme ? (
              <p className={s.hint}>Aucune praticienne, et personne n'entre dans un cabinet fermé.</p>
            ) : null}
            {!equipe.length && !reel ? <p className={s.hint}>{row.cabinet.therapist}</p> : null}

            {consoeurs.length ? (
              <>
                <p className={s.aide}>
                  {plural(consoeurs.length, "invitation d'équipe en attente", "invitations d'équipe en attente")},
                  de la main de la titulaire :
                </p>
                <ul className={s.liste}>
                  {consoeurs.map((i) => (
                    <li key={i.id} className={s.ligne}>
                      <span className={s.qui}>{i.display_name ? `${i.display_name} · ${i.email}` : i.email}</span>
                      <span className={invitationExpiree(i.expires_at) ? s.echue : s.compte}>
                        {echeanceDite(i.expires_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {ferme && attente.length ? (
              <p className={s.aide}>Les invitations en attente reprendront à la réouverture, si elles courent encore.</p>
            ) : null}
          </section>

          <section className={s.panel}>
            <h3 className={s.titre}>{ferme ? 'Rouvrir le cabinet' : 'Fermer le cabinet'}</h3>
            {ferme ? (
              <p className={s.aide}>
                Rouvrir rend aussitôt à ses patients leur espace, et à sa page publique sa réponse. Ses
                options — boutique, site, domaine, analyse — ne reviennent que si son contrat est en
                règle.
              </p>
            ) : (
              <p className={s.aide}>
                Pour un cabinet qui cesse son activité ou quitte votre réseau. La fermeture ne touche
                pas au contrat
                {c.status === 'actif' ? ' : il reste « actif », pensez à le résilier ci-dessus s’il ne doit plus être facturé' : ''}
                .
              </p>
            )}
            {!proprietaire ? (
              <p className={s.hint}>Seul un propriétaire du compte revendeur ferme ou rouvre un cabinet.</p>
            ) : ferme ? (
              <Button
                variant="primary"
                disabled={enCours !== ''}
                onClick={() => void agir('rouvrir', () => fermerCabinet(id, false))}
              >
                {enCours === 'rouvrir' ? 'Réouverture…' : 'Rouvrir le cabinet'}
              </Button>
            ) : (
              <GesteAConfirmer
                libelle="Fermer le cabinet…"
                consequence={consequencesFermeture(nom, row.stats.patientsActive)}
                confirmer={`Fermer ${nom}`}
                enCours={enCours === 'fermer'}
                libelleEnCours="Fermeture…"
                disabled={enCours !== '' && enCours !== 'fermer'}
                onConfirmer={() => void agir('fermer', () => fermerCabinet(id, true))}
              />
            )}
          </section>
        </div>
      </div>
    </>
  )
}

/** Inviter la titulaire d'un cabinet encore vide, depuis sa fiche. */
function InviterTitulaire({
  cabinet,
  enCours,
  onInviter,
}: {
  cabinet: string
  enCours: boolean
  onInviter: (email: string, nom: string) => Promise<boolean>
}) {
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  return (
    <div className={s.invite}>
      <p className={s.aide}>
        Ce cabinet attend sa praticienne. Elle recevra un lien de connexion, valable trente jours,
        et deviendra propriétaire de ses données : vous n'y entrez pas.
      </p>
      <label className={s.champ}>
        <FieldLabel>Praticienne</FieldLabel>
        <TextInput
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Claire Fontaine"
          aria-label={`Nom de la praticienne de ${cabinet}`}
        />
      </label>
      <label className={s.champ}>
        <FieldLabel>Courriel d'invitation</FieldLabel>
        <TextInput
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="claire@cabinet-fontaine.fr"
          aria-label={`Courriel d'invitation pour ${cabinet}`}
        />
      </label>
      <div>
        <Button
          variant="primary"
          disabled={enCours || !adressePlausible(email)}
          onClick={async () => {
            if (await onInviter(email, nom)) {
              setNom('')
              setEmail('')
            }
          }}
        >
          {enCours ? 'Invitation…' : 'Inviter'}
        </Button>
      </div>
    </div>
  )
}
