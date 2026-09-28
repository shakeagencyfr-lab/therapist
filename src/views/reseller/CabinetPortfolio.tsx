import { useState } from 'react'
import {
  Button,
  Chip,
  EmptyState,
  FieldLabel,
  Marque,
  Notice,
  Pill,
  StatCard,
  TextInput,
} from '@/components/ui'
import { essaisQuiFinissent, libelleContrat, motifATraiter, tonContrat } from '@/lib/contrat'
import { adresseCabinet } from '@/lib/domaine'
import { adressePlausible, echeanceDite, invitationExpiree } from '@/lib/equipe'
import { euroCents, plural } from '@/lib/format'
import { identifiantEnSaisie, problemeIdentifiant } from '@/lib/identifiant'
import {
  adherenceLabel,
  levierOuvert,
  maxPatientsOf,
  mrrCents,
  nearCap,
  needsAttention,
  occupation,
  slugify,
  totals,
} from '@/state/resellerSelectors'
import { useStore } from '@/state/store'
import { useResellerData } from '@/reseller/context'
import type { InvitationEnAttente, Resultat } from '@/reseller/useReseller'
import { LEVIERS } from '@/types/reseller'
import type { PlanCode, PortfolioRow } from '@/types/reseller'
import s from './CabinetPortfolio.module.css'

/** Ce qu'on saisit pour inviter : un nom, une adresse. */
interface Saisie {
  nom: string
  email: string
}

const VIDE: Saisie = { nom: '', email: '' }

function CabinetRow({ row, on, onSelect }: { row: PortfolioRow; on: boolean; onSelect: () => void }) {
  const adherence = adherenceLabel(row)
  const max = maxPatientsOf(row.subscription, row.plan)
  /* Serré, c'est quatre cinquièmes du plafond : le moment de proposer l'offre
     du dessus, pas celui où la praticienne se retrouve bloquée. */
  const serre = max !== null && row.stats.patientsActive >= max * 0.8
  const ouverts = LEVIERS.filter((l) => levierOuvert(row.subscription, row.plan, l.code))
  return (
    <button
      type="button"
      className={on ? `${s.row} ${s.rowOn}` : s.row}
      onClick={onSelect}
      aria-pressed={on}
    >
      <Marque
        className={s.mark}
        style={{ background: row.cabinet.branding.accent }}
        logo={row.cabinet.branding.logo}
        url={row.cabinet.branding.logoUrl}
      />

      <span>
        <span className={s.name}>{row.cabinet.name}</span>
        <span className={s.sub}>
          {row.cabinet.therapist} · {adresseCabinet(row.cabinet.slug)}
        </span>
      </span>

      <span className={s.right}>
        <span className={s.counters}>
          <span className={s.counter}>
            <span className={serre ? `${s.counterValue} ${s.over}` : s.counterValue}>
              {max === null ? row.stats.patientsActive : `${row.stats.patientsActive} / ${max}`}
            </span>
            <span className={s.counterLabel}>Fiches actives</span>
          </span>
          <span className={s.counter}>
            <span className={adherence.suppressed ? `${s.counterValue} ${s.suppressed}` : s.counterValue}>
              {adherence.value}
            </span>
            <span className={s.counterLabel}>Assiduité</span>
          </span>
          <span className={s.counter}>
            <span className={s.counterValue}>{row.stats.sessions30d}</span>
            <span className={s.counterLabel}>Séances</span>
          </span>
        </span>

        {/* L'offre et ce qu'elle ouvre : c'est le contrat, pas une donnée
            de santé — et c'est ce qu'on vient vérifier sur cette ligne. */}
        <span className={s.offre}>
          <span className={s.offreNom}>{row.plan.label}</span>
          <span className={s.offreLeviers}>
            {ouverts.length ? ouverts.map((l) => l.label.toLowerCase()).join(' · ') : 'application seule'}
          </span>
        </span>

        {/* Un essai expiré n'est pas un essai en cours : même pastille grise
            jusqu'ici, et le revendeur ne distinguait pas les deux. */}
        <Pill tone={tonContrat(row.subscription)}>{libelleContrat(row.subscription)}</Pill>
      </span>
    </button>
  )
}

