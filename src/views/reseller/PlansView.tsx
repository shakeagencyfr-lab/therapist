import { useState } from 'react'
import { useMaybeAuth } from '@/auth/session'
import { GesteAConfirmer } from '@/components/GesteAConfirmer'
import { Button, Chip, FieldLabel, Notice, Pill, ProgressBar, SquareCheck, TextInput } from '@/components/ui'
import {
  auteurDit,
  CE_QUI_EST_SUSPENDU,
  dateDuContrat,
  depuisChampDate,
  finEssaiProposee,
  libelleContrat,
  noteDuContrat,
  phraseDuJournal,
  tonContrat,
  versChampDate,
} from '@/lib/contrat'
import { dateLongue, euroCents, plural } from '@/lib/format'
import { entierSaisi, jetonsDits, offertsDits } from '@/lib/jetonsIA'
import { useResellerData } from '@/reseller/context'
import { useJetonsRevendeur } from '@/reseller/useJetonsRevendeur'
import {
  jetonsMoisOf,
  levierOuvert,
  maxPatientsOf,
  mrrCents,
  overrideDe,
  passHypnoseEnCours,
} from '@/state/resellerSelectors'
import { useStore } from '@/state/store'
import { LEVIERS } from '@/types/reseller'
import type { Exceptions, ReglageContrat, ReglageOffre, StatutContrat } from '@/reseller/useReseller'
import type { ModeFacturation } from '@/types/jetons'
import type { Levier, Plan, PlanCode, PortfolioRow } from '@/types/reseller'
import s from './PlansView.module.css'

/* Le catalogue se règle ici : trois offres, un prix, un plafond de fiches,
   quatre leviers — et, depuis 0065, un forfait mensuel de jetons, qui ne
   vaut que lorsque le revendeur paie l'analyse avec sa clé (onglet Jetons
   IA). Sans jetons activés, l'analyse reste payée par la thérapeute — sauf
   pour un cabinet placé en jetons par exception (0070), et inversement. */

/** Le forfait mensuel le plus haut que la base accepte (plans_jetons_mois_borne). */
const FORFAIT_MAX = 1_000_000

/** L'offre en cours d'édition, telle qu'on la saisit (donc en texte). */
interface Brouillon {
  label: string
  prix: string
  max: string
  /** Les jetons versés chaque mois, tels que saisis. */
  jetons: string
  shop: boolean
  marqueBlanche: boolean
  site: boolean
  hypnoseIncluse: boolean
}

