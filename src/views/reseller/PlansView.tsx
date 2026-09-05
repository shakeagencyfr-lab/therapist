import { useState } from 'react'
import { Button, Chip, FieldLabel, Notice, Pill, ProgressBar, SquareCheck, TextInput } from '@/components/ui'
import { STATUS_LABEL } from '@/data/reseller'
import { euroCents, plural } from '@/lib/format'
import { useResellerData } from '@/reseller/context'
import { levierOuvert, maxPatientsOf, mrrCents, overrideDe } from '@/state/resellerSelectors'
import { useStore } from '@/state/store'
import { LEVIERS } from '@/types/reseller'
import type { Exceptions, ReglageOffre, StatutContrat } from '@/reseller/useReseller'
import type { Levier, Plan, PlanCode, PortfolioRow } from '@/types/reseller'
import s from './PlansView.module.css'

/* Le catalogue se règle ici : trois offres, un prix, un plafond de fiches et
   trois leviers. C'est tout ce qu'un abonnement décide — l'analyse reste
   payée par la thérapeute avec sa propre clé. */

/** L'offre en cours d'édition, telle qu'on la saisit (donc en texte). */
interface Brouillon {
  label: string
  prix: string
  max: string
  shop: boolean
  marqueBlanche: boolean
  site: boolean
}

function versBrouillon(p: Plan): Brouillon {
  return {
    label: p.label,
    prix: versEuros(p.priceCents),
    max: p.maxPatients === null ? '' : String(p.maxPatients),
    shop: p.shop,
    marqueBlanche: p.marqueBlanche,
    site: p.site,
  }
}

/** Un prix en centimes, écrit comme on l'écrit en français. */
function versEuros(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ',')
}

/** La saisie en centimes, ou null si elle n'est pas un prix. */
function centimes(saisie: string): number | null {
  const t = saisie.replace(',', '.').trim()
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return null
  return Math.round(Number(t) * 100)
}

/** Le plafond saisi : un entier positif, ou null pour « sans limite ». */
function plafond(saisie: string): number | null | 'invalide' {
  const t = saisie.trim()
  if (t === '') return null
  if (!/^\d{1,5}$/.test(t) || Number(t) < 1) return 'invalide'
  return Number(t)
}

/** De quoi savoir si l'offre a bougé sous nos pieds (rechargement, autre onglet). */
function signature(p: Plan): string {
  return [p.label, p.priceCents, p.maxPatients ?? '∞', p.shop, p.marqueBlanche, p.site].join('|')
}

