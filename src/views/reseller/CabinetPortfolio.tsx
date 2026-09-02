import { useState } from 'react'
import {
  Button,
  Chip,
  EmptyState,
  FieldLabel,
  Notice,
  Pill,
  ProgressBar,
  StatCard,
  TextInput,
} from '@/components/ui'
import { adresseCabinet } from '@/lib/domaine'
import { euroCents, plural } from '@/lib/format'
import {
  adherenceLabel,
  mrrCents,
  nearCap,
  needsAttention,
  slugify,
  totals,
} from '@/state/resellerSelectors'
import { useStore } from '@/state/store'
import { useResellerData } from '@/reseller/context'
import { PLANS, STATUS_LABEL } from '@/data/reseller'
import type { PlanCode, PortfolioRow, SubscriptionStatus } from '@/types/reseller'
import s from './CabinetPortfolio.module.css'

/** Ce que la couche d'accès écrit quand aucune praticienne n'est rattachée. */
const SANS_PRATICIENNE = 'Aucune praticienne'

/** Ton de la pilule de statut d'abonnement. */
function statusTone(status: SubscriptionStatus) {
  if (status === 'impaye' || status === 'suspendu') return 'warn' as const
  if (status === 'essai') return 'neutral' as const
  return 'ok' as const
}

function CabinetRow({ row, on, onSelect }: { row: PortfolioRow; on: boolean; onSelect: () => void }) {
  const adherence = adherenceLabel(row)
  const over = row.usagePct > 100
  return (
    <button
      type="button"
      className={on ? `${s.row} ${s.rowOn}` : s.row}
      onClick={onSelect}
      aria-pressed={on}
    >
      <span className={s.mark} style={{ background: row.cabinet.branding.accent }} aria-hidden>
        {row.cabinet.branding.logo}
      </span>

      <span>
        <span className={s.name}>{row.cabinet.name}</span>
        <span className={s.sub}>
          {row.cabinet.therapist} · {adresseCabinet(row.cabinet.slug)}
        </span>
      </span>

      <span className={s.right}>
        <span className={s.counters}>
          <span className={s.counter}>
            <span className={s.counterValue}>{row.stats.patientsActive}</span>
            <span className={s.counterLabel}>Patients</span>
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

        <span className={s.usage}>
          <span className={s.usageLine}>
            <span className={over ? s.over : undefined}>{euroCents(row.stats.aiSpendCents)}</span>
            <span>/ {euroCents(row.capCents)}</span>
          </span>
          <ProgressBar value={row.usagePct} />
        </span>

        <Pill tone={statusTone(row.subscription.status)}>{STATUS_LABEL[row.subscription.status]}</Pill>
      </span>
    </button>
  )
}

