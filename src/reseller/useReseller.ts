/**
 * L'espace revendeur, branché sur la base.
 *
 * Toutes les lectures passent par `reseller_cabinet_overview()` : une fonction
 * qui filtre sur l'appartenance du demandeur et ne rend que des compteurs.
 * Aucune requête d'ici ne touche une table de santé — et si l'une essayait,
 * la RLS ne lui rendrait rien.
 *
 * Sans session (démonstration publique), tout retombe sur le portefeuille
 * fictif de src/data/reseller.ts : les écrans restent montrables sans compte.
 */
import { useCallback, useEffect, useState } from 'react'
import { useRetour } from '@/lib/useRetour'
import { dateLongue } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { EntreeJournal } from '@/lib/contrat'
import { problemeIdentifiant } from '@/lib/identifiant'
import { demanderInvitation } from '@/services/invitations'
import { annulerInvitation as annulerEcriture, poserInvitation, relancerInvitation as relancerEcriture } from '@/services/equipe'
import { etiquetteEquipe } from '@/lib/equipe'
import { messageFermeture, separerFermes } from '@/lib/revendeur'
import { CABINETS, CABINET_STATS, PLANS, SUBSCRIPTIONS } from '@/data/reseller'
import { slugify } from '@/state/resellerSelectors'
import type { CabinetBranding, Plan, PlanCode, PortfolioRow } from '@/types/reseller'

/** Une ligne de la table `plans`, telle que le revendeur la règle. */
interface PlanRow {
  code: PlanCode
  label: string
  price_cents: number
  max_patients: number | null
  shop: boolean
  marque_blanche: boolean
  site: boolean
  position: number
}

/** Les exceptions négociées, lues sur `subscriptions`. */
interface ExceptionRow {
  cabinet_id: string
  max_patients_override: number | null
  shop_override: boolean | null
  marque_blanche_override: boolean | null
  site_override: boolean | null
}

/** Une ligne de `reseller_cabinet_overview()`. */
interface OverviewRow {
  cabinet_id: string
  cabinet_name: string
  slug: string
  created_at: string
  archived: boolean
  therapists: number
  patients_active: number
  adherence_avg: number | null
  sessions_30d: number
  /** Dépense d'analyse du mois civil, en centimes décimaux (payée par le cabinet). */
  ai_spend_cents_month?: number | string | null
  plan_code: PlanCode | null
  plan_label: string | null
  status: string | null
  current_period_end: string | null
  trial_ends_at: string | null
  en_regle: boolean | null
}

/** La fiche éditable d'un cabinet, lue dans `cabinets`. */
interface CabinetRow {
  id: string
  name: string
  slug: string
  tagline: string
  branding: CabinetBranding
  created_at: string
  /** Posé par la base à la fermeture (0057) ; null tant que le cabinet tourne. */
  archived_at?: string | null
}

/** Une ligne de `journal_des_contrats()` (0049). */
interface JournalRow {
  quand: string
  action: string
  cabinet_id: string | null
  cabinet: string | null
  meta: Record<string, unknown> | null
  auteur: EntreeJournal['auteur']
}

/** Un ancien identifiant, qui mène toujours au cabinet (0049). */
export interface AncienIdentifiant {
  slug: string
  cabinet_id: string
}

export interface Praticienne {
  cabinet_id: string
  display_name: string
  role: string
}

export interface InvitationEnAttente {
  id: string
  cabinet_id: string
  email: string
  expires_at: string
  /** `owner` : l'ouverture du cabinet. `therapist` : une consœur, invitée par la titulaire. */
  role: string
  /** Le nom saisi à l'invitation, repris par claim_access (0042). */
  display_name: string | null
}

export interface NouveauCabinet {
  nom: string
  slug: string
  praticienne: string
  email: string
  offre: PlanCode
}

export interface Resultat {
  ok: boolean
  message: string
  /**
   * Réussi, mais pas entièrement.
   *
   * Le cabinet est ouvert, l'invitation est posée — et son courriel n'est pas
   * parti. `ok` reste vrai : reprendre le geste rejouerait une écriture déjà
   * faite. Mais l'écran ne doit pas peindre en vert une phrase qui dit non.
   */
  partiel?: boolean
}

/** Ce que le revendeur peut changer sur une offre. */
export interface ReglageOffre {
  label?: string
  priceCents?: number
  maxPatients?: number | null
  shop?: boolean
  marqueBlanche?: boolean
  site?: boolean
}

/** Les exceptions accordées à un cabinet. `null` remet l'offre en vigueur. */
export interface Exceptions {
  maxPatientsOverride?: number | null
  shopOverride?: boolean | null
  marqueBlancheOverride?: boolean | null
  siteOverride?: boolean | null
}

/**
 * Ce que le revendeur change au contrat d'un cabinet.
 *
 * Seules les dates PASSÉES ici s'écrivent : un changement de statut ne
 * touche plus l'échéance. Elle était remise à vide à chaque clic, si bien
 * qu'une échéance posée ailleurs — à la main, ou demain par la facturation —
 * disparaissait au premier changement de statut.
 */
export interface ReglageContrat {
  statut: StatutContrat
  /** Fin d'essai, en ISO. */
  finEssai?: string | null
  /** Fin de période payée, en ISO. null l'efface. */
  echeance?: string | null
}