function CarteOffre({
  plan,
  cabinets,
  editable,
  onSave,
}: {
  plan: Plan
  cabinets: number
  editable: boolean
  onSave: (champs: ReglageOffre) => Promise<void>
}) {
  const sig = signature(plan)
  const [brouillon, setBrouillon] = useState<Brouillon>(() => versBrouillon(plan))
  const [connu, setConnu] = useState(sig)
  const [enCours, setEnCours] = useState(false)

  /* L'offre rechargée depuis la base reprend la main sur la saisie : c'est le
     motif « réinitialiser l'état quand la prop change », sans effet. */
  if (sig !== connu) {
    setConnu(sig)
    setBrouillon(versBrouillon(plan))
  }

  const prix = centimes(brouillon.prix)
  const saisi = plafond(brouillon.max)
  const max = saisi === 'invalide' ? plan.maxPatients : saisi
  const nom = brouillon.label.trim()
  const invalide = prix === null || saisi === 'invalide' || nom.length < 2
  const modifie =
    !invalide &&
    signature({
      ...plan,
      label: nom,
      priceCents: prix ?? plan.priceCents,
      maxPatients: max,
      shop: brouillon.shop,
      marqueBlanche: brouillon.marqueBlanche,
      site: brouillon.site,
    }) !== sig

  function bascule(levier: Levier) {
    setBrouillon((b) => ({ ...b, [levier]: !b[levier] }))
  }

  async function enregistrer() {
    if (prix === null || saisi === 'invalide' || !modifie || enCours) return
    setEnCours(true)
    await onSave({
      label: nom,
      priceCents: prix,
      maxPatients: saisi,
      shop: brouillon.shop,
      marqueBlanche: brouillon.marqueBlanche,
      site: brouillon.site,
    })
    setEnCours(false)
  }

  return (
    <section className={s.plan}>
      <div className={s.planHead}>
        {editable ? (
          <input
            className={s.planNameInput}
            value={brouillon.label}
            onChange={(e) => setBrouillon((b) => ({ ...b, label: e.target.value }))}
            aria-label={`Nom de l'offre ${plan.label}`}
          />
        ) : (
          <span className={s.planName}>{plan.label}</span>
        )}
        {cabinets > 0 ? <Pill tone="neutral">{plural(cabinets, 'cabinet', 'cabinets')}</Pill> : null}
      </div>

      {editable ? (
        <div className={s.reglages}>
          <div className={s.reglage}>
            <FieldLabel>Prix par mois</FieldLabel>
            <div className={s.champUnite}>
              <TextInput
                inputMode="decimal"
                value={brouillon.prix}
                onChange={(e) => setBrouillon((b) => ({ ...b, prix: e.target.value }))}
                aria-label={`Prix mensuel de l'offre ${plan.label}`}
              />
              <span className={s.unite}>€</span>
            </div>
          </div>
          <div className={s.reglage}>
            <FieldLabel>Fiches actives</FieldLabel>
            <div className={s.champUnite}>
              <TextInput
                inputMode="numeric"
                value={brouillon.max}
                placeholder="sans limite"
                onChange={(e) => setBrouillon((b) => ({ ...b, max: e.target.value }))}
                aria-label={`Fiches actives autorisées par l'offre ${plan.label}`}
              />
              <span className={s.unite}>max</span>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <span className={s.price}>{euroCents(plan.priceCents)}</span>
          <span className={s.priceUnit}>par mois et par cabinet</span>
        </div>
      )}

      <ul className={s.leviers}>
        {LEVIERS.map((l) => (
          <li key={l.code} className={s.levier}>
            {editable ? (
              <SquareCheck
                on={brouillon[l.code]}
                onClick={() => bascule(l.code)}
                label={`${l.label} dans l'offre ${plan.label}`}
              />
            ) : (
              <span className={plan[l.code] ? s.tick : s.cross} aria-hidden>
                {plan[l.code] ? '✓' : '×'}
              </span>
            )}
            <span>
              <span className={s.levierLabel}>{l.label}</span>
              <span className={s.levierDetail}>{l.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className={s.planPied}>
        {editable ? (
          <>
            {invalide ? (
              <span className={s.probleme}>
                {prix === null
                  ? 'Le prix se saisit en euros, par exemple 79 ou 79,50.'
                  : saisi === 'invalide'
                    ? 'Un plafond est un nombre entier — ou rien du tout pour « sans limite ».'
                    : "Une offre a besoin d'un nom."}
              </span>
            ) : (
              <span className={s.planPiedNote}>
                {max === null ? 'Fiches actives sans limite.' : `${max} fiches actives au plus.`}
              </span>
            )}
            <Button variant="secondary" onClick={() => void enregistrer()} disabled={!modifie || enCours}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        ) : (
          <span className={s.planPiedNote}>
            {plan.maxPatients === null ? 'Fiches actives sans limite.' : `Jusqu'à ${plan.maxPatients} fiches actives.`}
          </span>
        )}
      </div>
    </section>
  )
}

/** Une exception sur un levier, à la forme que la base attend. */
function exceptionPour(levier: Levier, valeur: boolean | null): Exceptions {
  if (levier === 'shop') return { shopOverride: valeur }
  if (levier === 'marqueBlanche') return { marqueBlancheOverride: valeur }
  return { siteOverride: valeur }
}

/** Les trois états d'une exception : l'offre décide, ou on décide contre elle. */
type EtatLevier = 'offre' | 'ouvert' | 'ferme'

function etatDe(valeur: boolean | null): EtatLevier {
  return valeur === null ? 'offre' : valeur ? 'ouvert' : 'ferme'
}

const ETATS: Array<{ value: EtatLevier; label: string }> = [
  { value: 'offre', label: "Selon l'offre" },
  { value: 'ouvert', label: 'Ouvert' },
  { value: 'ferme', label: 'Fermé' },
]

/** Les cinq états d'un contrat, dans l'ordre où un revendeur les parcourt. */
const CONTRATS: Array<{ code: StatutContrat; label: string }> = [
  { code: 'essai', label: 'Essai' },
  { code: 'actif', label: 'Actif' },
  { code: 'impaye', label: 'Impayé' },
  { code: 'suspendu', label: 'Suspendu' },
  { code: 'resilie', label: 'Résilié' },
]

function LigneException({
  row,
  onSave,
  onContrat,
}: {
  row: PortfolioRow
  onSave: (champs: Exceptions) => Promise<void>
  onContrat: (statut: StatutContrat) => Promise<void>
}) {
  const [max, setMax] = useState(
    row.subscription.maxPatientsOverride === null ? '' : String(row.subscription.maxPatientsOverride),
  )
  const [enCours, setEnCours] = useState(false)

  const saisi = plafond(max)
  const change = saisi !== 'invalide' && saisi !== row.subscription.maxPatientsOverride

  async function poser(champs: Exceptions) {
    if (enCours) return
    setEnCours(true)
    await onSave(champs)
    setEnCours(false)
  }

  async function poserContrat(statut: StatutContrat) {
    if (enCours) return
    setEnCours(true)
    await onContrat(statut)
    setEnCours(false)
  }

  return (
    <div className={s.exception}>
      {/* LE CONTRAT, ET CE QU'IL FERME. Ce réglage manquait : `status` était
          posé une fois à l'ouverture et plus jamais, donc l'essai ne finissait
          pas, l'impayé n'existait pas, et le revenu récurrent restait à zéro.
          Depuis 0035 il décide vraiment — d'où le geste pour le rouvrir. */}
      <div className={s.exceptionLevier}>
        <FieldLabel>Contrat</FieldLabel>
        <div className={s.exceptionEtats}>
          {CONTRATS.map((c) => (
            <Chip
              key={c.code}
              on={row.subscription.status === c.code}
              onClick={() => void poserContrat(c.code)}
              title={`Passer le contrat de ${row.cabinet.name} à « ${c.label.toLowerCase()} »`}
            >
              {c.label}
            </Chip>
          ))}
        </div>
        <p className={s.exceptionNote}>
          {row.subscription.enRegle
            ? "Le contrat court : l'offre s'applique."
            : 'Hors contrat : analyse, boutique, marque blanche, site et ouverture de fiches suspendus. Les dossiers restent entiers.'}
          {row.subscription.trialEnd && row.subscription.trialEnd !== '—'
            ? ` Essai jusqu'au ${row.subscription.trialEnd}.`
            : ''}
        </p>
      </div>

      <div className={s.exceptionMax}>
        <FieldLabel>Fiches actives pour ce cabinet</FieldLabel>
        <div className={s.champUnite}>
          <TextInput
            inputMode="numeric"
            value={max}
            placeholder={row.plan.maxPatients === null ? 'sans limite' : String(row.plan.maxPatients)}
            onChange={(e) => setMax(e.target.value)}
            aria-label={`Plafond de fiches actives pour ${row.cabinet.name}`}
          />
          <Button
            variant="ghost"
            onClick={() => void poser({ maxPatientsOverride: saisi === 'invalide' ? null : saisi })}
            disabled={!change || enCours}
          >
            {enCours ? '…' : 'Appliquer'}
          </Button>
        </div>
        <p className={s.exceptionNote}>
          Vide, c'est l'offre qui décide
          {row.plan.maxPatients === null ? ' — et elle ne limite pas.' : ` : ${row.plan.maxPatients} fiches.`}
        </p>
      </div>

      {LEVIERS.map((l) => {
        const brut = overrideDe(row.subscription, l.code)
        return (
          <div key={l.code} className={s.exceptionLevier}>
            <FieldLabel>{l.label}</FieldLabel>
            <div className={s.exceptionEtats}>
              {ETATS.map((e) => (
                <Chip
                  key={e.value}
                  on={etatDe(brut) === e.value}
                  onClick={() =>
                    void poser(exceptionPour(l.code, e.value === 'offre' ? null : e.value === 'ouvert'))
                  }
                  title={`${l.label} pour ${row.cabinet.name} : ${e.label.toLowerCase()}`}
                >
                  {e.label}
                </Chip>
              ))}
            </div>
            <p className={s.exceptionNote}>
              {row.plan[l.code] ? "Ouvert dans l'offre." : "Fermé dans l'offre."}{' '}
              {levierOuvert(row.subscription, row.plan, l.code) ? 'Actif chez elle.' : 'Inactif chez elle.'}
            </p>
          </div>
        )
      })}
    </div>
  )
}

export function PlansView() {
  const { rows, offres, reel, chargement, erreur, changerOffre, enregistrerOffre, reglerExceptions, reglerContrat } =
    useResellerData()
  const { state, set } = useStore()
  /** Le cabinet dont l'offre est en cours de changement, s'il y en a un. */
  const [enCours, setEnCours] = useState('')
  /** Le cabinet dont on a ouvert les exceptions. */
  const [ouvert, setOuvert] = useState('')
  const [echec, setEchec] = useState('')

  /** Les messages de la manœuvre précédente ne survivent pas à la suivante. */
  function nettoyer() {
    setEchec('')
    if (state.rNotice) set({ rNotice: '' })
  }

  async function changePlan(row: PortfolioRow, plan: PlanCode) {
    // Recliquer l'offre déjà en cours n'écrit rien : ce serait une écriture
    // pour rien, et un message de réussite pour un changement qui n'a pas eu
    // lieu.
    if (enCours || row.subscription.plan === plan) return
    setEnCours(row.cabinet.id)
    nettoyer()
    const resultat = await changerOffre(row.cabinet.id, plan)
    setEnCours('')
    if (resultat.ok) set({ rNotice: resultat.message, rNoticeTon: 'ok' })
    else setEchec(resultat.message)
  }

  async function saveOffre(code: PlanCode, champs: ReglageOffre) {
    nettoyer()
    const resultat = await enregistrerOffre(code, champs)
    if (resultat.ok) {
      if (resultat.message) set({ rNotice: resultat.message, rNoticeTon: 'ok' })
    } else setEchec(resultat.message)
  }

  async function saveException(cabinetId: string, champs: Exceptions) {
    nettoyer()
    const resultat = await reglerExceptions(cabinetId, champs)
    if (resultat.ok) set({ rNotice: resultat.message, rNoticeTon: 'ok' })
    else setEchec(resultat.message)
  }

  async function saveContrat(cabinetId: string, statut: StatutContrat) {
    nettoyer()
    const resultat = await reglerContrat(cabinetId, statut, null)
    if (resultat.ok) set({ rNotice: resultat.message, rNoticeTon: 'ok' })
    else setEchec(resultat.message)
  }

  return (
    <>
      <div className={s.plans}>
        {offres.map((plan) => (
          <CarteOffre
            key={plan.code}
            plan={plan}
            cabinets={rows.filter((r) => r.subscription.plan === plan.code).length}
            editable={reel}
            onSave={(champs) => saveOffre(plan.code, champs)}
          />
        ))}
      </div>

      {erreur ? (
        <Notice tone="warn" style={{ marginBottom: 18 }}>
          {erreur}
        </Notice>
      ) : null}

      {echec ? (
        <Notice tone="warn" style={{ marginBottom: 18 }}>
          {echec}
        </Notice>
      ) : null}

      {/* Dit une fois, sobrement : sans session, ces abonnements sont fictifs. */}
      {!reel ? (
        <p className={s.demo}>
          Offres et abonnements de démonstration : connectez-vous pour régler les vôtres.
        </p>
      ) : null}

      {state.rNotice ? (
        <Notice tone={state.rNoticeTon} style={{ marginBottom: 18 }}>
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

        {chargement ? <div className={s.loading}>Chargement des abonnements…</div> : null}

        {rows.map((row) => {
          const max = maxPatientsOf(row.subscription, row.plan)
          const pct = max === null ? 0 : Math.round((row.stats.patientsActive / max) * 100)
          const serre = max !== null && row.stats.patientsActive >= max * 0.8
          const occupe = enCours === row.cabinet.id
          const echeance = row.subscription.periodEnd.trim()
          const exceptions =
            row.subscription.maxPatientsOverride !== null ||
            row.subscription.shopOverride !== null ||
            row.subscription.marqueBlancheOverride !== null ||
            row.subscription.siteOverride !== null
          return (
            <div key={row.cabinet.id} className={s.bloc}>
              <div className={s.row}>
                <div>
                  <div className={s.name}>{row.cabinet.name}</div>
                  <div className={s.sub}>
                    {row.cabinet.therapist} ·{' '}
                    {LEVIERS.filter((l) => levierOuvert(row.subscription, row.plan, l.code))
                      .map((l) => l.label.toLowerCase())
                      .join(', ') || 'aucun module ouvert'}
                  </div>
                </div>

                {/* Un `fieldset` désactivé neutralise ses boutons pour de bon,
                    souris et clavier compris : `Chip` n'a pas de `disabled`, et
                    une pilule seulement grisée reste actionnable au clavier. */}
                <fieldset
                  className={occupe ? `${s.picker} ${s.pickerBusy}` : s.picker}
                  disabled={enCours !== ''}
                >
                  {offres.map((plan) => (
                    <Chip
                      key={plan.code}
                      on={row.subscription.plan === plan.code}
                      onClick={() => void changePlan(row, plan.code)}
                      title={`Passer ${row.cabinet.name} à l'offre ${plan.label}`}
                    >
                      {plan.label}
                    </Chip>
                  ))}
                </fieldset>

                <div className={s.fiches}>
                  <div className={s.fichesLine}>
                    <span className={serre ? s.over : undefined}>{row.stats.patientsActive}</span>
                    <span>{max === null ? 'sans limite' : `/ ${max} fiches`}</span>
                  </div>
                  <ProgressBar value={pct} />
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
                  {/* Pas d'échéance en base : un tiret, plutôt qu'une date inventée. */}
                  <div style={{ marginTop: 5 }}>
                    {echeance && echeance !== '—' ? `Échéance le ${echeance}` : '—'}
                  </div>
                </div>

                <button
                  type="button"
                  className={s.reglerBtn}
                  onClick={() => setOuvert((id) => (id === row.cabinet.id ? '' : row.cabinet.id))}
                  aria-expanded={ouvert === row.cabinet.id}
                  disabled={!reel}
                  title={reel ? undefined : 'Connectez-vous pour régler ce cabinet.'}
                >
                  <span>{exceptions ? 'Exceptions' : 'Régler'}</span>
                  {exceptions ? <span className={s.pastille} aria-hidden /> : null}
                </button>
              </div>

              {ouvert === row.cabinet.id ? (
                <LigneException
                  row={row}
                  onSave={(champs) => saveException(row.cabinet.id, champs)}
                  onContrat={(statut) => saveContrat(row.cabinet.id, statut)}
                />
              ) : null}
            </div>
          )
        })}

        <p className={s.foot}>
          Une offre règle ce que l'application ouvre : le nombre de fiches actives, la boutique, la
          marque blanche et le site vitrine. L'analyse, elle, reste payée par la thérapeute avec sa
          propre clé Anthropic — vous ne facturez ni ne plafonnez sa consommation. Un plafond de
          fiches atteint n'enferme rien : elle archive un suivi terminé, ou vous le relevez ici.
        </p>
      </section>
    </>
  )
}