/**
 * L'invitation d'ouverture d'un cabinet qui attend encore sa praticienne.
 *
 * Il n'y avait rien ici : ni échéance, ni renvoi, ni moyen de corriger une
 * adresse mal saisie. Une invitation échue restait « envoyée » et bloquait
 * toute nouvelle invitation à la même adresse. Le revendeur voit maintenant
 * jusqu'à quand elle court, et peut la faire repartir, la rediriger ou la
 * retirer — tant que le cabinet est vide ; ensuite, il est à sa praticienne.
 */
function InvitationOuverture({
  invitation,
  cabinet,
  enCours,
  onGeste,
}: {
  invitation: InvitationEnAttente
  cabinet: string
  enCours: boolean
  onGeste: (geste: 'relancer' | 'changer' | 'annuler', saisie?: Saisie) => Promise<boolean>
}) {
  const [changer, setChanger] = useState(false)
  const [saisie, setSaisie] = useState<Saisie>(VIDE)
  const echue = invitationExpiree(invitation.expires_at)

  function ouvrirChangement() {
    setSaisie({ nom: invitation.display_name ?? '', email: invitation.email })
    setChanger(true)
  }

  return (
    <div className={s.attente}>
      <div className={s.attenteLigne}>
        <span className={echue ? `${s.attenteTexte} ${s.attenteEchue}` : s.attenteTexte}>
          {invitation.display_name ? `${invitation.display_name} · ` : ''}
          {invitation.email} — {echeanceDite(invitation.expires_at)}
          {echue ? ' : le lien ne donne plus accès. Renvoyez-la pour trente jours de plus.' : ''}
        </span>
        <span className={s.attenteGestes}>
          <Button onClick={() => void onGeste('relancer')} disabled={enCours}>
            {enCours ? 'Envoi…' : 'Renvoyer'}
          </Button>
          <Button variant="ghost" onClick={() => (changer ? setChanger(false) : ouvrirChangement())} disabled={enCours}>
            Changer d'adresse
          </Button>
          <Button variant="ghost" onClick={() => void onGeste('annuler')} disabled={enCours}>
            Annuler
          </Button>
        </span>
      </div>
      {changer ? (
        <div className={s.invite} style={{ padding: 0 }}>
          <TextInput
            value={saisie.nom}
            onChange={(e) => setSaisie((x) => ({ ...x, nom: e.target.value }))}
            placeholder="Claire Fontaine"
            aria-label={`Nom de la praticienne de ${cabinet}`}
          />
          <TextInput
            type="email"
            value={saisie.email}
            onChange={(e) => setSaisie((x) => ({ ...x, email: e.target.value }))}
            placeholder="claire@cabinet-fontaine.fr"
            aria-label={`Nouvelle adresse d'invitation pour ${cabinet}`}
          />
          <Button
            variant="primary"
            disabled={enCours || !adressePlausible(saisie.email)}
            onClick={async () => {
              if (await onGeste('changer', saisie)) setChanger(false)
            }}
          >
            {enCours ? 'Envoi…' : 'Inviter cette adresse'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function CabinetPortfolio() {
  const { state, set } = useStore()
  const {
    rows,
    offres,
    invitations,
    reel,
    chargement,
    erreur,
    ouvrirCabinet,
    inviterPraticienne,
    relancerInvitation,
    changerInvitation,
    annulerInvitation,
  } = useResellerData()
  const sums = totals(rows)
  const place = occupation(rows)
  const warned = nearCap(rows)
  const late = needsAttention(rows)
  const bientot = essaisQuiFinissent(rows)

  /** Écriture en cours : le bouton attend la base plutôt que la mémoire. */
  const [ouverture, setOuverture] = useState(false)
  const [echec, setEchec] = useState('')
  const [invitSaisie, setInvitSaisie] = useState<Record<string, Saisie>>({})
  const [invitEnCours, setInvitEnCours] = useState('')
  const [invitEchec, setInvitEchec] = useState<{ id: string; message: string } | null>(null)

  /* L'identifiant proposé suit le nom tant que le champ est vide ; une fois
     saisi, il est à la personne qui l'a écrit. */
  const identifiant = state.rNewSlug || slugify(state.rNewName)
  const problemeSlug = identifiant ? problemeIdentifiant(identifiant) : null
  const emailSaisi = state.rNewEmail.trim()
  /* L'offre de départ se prend dans CE catalogue (0049) : l'offre retenue par
     défaut peut ne pas y être, et la base refuserait de la poser. */
  const offreChoisie = offres.some((p) => p.code === state.rNewPlan) ? state.rNewPlan : offres[0]?.code
  const canCreate =
    Boolean(offreChoisie) &&
    state.rNewName.trim().length >= 3 &&
    state.rNewTherapist.trim().length >= 3 &&
    !problemeSlug &&
    // Une adresse mal formée partait jusqu'au serveur d'envoi, qui la refusait
    // après que l'invitation eut été posée.
    (!emailSaisi || adressePlausible(emailSaisi))

  function openCabinet(id: string) {
    set({ rSel: id, rView: 'brand', rNotice: '' })
  }

  async function createCabinet() {
    if (!canCreate || ouverture) return
    setOuverture(true)
    setEchec('')
    // La réussite précédente ne doit pas rester affichée à côté d'un échec.
    if (state.rNotice) set({ rNotice: '' })
    const resultat = await ouvrirCabinet({
      nom: state.rNewName,
      slug: identifiant,
      praticienne: state.rNewTherapist,
      email: state.rNewEmail,
      offre: offreChoisie as PlanCode,
    })
    setOuverture(false)
    if (resultat.ok) {
      set({
        rNewOpen: false,
        rNewName: '',
        rNewSlug: '',
        rNewEmail: '',
        rNewTherapist: '',
        rNotice: resultat.message,
        rNoticeTon: resultat.partiel ? 'warn' : 'ok',
      })
      return
    }
    // On garde la saisie : rien n'est plus pénible qu'un formulaire à retaper.
    setEchec(resultat.message)
  }

  /** Un geste sur l'invitation d'un cabinet, et ce qu'on en dit. Vrai s'il a abouti. */
  async function agir(cabinetId: string, geste: () => Promise<Resultat>): Promise<boolean> {
    if (invitEnCours) return false
    setInvitEnCours(cabinetId)
    setInvitEchec(null)
    if (state.rNotice) set({ rNotice: '' })
    const resultat = await geste()
    setInvitEnCours('')
    if (resultat.ok) {
      set({ rNotice: resultat.message, rNoticeTon: resultat.partiel ? 'warn' : 'ok' })
      return true
    }
    setInvitEchec({ id: cabinetId, message: resultat.message })
    return false
  }

  async function inviter(cabinetId: string) {
    const saisie = invitSaisie[cabinetId] ?? VIDE
    if (!adressePlausible(saisie.email)) return
    const fait = await agir(cabinetId, () => inviterPraticienne(cabinetId, saisie.email, saisie.nom))
    if (fait) setInvitSaisie((prev) => ({ ...prev, [cabinetId]: VIDE }))
  }

  return (
    <>
      <div className={s.stats}>
        <StatCard label="Cabinets" value={sums.cabinets} progress={100} />
        {/* « Sur X vendues » ne vaut que pour les cabinets qui ont un plafond :
            ceux sans limite n'ont rien vendu de comptable, et les mélanger
            donnait un total rapporté à une capacité qui ne le couvrait pas. */}
        <StatCard
          label="Fiches actives"
          value={sums.patients}
          unit={
            place.capacite === 0
              ? 'au total'
              : place.illimites > 0
                ? `dont ${place.actives} sur ${place.capacite} vendues`
                : `sur ${place.capacite} vendues`
          }
          progress={place.pct}
        />
        <StatCard label="Séances" value={sums.sessions} unit="sur 30 jours" progress={100} />
        <StatCard label="Revenu mensuel" value={euroCents(mrrCents(rows))} unit="récurrent" progress={100} />
      </div>

      {erreur ? (
        <Notice tone="warn" style={{ marginBottom: 18 }}>
          {erreur}
        </Notice>
      ) : null}

      {/* Dit une fois, sobrement : sans session, ces cabinets sont fictifs.
          Pas pendant le chargement — on ne sait pas encore s'il y a une
          session, et « connectez-vous » à quelqu'un de connecté est faux. */}
      {!reel && !chargement ? (
        <p className={s.demo}>
          Portefeuille de démonstration : connectez-vous pour voir vos cabinets.
        </p>
      ) : null}

      {state.rNotice ? (
        <Notice tone={state.rNoticeTon} style={{ marginBottom: 18 }}>
          {state.rNotice}
        </Notice>
      ) : null}

      <div className={s.grid}>
        <section className={s.list}>
          <div className={s.listHead}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19 }}>Portefeuille</span>
            <span style={{ fontSize: 11.5, color: 'var(--c-text-muted)' }}>
              {plural(rows.length, 'cabinet', 'cabinets')}
            </span>
          </div>
          {chargement ? <div className={s.loading}>Chargement du portefeuille…</div> : null}
          {rows.map((row) => {
            const id = row.cabinet.id
            /* Un cabinet sans membre attend sa praticienne. C'est le compte
               des membres qui le dit, pas le libellé de la ligne : celui-ci
               change avec l'état de l'invitation. */
            const sansEquipe = reel && row.stats.therapists === 0
            const invitation = sansEquipe
              ? invitations.find((i) => i.cabinet_id === id && i.role === 'owner')
              : undefined
            const saisie = invitSaisie[id] ?? VIDE
            return (
              <div key={id} className={s.item}>
                <CabinetRow
                  row={row}
                  on={id === state.rSel}
                  onSelect={() => openCabinet(id)}
                />
                {sansEquipe && invitation ? (
                  <InvitationOuverture
                    invitation={invitation}
                    cabinet={row.cabinet.name}
                    enCours={invitEnCours === id}
                    onGeste={(geste, nouvelle) =>
                      agir(id, () =>
                        geste === 'relancer'
                          ? relancerInvitation(invitation.id)
                          : geste === 'annuler'
                            ? annulerInvitation(invitation.id)
                            : changerInvitation(invitation.id, nouvelle?.email ?? '', nouvelle?.nom),
                      )
                    }
                  />
                ) : sansEquipe ? (
                  <div className={s.invite}>
                    <TextInput
                      value={saisie.nom}
                      onChange={(e) =>
                        setInvitSaisie((prev) => ({ ...prev, [id]: { ...saisie, nom: e.target.value } }))
                      }
                      placeholder="Claire Fontaine"
                      aria-label={`Nom de la praticienne de ${row.cabinet.name}`}
                    />
                    <TextInput
                      type="email"
                      value={saisie.email}
                      onChange={(e) =>
                        setInvitSaisie((prev) => ({ ...prev, [id]: { ...saisie, email: e.target.value } }))
                      }
                      placeholder="claire@cabinet-fontaine.fr"
                      aria-label={`Courriel d'invitation pour ${row.cabinet.name}`}
                    />
                    <Button
                      onClick={() => void inviter(id)}
                      disabled={!adressePlausible(saisie.email) || invitEnCours !== ''}
                    >
                      {invitEnCours === id ? 'Invitation…' : 'Inviter'}
                    </Button>
                  </div>
                ) : null}
                {invitEchec && invitEchec.id === id ? (
                  <Notice tone="warn" style={{ margin: '0 20px 14px' }}>
                    {invitEchec.message}
                  </Notice>
                ) : null}
              </div>
            )
          })}
          {rows.length === 0 && !chargement ? (
            <div style={{ padding: 20 }}>
              <EmptyState>
                Aucun cabinet ouvert. Le premier se crée en deux champs : le nom du cabinet et
                celui de la praticienne.
              </EmptyState>
            </div>
          ) : null}
        </section>

        <div className={s.aside}>
          {/* Dire ce qu'on ne voit pas vaut argument de vente auprès des thérapeutes. */}
          <section className={s.panel}>
            <h2 className={s.panelTitle}>Ce que vous ne voyez pas</h2>
            <p className={s.panelSub}>
              Le cloisonnement est appliqué dans la base, pas dans cet écran : il n'existe aucune
              requête qui vous rendrait ces données.
            </p>
            <ul className={s.blind}>
              {[
                'Le nom, le dossier et le programme d’un patient',
                'Les notes de séance et les transcriptions',
                'Le journal, partagé ou privé',
                'Le profil psychologique et ses axes',
              ].map((item) => (
                <li key={item} className={s.blindItem}>
                  <span className={s.cross} aria-hidden>
                    ×
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className={s.panelSub} style={{ margin: '14px 0 0' }}>
              Les moyennes disparaissent aussi sous trois patients actifs : dans un cabinet d'un
              patient, une moyenne est un chiffre individuel.
            </p>
          </section>

          {late.length > 0 || warned.length > 0 || bientot.length > 0 ? (
            <section className={s.panel}>
              <h2 className={s.panelTitle}>À traiter</h2>
              <p className={s.panelSub}>
                Contrats en défaut, essais qui finissent cette semaine, et cabinets qui approchent
                leur plafond de fiches.
              </p>
              <div className={s.attention}>
                {late.map((row) => (
                  <div key={row.cabinet.id} className={s.attentionRow}>
                    <span className={s.attentionName}>{row.cabinet.name}</span>
                    {/* La date d'un essai est sa fin d'essai, celle d'un contrat
                        sa fin de période : la ligne lisait la seconde pour un
                        essai et affichait « Essai · échéance — ». Et jamais
                        « impayé depuis » sur une échéance à venir. */}
                    <Pill tone="warn">{motifATraiter(row.subscription)}</Pill>
                  </div>
                ))}
                {/* Le moment de proposer la souscription, avant que les leviers
                    ne se ferment chez la thérapeute. */}
                {bientot.map(({ row, jours }) => (
                  <div key={`essai-${row.cabinet.id}`} className={s.attentionRow}>
                    <span className={s.attentionName}>{row.cabinet.name}</span>
                    <Pill tone="neutral">
                      {jours <= 1 ? 'Essai : dernier jour' : `Essai : encore ${plural(jours, 'jour', 'jours')}`}
                    </Pill>
                  </div>
                ))}
                {warned.map((row) => (
                  <div key={`cap-${row.cabinet.id}`} className={s.attentionRow}>
                    <span className={s.attentionName}>{row.cabinet.name}</span>
                    <span style={{ color: 'var(--c-warn-text-2)' }}>
                      {row.stats.patientsActive} fiches sur {maxPatientsOf(row.subscription, row.plan)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className={s.panel}>
            <h2 className={s.panelTitle}>Ouvrir un cabinet</h2>
            <p className={s.panelSub}>
              Le cabinet est créé vide, en essai de quatorze jours. La praticienne reçoit une
              invitation et devient propriétaire de ses données : vous n'y entrez pas.
            </p>

            {state.rNewOpen ? (
              <div className={s.form}>
                <div>
                  <FieldLabel>Nom du cabinet</FieldLabel>
                  <TextInput
                    value={state.rNewName}
                    onChange={(e) => set({ rNewName: e.target.value })}
                    placeholder="Cabinet Claire Fontaine"
                  />
                </div>
                <div>
                  <FieldLabel>Identifiant</FieldLabel>
                  {/* Vide, il suit le nom du cabinet — c'est ce que montre le
                      texte d'attente ; ce qu'on y tape l'emporte. */}
                  <TextInput
                    value={state.rNewSlug}
                    onChange={(e) => set({ rNewSlug: identifiantEnSaisie(e.target.value) })}
                    placeholder={slugify(state.rNewName) || 'cabinet-claire-fontaine'}
                    aria-label="Identifiant du cabinet, qui fait son adresse"
                  />
                  <div className={problemeSlug ? `${s.slugHint} ${s.slugProbleme}` : s.slugHint}>
                    {problemeSlug ?? adresseCabinet(identifiant || 'identifiant')}
                  </div>
                </div>
                <div className={s.formRow}>
                  <div>
                    <FieldLabel>Praticienne</FieldLabel>
                    <TextInput
                      value={state.rNewTherapist}
                      onChange={(e) => set({ rNewTherapist: e.target.value })}
                      placeholder="Claire Fontaine"
                    />
                  </div>
                  <div>
                    <FieldLabel>Courriel d'invitation</FieldLabel>
                    <TextInput
                      type="email"
                      value={state.rNewEmail}
                      onChange={(e) => set({ rNewEmail: e.target.value })}
                      placeholder="claire@cabinet-fontaine.fr"
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel>Offre de départ</FieldLabel>
                  <div className={s.planPick}>
                    {offres.map((plan) => (
                      <Chip
                        key={plan.code}
                        on={offreChoisie === plan.code}
                        onClick={() => set({ rNewPlan: plan.code as PlanCode })}
                      >
                        {plan.label} · {euroCents(plan.priceCents)}
                      </Chip>
                    ))}
                  </div>
                </div>
                {echec ? <Notice tone="warn">{echec}</Notice> : null}
                <div className={s.actions}>
                  <Button variant="primary" onClick={() => void createCabinet()} disabled={!canCreate || ouverture}>
                    {ouverture ? 'Ouverture…' : 'Ouvrir le cabinet'}
                  </Button>
                  <Button variant="ghost" onClick={() => set({ rNewOpen: false })}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="secondary" block onClick={() => set({ rNewOpen: true, rNotice: '' })}>
                Ouvrir un cabinet
              </Button>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