export interface ResellerData {
  /** Les cabinets qui tournent. Les fermés sont à part : ils ne comptent nulle part. */
  rows: PortfolioRow[]
  /** Les cabinets fermés par le revendeur (0057), qui se rouvrent depuis leur fiche. */
  fermes: PortfolioRow[]
  /** Le catalogue, tel qu'il est en base — ou celui de démonstration. */
  offres: Plan[]
  praticiennes: Praticienne[]
  invitations: InvitationEnAttente[]
  /** Les changements d'offre et de contrat, les plus récents d'abord. */
  journal: EntreeJournal[]
  /** Les anciens identifiants des cabinets, qui mènent toujours à eux. */
  anciensIdentifiants: AncienIdentifiant[]
  /** Vrai quand les données viennent de la base et non de la démonstration. */
  reel: boolean
  chargement: boolean
  erreur: string
  recharger: () => Promise<void>
  ouvrirCabinet: (input: NouveauCabinet) => Promise<Resultat>
  inviterPraticienne: (cabinetId: string, email: string, nom?: string) => Promise<Resultat>
  /** Trente jours de plus pour l'invitation d'ouverture, et le courriel renvoyé. */
  relancerInvitation: (invitationId: string) => Promise<Resultat>
  /** Une autre adresse (et un autre nom) pour l'invitation d'ouverture, puis l'envoi. */
  changerInvitation: (invitationId: string, email: string, nom?: string) => Promise<Resultat>
  /** Retire l'invitation d'ouverture : le cabinet redevient sans praticienne. */
  annulerInvitation: (invitationId: string) => Promise<Resultat>
  enregistrerMarque: (
    cabinetId: string,
    fiche: { name?: string; slug?: string; tagline?: string; branding?: CabinetBranding },
  ) => Promise<Resultat>
  changerOffre: (cabinetId: string, offre: PlanCode) => Promise<Resultat>
  /** Règle une offre du catalogue : son prix et ce qu'elle ouvre. */
  enregistrerOffre: (code: PlanCode, champs: ReglageOffre) => Promise<Resultat>
  /** Accorde ou retire une exception à un cabinet, sans toucher à l'offre. */
  reglerExceptions: (cabinetId: string, champs: Exceptions) => Promise<Resultat>
  /** Pose le statut du contrat, et les dates que le revendeur a choisies. */
  reglerContrat: (cabinetId: string, reglage: ReglageContrat) => Promise<Resultat>
  /** Ferme un cabinet (`fermer` vrai) ou le rouvre. Réservé au propriétaire (0057). */
  fermerCabinet: (cabinetId: string, fermer: boolean) => Promise<Resultat>
  /** L'historique du contrat d'UN cabinet, fermetures comprises, le plus récent d'abord. */
  lireJournalDuCabinet: (cabinetId: string) => Promise<{ entrees: EntreeJournal[]; erreur: string }>
}

/** Les cinq états d'un contrat, tels que la base les connaît. */
export type StatutContrat = 'essai' | 'actif' | 'impaye' | 'suspendu' | 'resilie'

/** Ce qu'on en dit à l'écran. */
export const LIBELLE_CONTRAT: Record<StatutContrat, string> = {
  essai: 'essai',
  actif: 'actif',
  impaye: 'impayé',
  suspendu: 'suspendu',
  resilie: 'résilié',
}

/**
 * L'offre d'un cabinet qui n'en a aucune.
 *
 * Ni un plan du catalogue ni un plan vide au hasard : ce qu'un cabinet sans
 * ligne d'abonnement possède réellement, c'est-à-dire rien.
 */
const SANS_OFFRE: Plan = {
  code: '' as PlanCode,
  label: 'Sans offre',
  priceCents: 0,
  maxPatients: 0,
  shop: false,
  marqueBlanche: false,
  site: false,
  includes: [],
}

/** Le portefeuille de démonstration, quand il n'y a pas de session. */
function portefeuilleFictif(): PortfolioRow[] {
  return CABINETS.filter((c) => !c.archived).map((cabinet) => {
    const subscription = SUBSCRIPTIONS[cabinet.id]
    const plan = PLANS.find((p) => p.code === subscription.plan) ?? PLANS[0]
    return { cabinet, stats: CABINET_STATS[cabinet.id], subscription, plan }
  })
}