export function CabinetPortfolio() {
  const { state, set } = useStore()
  const { rows, reel, chargement, erreur, ouvrirCabinet, inviterPraticienne } = useResellerData()
  const sums = totals(rows)
  const warned = nearCap(rows)
  const late = needsAttention(rows)

  /** Écriture en cours : le bouton attend la base plutôt que la mémoire. */
  const [ouverture, setOuverture] = useState(false)
  const [echec, setEchec] = useState('')
  const [invitEmail, setInvitEmail] = useState<Record<string, string>>({})
  const [invitEnCours, setInvitEnCours] = useState('')
  const [invitEchec, setInvitEchec] = useState<{ id: string; message: string } | null>(null)

  const canCreate = state.rNewName.trim().length >= 3 && state.rNewTherapist.trim().length >= 3

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
      slug: state.rNewSlug,
      praticienne: state.rNewTherapist,
      email: state.rNewEmail,
      offre: state.rNewPlan,
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
      })
      return
    }
    // On garde la saisie : rien n'est plus pénible qu'un formulaire à retaper.
    setEchec(resultat.message)
  }

  async function inviter(cabinetId: string) {
    const email = (invitEmail[cabinetId] ?? '').trim()
    if (!email || invitEnCours) return
    setInvitEnCours(cabinetId)
    setInvitEchec(null)
    if (state.rNotice) set({ rNotice: '' })
    const resultat = await inviterPraticienne(cabinetId, email)
    setInvitEnCours('')
    if (resultat.ok) {
      setInvitEmail((prev) => ({ ...prev, [cabinetId]: '' }))
      set({ rNotice: resultat.message })
      return
    }
    setInvitEchec({ id: cabinetId, message: resultat.message })
  }

  return (
    <>
      <div className={s.stats}>
        <StatCard label="Cabinets" value={sums.cabinets} progress={100} />
        <StatCard
          label="Patients suivis"
          value={sums.patients}
          unit="au total"
          progress={Math.min(100, (sums.patients / 120) * 100)}
        />
        <StatCard
          label="Consommation IA"
          value={euroCents(sums.aiSpendCents)}
          unit="ce mois"
          progress={sums.aiCapCents ? (sums.aiSpendCents / sums.aiCapCents) * 100 : 0}
        />
        <StatCard label="Revenu mensuel" value={euroCents(mrrCents(rows))} unit="récurrent" progress={100} />
      </div>

      {erreur ? (
        <Notice tone="warn" style={{ marginBottom: 18 }}>
          {erreur}
        </Notice>
      ) : null}

      {/* Dit une fois, sobrement : sans session, ces cabinets sont fictifs. */}
      {!reel ? (
        <p className={s.demo}>
          Portefeuille de démonstration : connectez-vous pour voir vos cabinets.
        </p>
      ) : null}

      {state.rNotice ? (
        <Notice tone="ok" style={{ marginBottom: 18 }}>
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
          {rows.map((row) => (
            <div key={row.cabinet.id} className={s.item}>
              <CabinetRow
                row={row}
                on={row.cabinet.id === state.rSel}
                onSelect={() => openCabinet(row.cabinet.id)}
              />
              {row.cabinet.therapist === SANS_PRATICIENNE ? (
                <div className={s.invite}>
                  <TextInput
                    type="email"
                    value={invitEmail[row.cabinet.id] ?? ''}
                    onChange={(e) =>
                      setInvitEmail((prev) => ({ ...prev, [row.cabinet.id]: e.target.value }))
                    }
                    placeholder="claire@cabinet-fontaine.fr"
                    aria-label={`Courriel d'invitation pour ${row.cabinet.name}`}
                  />
                  <Button
                    onClick={() => void inviter(row.cabinet.id)}
                    disabled={
                      (invitEmail[row.cabinet.id] ?? '').trim().length === 0 || invitEnCours !== ''
                    }
                  >
                    {invitEnCours === row.cabinet.id ? 'Invitation…' : 'Inviter'}
                  </Button>
                </div>
              ) : null}
              {invitEchec && invitEchec.id === row.cabinet.id ? (
                <Notice tone="warn" style={{ margin: '0 20px 14px' }}>
                  {invitEchec.message}
                </Notice>
              ) : null}
            </div>
          ))}
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

          {late.length > 0 || warned.length > 0 ? (
            <section className={s.panel}>
              <h2 className={s.panelTitle}>À traiter</h2>
              <p className={s.panelSub}>Contrats en défaut et plafonds de consommation approchés.</p>
              <div className={s.attention}>
                {late.map((row) => (
                  <div key={row.cabinet.id} className={s.attentionRow}>
                    <span className={s.attentionName}>{row.cabinet.name}</span>
                    <Pill tone="warn">
                      {STATUS_LABEL[row.subscription.status]} depuis le {row.subscription.periodEnd}
                    </Pill>
                  </div>
                ))}
                {warned.map((row) => (
                  <div key={`cap-${row.cabinet.id}`} className={s.attentionRow}>
                    <span className={s.attentionName}>{row.cabinet.name}</span>
                    <span style={{ color: 'var(--c-warn-text-2)' }}>
                      {Math.round(row.usagePct)} % du plafond IA
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
                  <div className={s.slugHint}>
                    {adresseCabinet(state.rNewSlug.trim() || slugify(state.rNewName) || 'sous-domaine')}
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
                    {PLANS.map((plan) => (
                      <Chip
                        key={plan.code}
                        on={state.rNewPlan === plan.code}
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
