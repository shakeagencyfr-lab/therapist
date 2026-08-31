import { Chip, Notice, Pill } from '@/components/ui'
import { PLANS, STATUS_LABEL } from '@/data/reseller'
import { euroCents, plural } from '@/lib/format'
import { mrrCents, portfolio } from '@/state/resellerSelectors'
import { useStore } from '@/state/store'
import type { PlanCode } from '@/types/reseller'
import s from './PlansView.module.css'

export function PlansView() {
  const { state, set } = useStore()
  const rows = portfolio(state)

  /** Changer d'offre déplace le plafond de consommation avec elle. */
  function changePlan(cabinetId: string, plan: PlanCode) {
    const cabinet = rows.find((r) => r.cabinet.id === cabinetId)?.cabinet
    const label = PLANS.find((p) => p.code === plan)?.label ?? plan
    set((prev) => ({
      rSubs: {
        ...prev.rSubs,
        [cabinetId]: { ...prev.rSubs[cabinetId], plan },
      },
      rNotice: cabinet
        ? `${cabinet.name} passe à l'offre ${label}. Le nouveau plafond s'applique au prochain cycle.`
        : '',
    }))
  }

  return (
    <>
      <div className={s.plans}>
        {PLANS.map((plan) => {
          const count = rows.filter((r) => r.subscription.plan === plan.code).length
          return (
            <section key={plan.code} className={s.plan}>
              <div className={s.planHead}>
                <span className={s.planName}>{plan.label}</span>
                {count > 0 ? <Pill tone="neutral">{plural(count, 'cabinet', 'cabinets')}</Pill> : null}
              </div>
              <div>
                <span className={s.price}>{euroCents(plan.priceCents)}</span>
                <span className={s.priceUnit}>par mois et par cabinet</span>
              </div>
              <ul className={s.includes}>
                {plan.includes.map((line) => (
                  <li key={line} className={s.include}>
                    <span className={s.tick} aria-hidden>
                      ✓
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className={s.limits}>
                <div className={s.limitRow}>
                  <span>Patients</span>
                  <span className={s.limitValue}>
                    {plan.maxPatients === null ? 'Sans limite' : `Jusqu'à ${plan.maxPatients}`}
                  </span>
                </div>
                <div className={s.limitRow}>
                  <span>Plafond IA</span>
                  <span className={s.limitValue}>{euroCents(plan.aiCapCents)} par mois</span>
                </div>
              </div>
            </section>
          )
        })}
      </div>

      {state.rNotice ? (
        <Notice tone="ok" style={{ marginBottom: 18 }}>
          {state.rNotice}
        </Notice>
      ) : null}

      <section className={s.table}>
        <div className={s.tableHead}>
          <h2 className={s.tableTitle}>Abonnements</h2>
          <span style={{ fontSize: 11.5, color: 'var(--c-text-muted)' }}>
            {euroCents(mrrCents(rows))} récurrents par mois
          </span>
        </div>

        {rows.map((row) => {
          const over = row.usagePct > 100
          return (
            <div key={row.cabinet.id} className={s.row}>
              <div>
                <div className={s.name}>{row.cabinet.name}</div>
                <div className={s.sub}>
                  {row.cabinet.therapist} · {plural(row.stats.patientsActive, 'patient', 'patients')}
                  {row.plan.maxPatients !== null ? ` sur ${row.plan.maxPatients}` : ''}
                </div>
              </div>

              <div className={s.picker}>
                {PLANS.map((plan) => (
                  <Chip
                    key={plan.code}
                    on={row.subscription.plan === plan.code}
                    onClick={() => changePlan(row.cabinet.id, plan.code)}
                    title={`Passer ${row.cabinet.name} à l'offre ${plan.label}`}
                  >
                    {plan.label}
                  </Chip>
                ))}
              </div>

              <div className={s.spend}>
                <div className={s.spendLine}>
                  <span className={over ? s.over : undefined}>{euroCents(row.stats.aiSpendCents)}</span>
                  <span>/ {euroCents(row.capCents)}</span>
                </div>
                <div
                  style={{
                    height: 4,
                    borderRadius: 999,
                    background: 'var(--c-neutral-3)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, row.usagePct)}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: over ? 'var(--c-warn-dash)' : 'var(--c-accent)',
                    }}
                  />
                </div>
              </div>

              <div className={s.period}>
                <Pill
                  tone={
                    row.subscription.status === 'impaye' || row.subscription.status === 'suspendu'
                      ? 'warn'
                      : row.subscription.status === 'essai'
                        ? 'neutral'
                        : 'ok'
                  }
                >
                  {STATUS_LABEL[row.subscription.status]}
                </Pill>
                <div style={{ marginTop: 5 }}>Échéance le {row.subscription.periodEnd}</div>
              </div>
            </div>
          )
        })}

        <p className={s.foot}>
          Le plafond IA n'arrête pas le cabinet : au dépassement, la thérapeute garde ses écrans et
          ce sont les quatre fonctions d'analyse qui s'interrompent, avec un message qui le dit.
          Couper l'accès au dossier d'un patient parce qu'une facture traîne n'est pas une option.
        </p>
      </section>
    </>
  )
}