/** Une ligne de la base, mise à la forme que les écrans attendent déjà. */
function versPortfolio(
  o: OverviewRow,
  fiche: CabinetRow | undefined,
  offres: Plan[],
  exception: ExceptionRow | undefined,
): PortfolioRow {
  /* UN CABINET SANS CONTRAT N'A PAS D'OFFRE. Il retombait sur la première du
     catalogue : l'écran affichait « Essentiel · 25 fiches », allumait la
     pastille Essentiel, listait ses leviers, et le comptait même parmi les
     abonnés de cette offre dans le revenu récurrent. Or il n'avait aucun
     plafond en base — `verifier_plafond_patientes` ne trouvait pas de ligne —
     et donc aucun des droits affichés. On rend maintenant ce qu'il est. */
  /* Une offre absente du catalogue lu — posée par la plateforme hors du
     catalogue de ce revendeur (0049) — ne devient pas la première venue :
     on garde son nom, sans lui prêter de prix ni de leviers. */
  const plan = o.plan_code
    ? (offres.find((p) => p.code === o.plan_code) ?? {
        ...SANS_OFFRE,
        code: o.plan_code,
        label: o.plan_label ?? o.plan_code,
        maxPatients: null,
      })
    : SANS_OFFRE
  return {
    cabinet: {
      id: o.cabinet_id,
      name: o.cabinet_name,
      slug: o.slug,
      tagline: fiche?.tagline ?? 'Espace thérapie',
      branding: fiche?.branding ?? {
        accent: '#A17A45',
        accentHover: '#856239',
        accentDeep: '#6E5230',
        dark: '#33291C',
        logo: o.cabinet_name.slice(0, 2).toUpperCase(),
      },
      therapist: '',
      email: '',
      // L'horodatage brut s'affichait tel quel sous le nom du cabinet.
      since: `Depuis le ${dateLongue(o.created_at)}`,
      archived: o.archived,
      fermeLe: fiche?.archived_at ?? null,
    },
    stats: {
      therapists: Number(o.therapists ?? 0),
      patientsActive: Number(o.patients_active ?? 0),
      adherenceAvg: o.adherence_avg === null ? null : Number(o.adherence_avg),
      sessions30d: Number(o.sessions_30d ?? 0),
      // numeric arrive en texte par PostgREST : Number() le lit dans les deux cas.
      analyseCentsMois: Number(o.ai_spend_cents_month ?? 0) || 0,
    },
    subscription: {
      cabinetId: o.cabinet_id,
      plan: (o.plan_code ?? '') as PlanCode,
      status: (o.status ?? 'essai') as PortfolioRow['subscription']['status'],
      periodEnd: dateLongue(o.current_period_end),
      trialEnd: dateLongue(o.trial_ends_at),
      trialEndsAt: o.trial_ends_at,
      periodEndAt: o.current_period_end,
      /* Le verdict vient de la base, jamais d'un calcul refait ici. Sans
         contrat, il est faux — et c'est ce qui allume « Contrats en défaut ». */
      enRegle: o.en_regle === true,
      maxPatientsOverride: exception?.max_patients_override ?? null,
      shopOverride: exception?.shop_override ?? null,
      marqueBlancheOverride: exception?.marque_blanche_override ?? null,
      siteOverride: exception?.site_override ?? null,
    },
    plan,
  }
}

/** Le catalogue de la base, à la forme des écrans. */
function versOffre(r: PlanRow): Plan {
  return {
    code: r.code,
    label: r.label,
    priceCents: r.price_cents,
    maxPatients: r.max_patients,
    shop: Boolean(r.shop),
    marqueBlanche: Boolean(r.marque_blanche),
    site: Boolean(r.site),
    // L'argumentaire reste écrit dans le produit : c'est du texte de vente,
    // pas une donnée que le revendeur règle écran par écran.
    includes: PLANS.find((p) => p.code === r.code)?.includes ?? [],
  }
}

