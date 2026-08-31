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
import { euroCents, plural } from '@/lib/format'
import {
  adherenceLabel,
  mrrCents,
  nearCap,
  needsAttention,
  planOf,
  portfolio,
  slugify,
  totals,
} from '@/state/resellerSelectors'
import { useStore } from '@/state/store'
import { PLANS, STATUS_LABEL } from '@/data/reseller'
import type { Cabinet, PlanCode, PortfolioRow, SubscriptionStatus } from '@/types/reseller'
import s from './CabinetPortfolio.module.css'

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
          {row.cabinet.therapist} · {row.cabinet.slug}.entre-seances.fr
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
  const rows = portfolio(state)
  const sums = totals(rows)
  const warned = nearCap(rows)
  const late = needsAttention(rows)

  function openCabinet(id: string) {
    set({ rSel: id, rView: 'brand', rNotice: '' })
  }

  function createCabinet() {
    const name = state.rNewName.trim()
    const therapist = state.rNewTherapist.trim()
    if (name.length < 3 || therapist.length < 3) return
    const slug = (state.rNewSlug.trim() || slugify(name)).slice(0, 50)
    const plan = planOf(state.rNewPlan)
    const cabinet: Cabinet = {
      id: slug,
      name,
      slug,
      tagline: 'Espace thérapie',
      branding: {
        accent: '#A17A45',
        accentHover: '#856239',
        accentDeep: '#6E5230',
        dark: '#33291C',
        logo: name
          .split(/\s+/)
          .filter((w) => /[A-Za-zÀ-ÿ]/.test(w))
          .slice(-2)
          .map((w) => w[0]?.toUpperCase() ?? '')
          .join('') || 'CB',
      },
      therapist,
      email: state.rNewEmail.trim(),
      since: "Ouvert à l'instant",
      archived: false,
    }
    set((prev) => ({
      rCabinets: prev.rCabinets.concat([cabinet]),
      rSubs: {
        ...prev.rSubs,
        [cabinet.id]: {
          cabinetId: cabinet.id,
          plan: prev.rNewPlan,
          status: 'essai',
          periodEnd: 'dans 14 jours',
          capOverrideCents: null,
        },
      },
      rNewOpen: false,
      rNewName: '',
      rNewSlug: '',
      rNewEmail: '',
      rNewTherapist: '',
      rNotice: `${cabinet.name} est ouvert en essai sur l'offre ${plan.label}. ${
        cabinet.email ? `L'invitation part à ${cabinet.email}.` : 'Reste à inviter la thérapeute.'
      }`,
    }))
  }

  const canCreate = state.rNewName.trim().length >= 3 && state.rNewTherapist.trim().length >= 3

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
          {rows.map((row) => (
            <CabinetRow
              key={row.cabinet.id}
              row={row}
              on={row.cabinet.id === state.rSel}
              onSelect={() => openCabinet(row.cabinet.id)}
            />
          ))}
          {rows.length === 0 ? (
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
                    {(state.rNewSlug.trim() || slugify(state.rNewName) || 'sous-domaine')}
                    .entre-seances.fr
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
                <div className={s.actions}>
                  <Button variant="primary" onClick={createCabinet} disabled={!canCreate}>
                    Ouvrir le cabinet
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