function versBrouillon(p: Plan): Brouillon {
  return {
    label: p.label,
    prix: versEuros(p.priceCents),
    max: p.maxPatients === null ? '' : String(p.maxPatients),
    jetons: String(p.jetonsMois),
    shop: p.shop,
    marqueBlanche: p.marqueBlanche,
    site: p.site,
    hypnoseIncluse: p.hypnoseIncluse,
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
  return [p.label, p.priceCents, p.maxPatients ?? '∞', p.shop, p.marqueBlanche, p.site, p.jetonsMois, p.hypnoseIncluse].join('|')
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
  const jetons = entierSaisi(brouillon.jetons, 0, FORFAIT_MAX)
  const nom = brouillon.label.trim()
  const invalide = prix === null || saisi === 'invalide' || jetons === null || nom.length < 2
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
      jetonsMois: jetons ?? plan.jetonsMois,
      hypnoseIncluse: brouillon.hypnoseIncluse,
    }) !== sig

  function bascule(levier: Levier) {
    setBrouillon((b) => ({ ...b, [levier]: !b[levier] }))
  }

  async function enregistrer() {
    if (prix === null || saisi === 'invalide' || jetons === null || !modifie || enCours) return
    setEnCours(true)
    await onSave({
      label: nom,
      priceCents: prix,
      maxPatients: saisi,
      shop: brouillon.shop,
      marqueBlanche: brouillon.marqueBlanche,
      site: brouillon.site,
      jetonsMois: jetons,
      hypnoseIncluse: brouillon.hypnoseIncluse,
    })
    setEnCours(false)
  }

  return (
    <section className={s.plan}>
      <div className={s.planHead}>
        {editable ? (
          <TextInput
            nu
            dictee
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
          <div className={s.reglage}>
            <FieldLabel>Jetons IA par mois</FieldLabel>
            <div className={s.champUnite}>
              <TextInput
                inputMode="numeric"
                value={brouillon.jetons}
                onChange={(e) => setBrouillon((b) => ({ ...b, jetons: e.target.value }))}
                aria-label={`Jetons IA versés chaque mois par l'offre ${plan.label}`}
              />
              <span className={s.unite}>jetons</span>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <span className={s.price}>{euroCents(plan.priceCents)}</span>
          <span className={s.priceUnit}>par mois et par cabinet</span>
          <span className={s.forfait}>{jetonsDits(plan.jetonsMois)} IA par mois</span>
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
                    : jetons === null
                      ? 'Le forfait est un nombre entier de jetons, zéro compris.'
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
  if (levier === 'hypnoseIncluse') return { hypnoseOverride: valeur }
  return { siteOverride: valeur }
}

/** Ce que l'offre dit d'un levier : l'hypnose se « comprend », le reste s'« ouvre ». */
function levierDansLOffre(levier: Levier, dansLOffre: boolean): string {
  if (levier === 'hypnoseIncluse') return dansLOffre ? "Comprise dans l'offre." : "Pas comprise dans l'offre."
  return dansLOffre ? "Ouvert dans l'offre." : "Fermé dans l'offre."
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

/**
 * Les statuts qui ferment sur-le-champ les leviers d'un cabinet.
 *
 * Les puces changeaient le contrat au premier clic : un clic malheureux sur
 * « Résilié » coupait l'analyse, la boutique et le site d'une thérapeute en
 * pleine séance. Ceux-là passent désormais par une confirmation qui dit ce
 * qui va se fermer.
 */
const CONFIRMATION: Partial<Record<StatutContrat, string>> = {
  impaye: 'Passer en impayé',
  suspendu: 'Suspendre le contrat',
  resilie: 'Résilier le contrat',
}

/** De quoi savoir si le contrat a bougé sous nos pieds (rechargement, autre onglet). */
function signatureContrat(row: PortfolioRow): string {
  const c = row.subscription
  return [c.status, c.trialEndsAt ?? '', c.periodEndAt ?? ''].join('|')
}

/**
 * Le contrat d'un cabinet : un statut, et la date qui va avec.
 *
 * Les puces choisissent, « Appliquer » écrit. L'échéance n'est écrite que si
 * on l'a changée — elle était remise à vide à chaque clic — et la fin d'un
 * essai se choisit : c'était le seul moyen de prolonger un essai, et il
 * reposait quatorze jours d'office, même sur un essai qui courait encore.
 */
function ReglageDuContrat({
  row,
  onContrat,
}: {
  row: PortfolioRow
  onContrat: (reglage: ReglageContrat) => Promise<boolean>
}) {
  const c = row.subscription
  const sig = signatureContrat(row)
  const [connu, setConnu] = useState(sig)
  const [statut, setStatut] = useState<StatutContrat>(c.status)
  const [finEssai, setFinEssai] = useState(
    c.status === 'essai' ? versChampDate(c.trialEndsAt) : finEssaiProposee(c.trialEndsAt),
  )
  const [echeance, setEcheance] = useState(versChampDate(c.periodEndAt))
  const [enCours, setEnCours] = useState(false)

  /* Le contrat relu depuis la base reprend la main sur la saisie. */
  if (sig !== connu) {
    setConnu(sig)
    setStatut(c.status)
    setFinEssai(c.status === 'essai' ? versChampDate(c.trialEndsAt) : finEssaiProposee(c.trialEndsAt))
    setEcheance(versChampDate(c.periodEndAt))
  }

  function choisir(code: StatutContrat) {
    setStatut(code)
    // Repasser en essai propose une fin à venir, jamais l'ancienne date échue.
    if (code === 'essai' && c.status !== 'essai') setFinEssai(finEssaiProposee(c.trialEndsAt))
  }

  const essai = statut === 'essai'
  const finIso = depuisChampDate(finEssai)
  const echeanceIso = echeance ? depuisChampDate(echeance) : null
  const statutChange = statut !== c.status
  const finChange = essai && (statutChange || finEssai !== versChampDate(c.trialEndsAt))
  const echeanceChange = !essai && echeance !== versChampDate(c.periodEndAt)
  const probleme = essai
    ? !finIso
      ? "Choisissez la date de fin de l'essai."
      : Date.parse(finIso) <= Date.now()
        ? "Cette date est passée : l'essai serait déjà fini. Choisissez une date à venir."
        : ''
    : echeance && !echeanceIso
      ? "Cette échéance n'est pas une date."
      : ''
  const touche = statutChange || finChange || echeanceChange
  const modifie = touche && !probleme

  async function appliquer() {
    if (!modifie || enCours) return
    const reglage: ReglageContrat = { statut }
    if (finChange) reglage.finEssai = finIso
    if (echeanceChange) reglage.echeance = echeanceIso
    setEnCours(true)
    await onContrat(reglage)
    setEnCours(false)
  }

  // Un contrat déjà hors règle n'a plus rien à fermer : pas de confirmation.
  const confirmer = statutChange && c.enRegle ? CONFIRMATION[statut] : undefined

  return (
    <div className={s.exceptionLevier}>
      <FieldLabel>Contrat</FieldLabel>
      <div className={s.exceptionEtats}>
        {CONTRATS.map((x) => (
          <Chip
            key={x.code}
            on={statut === x.code}
            onClick={() => choisir(x.code)}
            title={`Choisir « ${x.label.toLowerCase()} » pour le contrat de ${row.cabinet.name}`}
          >
            {x.label}
          </Chip>
        ))}
      </div>

      <label className={s.contratDate}>
        <span>{essai ? "Fin de l'essai" : 'Échéance de la période'}</span>
        <input
          type="date"
          className={s.champDate}
          value={essai ? finEssai : echeance}
          onChange={(e) => (essai ? setFinEssai(e.target.value) : setEcheance(e.target.value))}
          aria-label={essai ? `Fin de l'essai de ${row.cabinet.name}` : `Échéance du contrat de ${row.cabinet.name}`}
        />
      </label>
      {!essai ? <p className={s.exceptionNote}>Vide : aucune échéance.</p> : null}

      <p className={s.exceptionNote}>{noteDuContrat(c)}</p>
      {/* Un essai échu qu'on n'a pas touché se dit dans la note ; le problème
          ne s'affiche qu'à celui qui est en train de changer quelque chose. */}
      {touche && probleme ? <p className={s.probleme}>{probleme}</p> : null}

      <div className={s.contratGestes}>
        {confirmer ? (
          <GesteAConfirmer
            libelle="Appliquer"
            consequence={`Les leviers de ${row.cabinet.name} se ferment aussitôt : ${CE_QUI_EST_SUSPENDU}. Ses dossiers et les espaces de ses patients restent ouverts.`}
            confirmer={confirmer}
            enCours={enCours}
            libelleEnCours="Enregistrement…"
            disabled={!modifie}
            onConfirmer={() => void appliquer()}
          />
        ) : (
          <Button variant="secondary" onClick={() => void appliquer()} disabled={!modifie || enCours}>
            {enCours ? 'Enregistrement…' : 'Appliquer'}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Le contrat d'un cabinet et ses exceptions.
 *
 * Exportée : la fiche du cabinet (FicheCabinet.tsx) règle le même contrat
 * avec le même composant — deux éditeurs du même contrat finiraient par ne
 * plus dire la même chose.
 */
export function LigneException({
  row,
  onSave,
  onContrat,
}: {
  row: PortfolioRow
  onSave: (champs: Exceptions) => Promise<void>
  onContrat: (reglage: ReglageContrat) => Promise<boolean>
}) {
  const [max, setMax] = useState(
    row.subscription.maxPatientsOverride === null ? '' : String(row.subscription.maxPatientsOverride),
  )
  const [forfait, setForfait] = useState(
    row.subscription.jetonsMoisOverride === null ? '' : String(row.subscription.jetonsMoisOverride),
  )
  const [enCours, setEnCours] = useState(false)

  const saisi = plafond(max)
  const change = saisi !== 'invalide' && saisi !== row.subscription.maxPatientsOverride
  /* Le forfait négocié : vide, c'est l'offre qui décide. */
  const forfaitSaisi = forfait.trim() === '' ? null : entierSaisi(forfait, 0, FORFAIT_MAX)
  const forfaitInvalide = forfait.trim() !== '' && forfaitSaisi === null
  const forfaitChange = !forfaitInvalide && forfaitSaisi !== row.subscription.jetonsMoisOverride

  async function poser(champs: Exceptions) {
    if (enCours) return
    setEnCours(true)
    await onSave(champs)
    setEnCours(false)
  }

  return (
    <div className={s.exception}>
      {/* LE CONTRAT, ET CE QU'IL FERME. Ce réglage manquait : `status` était
          posé une fois à l'ouverture et plus jamais, donc l'essai ne finissait
          pas, l'impayé n'existait pas, et le revenu récurrent restait à zéro.
          Depuis 0035 il décide vraiment — d'où le geste pour le rouvrir. */}
      <ReglageDuContrat row={row} onContrat={onContrat} />

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

      <div className={s.exceptionMax}>
        <FieldLabel>Jetons IA par mois pour ce cabinet</FieldLabel>
        <div className={s.champUnite}>
          <TextInput
            inputMode="numeric"
            value={forfait}
            placeholder={String(row.plan.jetonsMois)}
            onChange={(e) => setForfait(e.target.value)}
            aria-label={`Forfait mensuel de jetons pour ${row.cabinet.name}`}
          />
          <Button
            variant="ghost"
            onClick={() => void poser({ jetonsMoisOverride: forfaitSaisi })}
            disabled={!forfaitChange || enCours}
          >
            {enCours ? '…' : 'Appliquer'}
          </Button>
        </div>
        <p className={forfaitInvalide ? s.probleme : s.exceptionNote}>
          {forfaitInvalide
            ? 'Un nombre entier de jetons — ou rien pour revenir à l’offre.'
            : `Vide, c'est l'offre qui décide : ${jetonsDits(row.plan.jetonsMois)}. Le forfait déjà versé ce mois-ci ne change pas.`}
        </p>
      </div>

      <FacturationDuCabinet row={row} occupe={enCours} poser={poser} />

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
              {levierDansLOffre(l.code, row.plan[l.code])}{' '}
              {levierOuvert(row.subscription, row.plan, l.code) ? 'Actif pour ce cabinet.' : 'Inactif pour ce cabinet.'}
              {/* Le pass acheté ouvre l'hypnose quoi qu'en dise l'offre : il se
                  lit ici, à côté de l'exception qu'il rend inutile. */}
              {l.code === 'hypnoseIncluse' && passHypnoseEnCours(row.subscription)
                ? ` Pass Hypnose acheté, jusqu'au ${dateLongue(row.subscription.hypnoseJusquAu)}.`
                : ''}
            </p>
          </div>
        )
      })}

      <JetonsDuCabinet row={row} />
    </div>
  )
}

/** Les trois choix de la facturation d'un cabinet : le réglage du revendeur, ou l'un des deux modes. */
type ChoixFacturation = 'revendeur' | ModeFacturation

/** « Jetons », « Clé du cabinet » : le mode dit en deux mots, pour une étiquette. */
function modeCourt(mode: ModeFacturation): string {
  return mode === 'jetons' ? 'Jetons' : 'Clé du cabinet'
}

/**
 * Qui paie l'analyse de CE cabinet (0070) : le réglage du revendeur — la
 * règle de tous ses cabinets —, ou l'un des deux modes par exception.
 *
 * Garder un cabinet sur sa propre clé chez un revendeur en jetons, ou en
 * passer un seul en jetons pour essayer avant les autres : c'est le même
 * geste que les autres exceptions, au propriétaire seul (0063), et le
 * journal du contrat le garde.
 *
 * LES JETONS DEMANDENT LA CLÉ DU REVENDEUR. Sans elle, le choix est grisé et
 * dit pourquoi — la base le refuserait de toute façon. Retirée après coup,
 * le cabinet reste en jetons (jamais de repli silencieux sur sa clé) et son
 * analyse est suspendue : l'écran le dit en clair.
 */
function FacturationDuCabinet({
  row,
  occupe,
  poser,
}: {
  row: PortfolioRow
  occupe: boolean
  poser: (champs: Exceptions) => Promise<void>
}) {
  const jetons = useJetonsRevendeur()
  const proprietaire = useMaybeAuth()?.context?.reseller?.role === 'owner'
  const etat = jetons?.etat ?? null
  /* Le réglage du revendeur, et sa clé : inconnus tant que l'état n'est pas
     lu. On ne grise alors rien — la base tranche. */
  const defaut = etat?.mode ?? null
  const clePosee = etat ? etat.cle.posee : true
  const actuel = row.subscription.facturationIaOverride
  const choix: ChoixFacturation = actuel ?? 'revendeur'
  // La règle même de la base : l'exception, sinon le réglage du revendeur.
  const effectif: ModeFacturation | null = actuel ?? defaut

  const options: Array<{ value: ChoixFacturation; label: string; bloque: boolean }> = [
    {
      value: 'revendeur',
      label: defaut
        ? `Selon le réglage du revendeur (actuellement : ${modeCourt(defaut)})`
        : 'Selon le réglage du revendeur',
      bloque: false,
    },
    { value: 'cle_cabinet', label: 'Clé Anthropic du cabinet (BYOK)', bloque: false },
    // Déjà en jetons, le choix reste allumé : on ne grise pas l'état en place.
    { value: 'jetons', label: 'Jetons', bloque: !clePosee && actuel !== 'jetons' },
  ]

  async function choisir(valeur: ChoixFacturation) {
    if (valeur === choix) return
    await poser({ facturationIaOverride: valeur === 'revendeur' ? null : valeur })
    // Le mode effectif se relit chez le serveur : l'onglet Jetons IA le montre aussi.
    void jetons?.recharger()
  }

  return (
    <div className={`${s.exceptionLevier} ${s.exceptionLarge}`}>
      <FieldLabel>Facturation de l'IA</FieldLabel>
      {/* Un `fieldset` désactivé neutralise ses boutons pour de bon, souris et
          clavier compris : `Chip` n'a pas de `disabled`. */}
      <fieldset className={s.choixFacturation} disabled={!proprietaire || occupe}>
        {options.map((o) => (
          <fieldset key={o.value} className={s.choixFacturation} disabled={o.bloque}>
            <Chip
              on={choix === o.value}
              onClick={() => void choisir(o.value)}
              title={
                o.bloque
                  ? "Posez d'abord votre clé Anthropic dans l'onglet Jetons IA."
                  : `Facturation de l'IA pour ${row.cabinet.name} : ${o.label}`
              }
            >
              {o.label}
            </Chip>
          </fieldset>
        ))}
      </fieldset>
      {actuel === 'jetons' && !clePosee ? (
        <p className={s.probleme}>
          Votre clé Anthropic n'est plus posée : l'analyse de ce cabinet est suspendue. Reposez-la
          dans l'onglet Jetons IA, ou rendez-lui sa propre clé.
        </p>
      ) : (
        <p className={s.exceptionNote}>
          {effectif === 'jetons'
            ? 'Ce cabinet paie son analyse en jetons, avec votre clé.'
            : effectif === 'cle_cabinet'
              ? 'Ce cabinet paie son analyse avec sa propre clé Anthropic.'
              : ''}
          {actuel === 'jetons' && defaut === 'cle_cabinet'
            ? " Il passe en jetons avant vos autres cabinets : son forfait mensuel s'applique."
            : ''}
          {!clePosee && actuel !== 'jetons' ? " Jetons : posez d'abord votre clé Anthropic dans l'onglet Jetons IA." : ''}
          {proprietaire ? '' : ' Réservé au compte propriétaire.'}
        </p>
      )}
    </div>
  )
}

/**
 * Les jetons d'un cabinet : son solde, ce qu'il a consommé ce mois-ci, et le
 * geste du propriétaire qui lui en offre.
 *
 * Offrir crée un lot valable douze mois, inscrit au journal (server/
 * revendeur.ts). Un membre de l'équipe voit le solde, sans le geste.
 */
function JetonsDuCabinet({ row }: { row: PortfolioRow }) {
  const jetons = useJetonsRevendeur()
  const [nombre, setNombre] = useState('')
  const [note, setNote] = useState('')
  const [sortie, setSortie] = useState<{ ton: 'ok' | 'warn'; texte: string } | null>(null)
  if (!jetons?.etat) return null

  const lu = jetons.duCabinet(row.cabinet.id)
  const proprietaire = jetons.reel && jetons.etat.proprietaire
  const n = entierSaisi(nombre, 1, 100_000)
  const cle = `offrir-${row.cabinet.id}`

  async function offrir() {
    if (!jetons || n === null) return
    setSortie(null)
    const r = await jetons.agir(
      cle,
      { action: 'offrir', cabinetId: row.cabinet.id, jetons: n, ...(note.trim() ? { note: note.trim() } : {}) },
      `${offertsDits(n)} à ${row.cabinet.name}, valable${n > 1 ? 's' : ''} douze mois.`,
    )
    setSortie({ ton: r.ok ? 'ok' : 'warn', texte: r.message })
    if (r.ok) {
      setNombre('')
      setNote('')
    }
  }

  return (
    <div className={s.exceptionLevier}>
      <FieldLabel>Jetons IA</FieldLabel>
      <p className={s.jetonsSolde}>
        {lu ? (
          <>
            <strong>{jetonsDits(lu.solde)}</strong> en solde · {lu.consommesMois.toLocaleString('fr-FR')}{' '}
            {lu.consommesMois > 1 ? 'consommés' : 'consommé'} ce mois-ci
          </>
        ) : (
          'Solde non lu.'
        )}
      </p>
      <p className={s.exceptionNote}>
        Forfait : {jetonsDits(jetonsMoisOf(row.subscription, row.plan))} par mois
        {/* Le mode DE CE CABINET (0070), pas celui du revendeur : un cabinet
            passé seul en jetons reçoit son forfait, un cabinet gardé sur sa
            clé n'en reçoit pas. */}
        {(row.subscription.facturationIaOverride ?? jetons.etat.mode) === 'jetons'
          ? '.'
          : ' — sans effet tant que ce cabinet paie avec sa propre clé.'}
      </p>
      {proprietaire ? (
        <form
          className={s.offrir}
          onSubmit={(e) => {
            e.preventDefault()
            void offrir()
          }}
        >
          <TextInput
            inputMode="numeric"
            value={nombre}
            placeholder="100"
            onChange={(e) => setNombre(e.target.value)}
            aria-label={`Jetons à offrir à ${row.cabinet.name}`}
          />
          <TextInput
            value={note}
            maxLength={200}
            placeholder="Note (facultative)"
            onChange={(e) => setNote(e.target.value)}
            aria-label="Note du geste, pour le journal"
          />
          <Button variant="secondary" type="submit" disabled={n === null || jetons.enCours !== ''}>
            {jetons.enCours === cle ? 'Envoi…' : 'Offrir des jetons'}
          </Button>
        </form>
      ) : (
        <p className={s.exceptionNote}>Offrir des jetons est réservé au compte propriétaire.</p>
      )}
      {sortie ? <p className={sortie.ton === 'ok' ? s.exceptionNote : s.probleme}>{sortie.texte}</p> : null}
    </div>
  )
}

export function PlansView() {
  const {
    rows,
    offres,
    journal,
    reel,
    chargement,
    erreur,
    changerOffre,
    enregistrerOffre,
    reglerExceptions,
    reglerContrat,
  } = useResellerData()
  const { state, set } = useStore()
  /* Le catalogue se règle par le PROPRIÉTAIRE du revendeur (0025, 0049) : un
     membre de son équipe voyait des champs éditables, tapait un prix, et
     n'apprenait qu'à l'enregistrement que la base l'avait refusé. */
  const auth = useMaybeAuth()
  const proprietaire = auth?.context?.reseller?.role === 'owner'
  /** Le cabinet dont l'offre est en cours de changement, s'il y en a un. */
  const [enCours, setEnCours] = useState('')
  /** Le cabinet dont on a ouvert les exceptions. */
  const [ouvert, setOuvert] = useState('')
  const [echec, setEchec] = useState('')
  /** Le journal se lit par le haut ; le reste se déplie. */
  const [toutLeJournal, setToutLeJournal] = useState(false)

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

  async function saveContrat(cabinetId: string, reglage: ReglageContrat): Promise<boolean> {
    nettoyer()
    const resultat = await reglerContrat(cabinetId, reglage)
    if (resultat.ok) set({ rNotice: resultat.message, rNoticeTon: 'ok' })
    else setEchec(resultat.message)
    return resultat.ok
  }

  /** Le nom d'aujourd'hui d'une offre : le journal garde son code, qui ne change pas. */
  function nomOffre(code: string): string {
    return offres.find((p) => p.code === code)?.label ?? code
  }

  const lignesJournal = toutLeJournal ? journal : journal.slice(0, 12)

  return (
    <>
      <div className={s.plans}>
        {offres.map((plan) => (
          <CarteOffre
            key={plan.code}
            plan={plan}
            cabinets={rows.filter((r) => r.subscription.plan === plan.code).length}
            editable={reel && proprietaire}
            onSave={(champs) => saveOffre(plan.code, champs)}
          />
        ))}
      </div>

      {reel && !proprietaire && offres.length > 0 ? (
        <p className={s.demo}>
          Le catalogue se règle par le compte propriétaire de votre organisation. Les contrats et
          les exceptions de chaque cabinet, eux, se règlent ci-dessous.
        </p>
      ) : null}

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

      {/* Un catalogue vide se dit : il retombait sur celui de la démonstration,
          avec des prix fictifs et des offres qu'on ne peut pas poser. */}
      {reel && !chargement && offres.length === 0 && !erreur ? (
        <Notice tone="warn" style={{ marginBottom: 18 }}>
          Votre catalogue ne compte encore aucune offre. Elles se créent avec la plateforme, sous
          votre nom : écrivez-nous pour ouvrir les vôtres.
        </Notice>
      ) : null}

      {/* Dit une fois, sobrement : sans session, ces abonnements sont fictifs.
          Pas pendant le chargement : on ne sait pas encore s'il y a une session. */}
      {!reel && !chargement ? (
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
          const exceptions =
            row.subscription.maxPatientsOverride !== null ||
            row.subscription.shopOverride !== null ||
            row.subscription.marqueBlancheOverride !== null ||
            row.subscription.siteOverride !== null ||
            row.subscription.jetonsMoisOverride !== null ||
            row.subscription.hypnoseOverride !== null ||
            row.subscription.facturationIaOverride !== null
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
                  <Pill tone={tonContrat(row.subscription)}>{libelleContrat(row.subscription)}</Pill>
                  {/* La fin d'essai pour un essai, l'échéance sinon ; pas de
                      date en base : un tiret, plutôt qu'une date inventée. */}
                  <div style={{ marginTop: 5 }}>{dateDuContrat(row.subscription)}</div>
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
                  onContrat={(reglage) => saveContrat(row.cabinet.id, reglage)}
                />
              ) : null}
            </div>
          )
        })}

        <p className={s.foot}>
          Une offre règle ce que l'application ouvre : le nombre de fiches actives, la boutique, la
          marque blanche, le site vitrine et l'hypnose. L'analyse est payée de deux façons, selon
          l'onglet Jetons IA : par chaque cabinet avec sa propre clé Anthropic, ou par la vôtre — et
          chaque offre verse alors son forfait mensuel de jetons. L'exception « Facturation de
          l'IA » place un cabinet dans l'autre mode, cabinet par cabinet. Un plafond de fiches atteint
          n'enferme rien : le cabinet clôt un suivi terminé, ou vous relevez le plafond ici. Un
          contrat hors règle — essai fini, impayé, suspendu, résilié — suspend{' '}
          {CE_QUI_EST_SUSPENDU} ; les dossiers restent entiers.
        </p>
      </section>

      {/* LE JOURNAL. Une offre réglée vaut pour tous ses cabinets, un statut
          ferme ou rouvre des leviers : « qui a passé ce cabinet en résilié, et
          quand ? » doit avoir une réponse. Écrit par la base (0049), à chaque
          changement, quel qu'en soit le chemin. */}
      {reel ? (
        <section className={s.table} style={{ marginTop: 18 }}>
          <div className={s.tableHead}>
            <h2 className={s.tableTitle}>Journal des offres et des contrats</h2>
            <span style={{ fontSize: 11.5, color: 'var(--c-text-muted)' }}>
              {plural(journal.length, 'changement', 'changements')}
              {journal.length >= 50 ? ', les plus récents' : ''}
            </span>
          </div>
          {journal.length === 0 ? (
            <p className={s.journalVide}>
              Aucun changement pour l'instant. Chaque changement d'offre, de prix, de statut,
              d'échéance ou d'exception s'inscrira ici, avec sa date.
            </p>
          ) : (
            <ul className={s.journal}>
              {lignesJournal.map((e, i) => (
                <li key={`${e.quand}-${i}`} className={s.journalLigne}>
                  <span className={s.journalQuand}>
                    {new Date(e.quand).toLocaleString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span>
                    {phraseDuJournal(e, nomOffre)} <span className={s.journalAuteur}>{auteurDit(e.auteur)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {journal.length > lignesJournal.length || toutLeJournal ? (
            <div className={s.journalPied}>
              <Button variant="ghost" onClick={() => setToutLeJournal((v) => !v)}>
                {toutLeJournal ? 'Replier' : `Voir les ${journal.length - lignesJournal.length} suivants`}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