export function useReseller(): ResellerData {
  /* RIEN DE FICTIF TANT QU'ON NE SAIT PAS. Le portefeuille démarrait sur la
     démonstration et la gardait jusqu'à la réponse de la base — ou pour de
     bon si la lecture échouait : un revendeur connecté voyait cinq cabinets
     inventés, un revenu inventé, et « connectez-vous » sous les yeux. La
     démonstration n'est plus servie qu'une fois établi qu'il n'y a pas de
     session. Sans base du tout, on le sait d'emblée : la démonstration est
     servie dès le premier rendu, banc de rendu compris. */
  const [rows, setRows] = useState<PortfolioRow[]>(() => (supabase() ? [] : portefeuilleFictif()))
  const [fermes, setFermes] = useState<PortfolioRow[]>([])
  const [offres, setOffres] = useState<Plan[]>(() => (supabase() ? [] : PLANS))
  const [praticiennes, setPraticiennes] = useState<Praticienne[]>([])
  const [invitations, setInvitations] = useState<InvitationEnAttente[]>([])
  const [journal, setJournal] = useState<EntreeJournal[]>([])
  const [anciensIdentifiants, setAnciensIdentifiants] = useState<AncienIdentifiant[]>([])
  const [reel, setReel] = useState(false)
  const [chargement, setChargement] = useState(() => Boolean(supabase()))
  const [erreur, setErreur] = useState('')

  const recharger = useCallback(async () => {
    const db = supabase()
    if (!db) {
      setRows(portefeuilleFictif())
      setFermes([])
      setOffres(PLANS)
      setReel(false)
      setChargement(false)
      return
    }

    // Sans session, on montre le portefeuille de démonstration plutôt qu'un
    // écran vide : les captures et les démonstrations restent possibles.
    const { data: auth } = await db.auth.getSession()
    if (!auth.session) {
      setRows(portefeuilleFictif())
      setFermes([])
      setOffres(PLANS)
      setReel(false)
      setChargement(false)
      return
    }
    setErreur('')
    // Une session : ce qui s'affiche désormais vient de la base, ou rien.
    setReel(true)

    const [apercu, fiches, membres, invits, catalogue, exceptions, lignesJournal, anciens] = await Promise.all([
      db.rpc('reseller_cabinet_overview'),
      db.from('cabinets').select('id, name, slug, tagline, branding, created_at, archived_at'),
      db.from('cabinet_members').select('cabinet_id, display_name, role'),
      db
        .from('cabinet_invitations')
        .select('id, cabinet_id, email, expires_at, role, display_name')
        .is('accepted_at', null)
        .order('created_at'),
      db.from('plans').select('code, label, price_cents, max_patients, shop, marque_blanche, site, position').order('position'),
      db
        .from('subscriptions')
        .select('cabinet_id, max_patients_override, shop_override, marque_blanche_override, site_override'),
      db.rpc('journal_des_contrats', { p_limite: 50 }),
      db.from('cabinet_slug_aliases').select('slug, cabinet_id').order('created_at', { ascending: false }),
    ])

    if (apercu.error) {
      // Une lecture ratée ne laisse rien à l'écran — surtout pas l'ancien état.
      setRows([])
      setFermes([])
      setErreur("Votre portefeuille n'a pas pu être chargé. Réessayez dans un instant.")
      setChargement(false)
      return
    }

    const parId = new Map<string, CabinetRow>()
    for (const f of (fiches.data ?? []) as CabinetRow[]) parId.set(f.id, f)

    /* LE CATALOGUE EST CELUI DE CE REVENDEUR (0049). Il retombait sur celui
       de la démonstration quand la base n'en rendait aucun : un revendeur
       sans offre voyait des prix fictifs, et des codes qu'il ne peut pas
       poser. Vide, il reste vide — l'écran Offres le dit. */
    if (catalogue.error) setErreur("Votre catalogue d'offres n'a pas pu être lu. Réessayez dans un instant.")
    const cat = ((catalogue.data ?? []) as PlanRow[]).map(versOffre)
    setOffres(cat)

    /* Le journal et les anciens identifiants ne bloquent rien : sans eux,
       l'écran reste juste, il en dit seulement moins. */
    setJournal(
      ((lignesJournal.data ?? []) as JournalRow[]).map((l) => ({
        quand: l.quand,
        action: l.action,
        cabinetId: l.cabinet_id,
        cabinet: l.cabinet,
        meta: l.meta ?? {},
        auteur: l.auteur,
      })),
    )
    setAnciensIdentifiants((anciens.data ?? []) as AncienIdentifiant[])

    const parCabinet = new Map<string, ExceptionRow>()
    for (const e of (exceptions.data ?? []) as ExceptionRow[]) parCabinet.set(e.cabinet_id, e)

    const equipes = (membres.data ?? []) as Praticienne[]
    const attente = (invits.data ?? []) as InvitationEnAttente[]
    const lignes = ((apercu.data ?? []) as OverviewRow[]).map((o) => {
      const row = versPortfolio(o, parId.get(o.cabinet_id), cat, parCabinet.get(o.cabinet_id))
      const equipe = equipes.filter((m) => m.cabinet_id === o.cabinet_id)
      /* Seule l'invitation d'ouverture parle au revendeur : celles que la
         titulaire adresse à son équipe ne sont pas les siennes. Et son
         échéance compte — « Invitation envoyée » sur une invitation échue
         depuis des semaines laissait croire qu'il suffisait d'attendre. */
      const invit = attente.find((i) => i.cabinet_id === o.cabinet_id && i.role === 'owner')
      row.cabinet.therapist = etiquetteEquipe(equipe, equipe.length ? null : invit)
      row.cabinet.email = equipe.length ? '' : (invit?.email ?? '')
      return row
    })

    /* Les cabinets fermés sortent du portefeuille (0057) : ils ne sont plus en
       règle par construction, et les y laisser allumait « Contrats en
       défaut » et faussait les fiches vendues pour un geste voulu. */
    const { ouverts, fermes: clos } = separerFermes(lignes)
    setRows(ouverts)
    setFermes(clos)
    setPraticiennes(equipes)
    setInvitations(attente)
    setChargement(false)
  }, [])

  useEffect(() => {
    void recharger()
  }, [recharger])

  /* Le portefeuille montrait l'état du monde à l'ouverture de l'onglet, et
     rien d'autre : une praticienne acceptait son invitation pendant que le
     revendeur regardait sa liste, et la ligne disait « Invitation envoyée »
     jusqu'au rechargement de la page. Les deux autres fournisseurs se relisent
     au retour d'onglet depuis longtemps. */
  useRetour(() => void recharger())

  /**
   * Ouvrir un cabinet, c'est trois écritures : la fiche, son offre, et
   * l'invitation de la praticienne. Le revendeur ne devient jamais membre du
   * cabinet qu'il ouvre — c'est ce qui le tient à l'écart des patients.
   */
  const ouvrirCabinet = useCallback(
    async (input: NouveauCabinet): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) {
        return { ok: false, message: "Connectez-vous à votre espace revendeur pour ouvrir un cabinet." }
      }

      const { data: moi, error: eMoi } = await db.from('reseller_members').select('reseller_id').limit(1).maybeSingle()
      if (eMoi || !moi) return { ok: false, message: "Votre organisation n'a pas pu être identifiée." }

      const slug = slugify(input.slug || input.nom)
      /* L'identifiant est une adresse à la racine du domaine : certains mots
         y heurteraient une route du produit. La base refuse déjà — mais son
         refus est un code d'erreur, et le revendeur mérite de savoir lequel
         de ses mots pose problème avant d'avoir rempli tout le formulaire.
         Le formulaire a désormais son champ « Identifiant » : « choisissez-en
         un autre » désigne enfin quelque chose. */
      const probleme = problemeIdentifiant(slug)
      if (probleme) return { ok: false, message: `${probleme} Choisissez-en un autre dans le champ Identifiant.` }
      const initiales =
        input.nom
          .split(/\s+/)
          .filter((m) => /[A-Za-zÀ-ÿ]/.test(m))
          .slice(-2)
          .map((m) => m[0]?.toUpperCase() ?? '')
          .join('') || 'CB'

      const { data: cabinet, error: eCab } = await db
        .from('cabinets')
        .insert({
          reseller_id: moi.reseller_id,
          name: input.nom.trim(),
          slug,
          tagline: 'Espace thérapie',
          branding: {
            accent: '#A17A45',
            accentHover: '#856239',
            accentDeep: '#6E5230',
            dark: '#33291C',
            logo: initiales,
          },
        })
        .select('id, name')
        .single()

      if (eCab || !cabinet) {
        const doublon = eCab?.code === '23505'
        // 23514 : la contrainte de forme. Le message doit dire quoi corriger.
        const refuse = eCab?.code === '23514'
        return {
          ok: false,
          message: doublon
            ? `L'identifiant « ${slug} » est déjà pris, ou a déjà servi à un autre cabinet dont les anciens liens y mènent encore. Choisissez-en un autre.`
            : refuse
              ? `L'identifiant « ${slug} » ne peut pas servir d'adresse : lettres non accentuées, chiffres et tirets, et pas un mot réservé par la plateforme.`
              : "Le cabinet n'a pas pu être créé. Réessayez.",
        }
      }

      /* Le nom de la praticienne part avec l'invitation : claim_access le
         reprend (0042). Il inscrivait jusqu'ici la partie gauche de
         l'adresse — « claire.fontaine » — et le nom saisi ici était perdu. */
      const [{ error: eSub }, invitation] = await Promise.all([
        db.from('subscriptions').insert({
          cabinet_id: cabinet.id,
          plan_code: input.offre,
          status: 'essai',
          trial_ends_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
        }),
        input.email.trim()
          ? poserInvitation(db, {
              cabinetId: cabinet.id,
              email: input.email,
              nom: input.praticienne,
              role: 'owner',
            })
          : Promise.resolve({ ok: true, message: '' }),
      ])
      const eInv = !invitation.ok

      // L'invitation est posée ; reste à prévenir la praticienne.
      let envoi = ''
      let parti = true
      if (input.email.trim() && !eInv) {
        const r = await demanderInvitation({
          email: input.email.trim(),
          cabinetId: cabinet.id,
          kind: 'praticienne',
        })
        envoi = r.message
        parti = r.ok
      }

      await recharger()

      /* On nomme l'endroit où le geste se refait vraiment. Depuis 0057, la
         ligne du portefeuille ouvre la fiche du cabinet, où l'invitation se
         reprend comme sur la ligne elle-même. */
      if (eSub || eInv) {
        return {
          ok: true,
          partiel: true,
          message: eSub
            ? `${cabinet.name} est ouvert, mais son offre n'a pas pu être enregistrée. Posez-la depuis l'onglet Offres : le cabinet partira en essai de quatorze jours.`
            : `${cabinet.name} est ouvert, mais l'invitation n'a pas pu être enregistrée. Reprenez-la depuis sa ligne du portefeuille, ou depuis sa fiche.`,
        }
      }
      if (!input.email.trim()) {
        return { ok: true, message: `${cabinet.name} est ouvert en essai. Reste à inviter sa praticienne.` }
      }
      return {
        ok: true,
        partiel: !parti,
        message: envoi
          ? `${cabinet.name} est ouvert en essai. ${envoi}`
          : `${cabinet.name} est ouvert en essai. ${input.praticienne.trim() || 'La praticienne'} se connectera avec ${input.email.trim()}.`,
      }
    },
    [recharger, reel],
  )

  /**
   * Après une écriture réussie, le courriel.
   *
   * L'invitation est enregistrée quoi qu'il arrive : `ok` reste vrai, sans
   * quoi le revendeur la reposerait sur une ligne qui existe déjà. Ce que
   * `partiel` porte, c'est que le courriel, lui, n'est pas parti.
   */
  const envoyer = useCallback(
    async (cabinetId: string, email: string): Promise<Resultat> => {
      const envoi = await demanderInvitation({ email, cabinetId, kind: 'praticienne' })
      await recharger()
      return {
        ok: true,
        partiel: !envoi.ok,
        message:
          envoi.message ||
          `Invitation prête pour ${email}, valable trente jours. La personne se connectera avec cette adresse.`,
      }
    },
    [recharger],
  )

  const inviterPraticienne = useCallback(
    async (cabinetId: string, email: string, nom?: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) return { ok: false, message: 'Connectez-vous pour inviter une praticienne.' }
      /* Une invitation qui attend déjà cette adresse — expirée, le plus
         souvent — est relancée plutôt que refusée : l'index unique en faisait
         un blocage définitif. */
      const ecrit = await poserInvitation(db, { cabinetId, email, nom, role: 'owner' })
      if (!ecrit.ok) {
        await recharger()
        return { ok: false, message: ecrit.message }
      }
      return envoyer(cabinetId, ecrit.email ?? email.trim())
    },
    [envoyer, recharger, reel],
  )

  const relancerInvitation = useCallback(
    async (invitationId: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) return { ok: false, message: 'Connectez-vous pour relancer une invitation.' }
      const ecrit = await relancerEcriture(db, { id: invitationId, role: 'owner' })
      if (!ecrit.ok || !ecrit.cabinetId || !ecrit.email) {
        await recharger()
        return { ok: false, message: ecrit.message }
      }
      return envoyer(ecrit.cabinetId, ecrit.email)
    },
    [envoyer, recharger, reel],
  )

  const changerInvitation = useCallback(
    async (invitationId: string, email: string, nom?: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) return { ok: false, message: 'Connectez-vous pour modifier une invitation.' }
      const ecrit = await relancerEcriture(db, { id: invitationId, role: 'owner', email, nom })
      if (!ecrit.ok || !ecrit.cabinetId || !ecrit.email) {
        await recharger()
        return { ok: false, message: ecrit.message }
      }
      return envoyer(ecrit.cabinetId, ecrit.email)
    },
    [envoyer, recharger, reel],
  )

  const annulerInvitation = useCallback(
    async (invitationId: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) return { ok: false, message: 'Connectez-vous pour annuler une invitation.' }
      const r = await annulerEcriture(db, { id: invitationId, role: 'owner' })
      await recharger()
      return r
    },
    [recharger, reel],
  )

  const enregistrerMarque = useCallback(
    async (
      cabinetId: string,
      fiche: { name?: string; slug?: string; tagline?: string; branding?: CabinetBranding },
    ): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) {
        return { ok: false, message: 'Connectez-vous pour publier une marque.' }
      }
      /* L'IDENTIFIANT SE VÉRIFIE AVANT L'ÉCRITURE, comme à l'ouverture d'un
         cabinet. Sans cela, la base rendait un 23514 que ce module traduisait
         en « La marque n'a pas pu être publiée. Réessayez. » — la même phrase
         à chaque essai, sans jamais nommer la cause. On réessayait en boucle
         sur un mot réservé ou un identifiant trop court. */
      const slug = fiche.slug?.trim()
      if (slug !== undefined) {
        const probleme = problemeIdentifiant(slug)
        if (probleme) return { ok: false, message: probleme }
      }
      const avant = rows.find((r) => r.cabinet.id === cabinetId)?.cabinet.slug
      const renomme = slug !== undefined && avant !== undefined && slug !== avant

      const { error } = await db
        .from('cabinets')
        .update(slug !== undefined ? { ...fiche, slug } : fiche)
        .eq('id', cabinetId)
      await recharger()
      if (!error) {
        return {
          ok: true,
          message: renomme
            ? `La marque est publiée, et le cabinet répond désormais à ${slug}. L'ancienne adresse, ${avant}, y mène toujours : les liens déjà donnés, le widget et les espaces installés continuent de fonctionner.`
            : "La marque est publiée. Elle s'applique à l'espace de la thérapeute et à l'application de ses patients.",
        }
      }
      /* 23505 : un autre cabinet porte déjà cet identifiant. 23514 : la forme
         est refusée — ce qui, les deux gardes ci-dessus passés, ne peut plus
         venir que d'un caractère que `slugify` a laissé filer. */
      const doublon = error.code === '23505'
      /* 23514 ne vient plus seulement de l'identifiant : la base borne aussi
         les couleurs et le nom (0048). On ne met l'identifiant en cause que
         si c'est sa contrainte qui a parlé. */
      const refuse = error.code === '23514'
      const surIdentifiant = refuse && /slug/.test(error.message ?? '')
      return {
        ok: false,
        message: doublon
          ? `L'identifiant « ${slug ?? ''} » est déjà pris par un autre cabinet, ou lui a déjà servi. Choisissez-en un autre.`
          : surIdentifiant
            ? `L'identifiant « ${slug ?? ''} » ne peut pas servir d'adresse : lettres non accentuées, chiffres et tirets, trois caractères au moins, et pas un mot réservé par la plateforme.`
            : refuse
              ? "La marque n'a pas pu être publiée : un nom d'au moins deux caractères et des couleurs au format #RRGGBB sont attendus."
              : "La marque n'a pas pu être publiée. Réessayez dans un instant.",
      }
    },
    [recharger, reel, rows],
  )

  const changerOffre = useCallback(
    async (cabinetId: string, offre: PlanCode): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) return { ok: false, message: "Connectez-vous pour changer d'offre." }
      /* Un `update` sur un cabinet sans ligne d'abonnement ne touche rien et
         ne se plaint pas : l'écran annonçait l'offre appliquée, la base
         n'avait rien, et le cabinet restait sans offre à jamais. Un cabinet
         ouvert hors du formulaire — repris à la main, importé — est
         exactement dans ce cas. `upsert` sur la clé primaire pose la ligne si
         elle manque, et ne touche qu'à l'offre si elle est là.

         La ligne posée ainsi naissait « essai » SANS FIN — tous les leviers,
         pour toujours, sans payer. La base lui donne maintenant ses quatorze
         jours (0049) ; l'écran le dit. */
      const sansContrat = !rows.find((r) => r.cabinet.id === cabinetId)?.subscription.plan
      const { error } = await db
        .from('subscriptions')
        .upsert(
          { cabinet_id: cabinetId, plan_code: offre, updated_at: new Date().toISOString() },
          { onConflict: 'cabinet_id' },
        )
      await recharger()
      const label = offres.find((p) => p.code === offre)?.label ?? offre
      if (error) {
        return {
          ok: false,
          // 23514 : l'offre n'est pas au catalogue de ce revendeur (0049).
          message:
            error.code === '23514'
              ? "Cette offre n'est pas à votre catalogue : choisissez l'une des vôtres."
              : "L'offre n'a pas pu être changée.",
        }
      }
      return {
        ok: true,
        // Le plafond de fiches et les leviers sont lus à chaque geste :
        // ils valent tout de suite, pas au prochain cycle de facturation.
        message: sansContrat
          ? `Offre ${label} posée, en essai de quatorze jours. Réglez son contrat ci-dessous quand il est signé.`
          : `Offre ${label} appliquée. Son plafond de fiches et ses options valent dès maintenant.`,
      }
    },
    [offres, recharger, reel, rows],
  )

  /**
   * Régler une offre du catalogue.
   *
   * Le changement vaut pour TOUS les cabinets qui la portent, immédiatement :
   * c'est le propre d'un catalogue. Pour une faveur à un seul cabinet, ce sont
   * les exceptions ci-dessous.
   */
  const enregistrerOffre = useCallback(
    async (code: PlanCode, champs: ReglageOffre): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) return { ok: false, message: 'Connectez-vous pour régler vos offres.' }
      const ligne: Record<string, unknown> = {}
      if (champs.label !== undefined) ligne.label = champs.label.trim()
      if (champs.priceCents !== undefined) ligne.price_cents = Math.max(0, Math.round(champs.priceCents))
      if (champs.maxPatients !== undefined) ligne.max_patients = champs.maxPatients
      if (champs.shop !== undefined) ligne.shop = champs.shop
      if (champs.marqueBlanche !== undefined) ligne.marque_blanche = champs.marqueBlanche
      if (champs.site !== undefined) ligne.site = champs.site
      if (!Object.keys(ligne).length) return { ok: true, message: '' }

      /* ON REDEMANDE LA LIGNE TOUCHÉE. Un `update` que la politique de lecture
         écarte ne touche rien et ne se plaint pas : PostgREST rend 204 sans
         erreur. L'écran annonçait « Offre enregistrée. Elle vaut dès
         maintenant pour tous les cabinets qui la portent » à un membre du
         revendeur dont l'écriture avait été refusée — et le catalogue, relu
         juste après, réaffichait les anciens prix sans un mot. */
      const { data, error } = await db.from('plans').update(ligne).eq('code', code).select('code')
      await recharger()
      if (error) return { ok: false, message: "L'offre n'a pas pu être enregistrée." }
      if (!data?.length) {
        return {
          ok: false,
          message: "Cette offre n'a pas été modifiée : votre compte n'a pas le droit de régler le catalogue.",
        }
      }
      return {
        ok: true,
        message: 'Offre enregistrée. Elle vaut dès maintenant pour tous les cabinets qui la portent.',
      }
    },
    [recharger, reel],
  )

  /**
   * Accorder une exception à un cabinet.
   *
   * `null` remet l'offre en vigueur pour ce levier — c'est ce qui permet de
   * retirer une faveur sans avoir à se souvenir de ce que l'offre disait.
   */
  const reglerExceptions = useCallback(
    async (cabinetId: string, champs: Exceptions): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) return { ok: false, message: 'Connectez-vous pour régler ce cabinet.' }
      const ligne: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (champs.maxPatientsOverride !== undefined) ligne.max_patients_override = champs.maxPatientsOverride
      if (champs.shopOverride !== undefined) ligne.shop_override = champs.shopOverride
      if (champs.marqueBlancheOverride !== undefined) ligne.marque_blanche_override = champs.marqueBlancheOverride
      if (champs.siteOverride !== undefined) ligne.site_override = champs.siteOverride

      /* On redemande les lignes touchées : sans abonnement, l'`update` ne
         touche rien et rendrait un succès pour une écriture qui n'a pas eu
         lieu. Une exception se pose sur une offre — il faut donc lui en poser
         une d'abord, et c'est ce qu'on lui dit. */
      const { data, error } = await db
        .from('subscriptions')
        .update(ligne)
        .eq('cabinet_id', cabinetId)
        .select('cabinet_id')
      await recharger()
      if (error) return { ok: false, message: "L'exception n'a pas pu être enregistrée." }
      if (!data?.length) {
        return {
          ok: false,
          message: "Ce cabinet n'a pas encore d'offre. Posez-lui-en une, puis accordez l'exception.",
        }
      }
      return { ok: true, message: 'Réglage appliqué à ce cabinet seul.' }
    },
    [recharger, reel],
  )

  /**
   * Le contrat d'un cabinet : son statut, et jusqu'à quand.
   *
   * Ce geste manquait, et son absence rendait le reste faux. `status` était
   * écrit une seule fois — « essai » à l'ouverture — puis plus jamais : rien
   * ne pouvait passer un cabinet en « actif », donc le revenu récurrent
   * affichait 0 € pour l'éternité, et rien ne pouvait le passer en « impayé »,
   * donc « Contrats en défaut » ne s'allumait jamais. Depuis 0035 ce statut
   * ferme les leviers du cabinet : il fallait bien qu'on puisse le rouvrir.
   */
  const reglerContrat = useCallback(
    async (cabinetId: string, reglage: ReglageContrat): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) return { ok: false, message: 'Connectez-vous pour régler ce cabinet.' }
      const { statut, finEssai, echeance } = reglage
      /* N'ÉCRIRE QUE CE QUI A ÉTÉ CHOISI. Chaque clic sur un statut remettait
         l'échéance à vide, et « Essai » reposait en silence quatorze jours,
         même sur un essai qui courait encore. Les dates viennent maintenant
         du revendeur, champ par champ ; un essai sans date reçoit ses
         quatorze jours de la base (0049), jamais d'ici. */
      const ligne: Record<string, unknown> = { status: statut, updated_at: new Date().toISOString() }
      if (finEssai !== undefined) ligne.trial_ends_at = finEssai
      if (echeance !== undefined) ligne.current_period_end = echeance

      const { data, error } = await db
        .from('subscriptions')
        .update(ligne)
        .eq('cabinet_id', cabinetId)
        .select('cabinet_id')
      await recharger()
      if (error) return { ok: false, message: "Le contrat n'a pas pu être enregistré." }
      if (!data?.length) {
        return { ok: false, message: "Ce cabinet n'a pas encore d'offre. Posez-lui-en une d'abord." }
      }
      const jusquau =
        statut === 'essai' && finEssai
          ? ` jusqu'au ${dateLongue(finEssai)}`
          : echeance
            ? `, échéance le ${dateLongue(echeance)}`
            : ''
      return { ok: true, message: `Contrat mis à jour : ${LIBELLE_CONTRAT[statut]}${jusquau}.` }
    },
    [recharger, reel],
  )

  /**
   * Fermer un cabinet, ou le rouvrir.
   *
   * La base date le geste, le réserve au propriétaire et l'inscrit au journal
   * (0057) ; ici on ne fait que le demander et dire ce qu'elle a répondu.
   */
  const fermerCabinet = useCallback(
    async (cabinetId: string, fermer: boolean): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) {
        return {
          ok: false,
          message: fermer ? 'Connectez-vous pour fermer un cabinet.' : 'Connectez-vous pour rouvrir un cabinet.',
        }
      }
      const nom = [...rows, ...fermes].find((r) => r.cabinet.id === cabinetId)?.cabinet.name ?? 'Le cabinet'
      const { data, error } = await db.rpc('revendeur_fermer_cabinet', { p_cabinet: cabinetId, p_fermer: fermer })
      await recharger()
      if (error) return messageFermeture(null, nom, fermer)
      return messageFermeture(typeof data === 'string' ? data : null, nom, fermer)
    },
    [fermes, recharger, reel, rows],
  )

  /**
   * L'historique d'un cabinet, pour sa fiche.
   *
   * Le journal général s'arrête aux cinquante derniers gestes, tous cabinets
   * confondus : celui d'un cabinet se lit donc à part (`journal_du_cabinet`).
   * En démonstration, on filtre le journal chargé — vide, le plus souvent.
   */
  const lireJournalDuCabinet = useCallback(
    async (cabinetId: string): Promise<{ entrees: EntreeJournal[]; erreur: string }> => {
      const db = supabase()
      if (!db || !reel) return { entrees: journal.filter((e) => e.cabinetId === cabinetId), erreur: '' }
      const { data, error } = await db.rpc('journal_du_cabinet', { p_cabinet: cabinetId, p_limite: 100 })
      if (error) return { entrees: [], erreur: "L'historique de ce cabinet n'a pas pu être lu. Réessayez dans un instant." }
      return {
        entrees: ((data ?? []) as JournalRow[]).map((l) => ({
          quand: l.quand,
          action: l.action,
          cabinetId: l.cabinet_id,
          cabinet: l.cabinet,
          meta: l.meta ?? {},
          auteur: l.auteur,
        })),
        erreur: '',
      }
    },
    [journal, reel],
  )

  return {
    rows,
    fermes,
    fermerCabinet,
    lireJournalDuCabinet,
    offres,
    praticiennes,
    invitations,
    journal,
    anciensIdentifiants,
    reel,
    chargement,
    erreur,
    recharger,
    reglerContrat,
    ouvrirCabinet,
    inviterPraticienne,
    relancerInvitation,
    changerInvitation,
    annulerInvitation,
    enregistrerMarque,
    changerOffre,
    enregistrerOffre,
    reglerExceptions,
  }
}
