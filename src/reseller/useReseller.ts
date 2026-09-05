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
import { dateLongue } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { CHEMINS_RESERVES } from '@/lib/vitrine'
import { demanderInvitation } from '@/services/invitations'
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
  plan_code: PlanCode | null
  plan_label: string | null
  status: string | null
  current_period_end: string | null
}

/** La fiche éditable d'un cabinet, lue dans `cabinets`. */
interface CabinetRow {
  id: string
  name: string
  slug: string
  tagline: string
  branding: CabinetBranding
  created_at: string
}

export interface Praticienne {
  cabinet_id: string
  display_name: string
  role: string
}

export interface InvitationEnAttente {
  cabinet_id: string
  email: string
  expires_at: string
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

export interface ResellerData {
  rows: PortfolioRow[]
  /** Le catalogue, tel qu'il est en base — ou celui de démonstration. */
  offres: Plan[]
  praticiennes: Praticienne[]
  invitations: InvitationEnAttente[]
  /** Vrai quand les données viennent de la base et non de la démonstration. */
  reel: boolean
  chargement: boolean
  erreur: string
  recharger: () => Promise<void>
  ouvrirCabinet: (input: NouveauCabinet) => Promise<Resultat>
  inviterPraticienne: (cabinetId: string, email: string) => Promise<Resultat>
  enregistrerMarque: (
    cabinetId: string,
    fiche: { name?: string; slug?: string; tagline?: string; branding?: CabinetBranding },
  ) => Promise<Resultat>
  changerOffre: (cabinetId: string, offre: PlanCode) => Promise<Resultat>
  /** Règle une offre du catalogue : son prix et ce qu'elle ouvre. */
  enregistrerOffre: (code: PlanCode, champs: ReglageOffre) => Promise<Resultat>
  /** Accorde ou retire une exception à un cabinet, sans toucher à l'offre. */
  reglerExceptions: (cabinetId: string, champs: Exceptions) => Promise<Resultat>
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
  /* Un cabinet sans ligne d'abonnement retombe sur la première offre du
     catalogue — et l'offre affichée doit alors être CELLE-LÀ. Prendre le
     libellé d'un côté et le code de l'autre allumait deux pastilles à la
     fois sur la même ligne. */
  const plan = offres.find((p) => p.code === o.plan_code) ?? offres[0]
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
      since: o.created_at,
      archived: o.archived,
    },
    stats: {
      therapists: Number(o.therapists ?? 0),
      patientsActive: Number(o.patients_active ?? 0),
      adherenceAvg: o.adherence_avg === null ? null : Number(o.adherence_avg),
      sessions30d: Number(o.sessions_30d ?? 0),
    },
    subscription: {
      cabinetId: o.cabinet_id,
      plan: (o.plan_code ?? plan.code) as PlanCode,
      status: (o.status ?? 'essai') as PortfolioRow['subscription']['status'],
      periodEnd: dateLongue(o.current_period_end),
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
  const [rows, setRows] = useState<PortfolioRow[]>(() => portefeuilleFictif())
  const [offres, setOffres] = useState<Plan[]>(PLANS)
  const [praticiennes, setPraticiennes] = useState<Praticienne[]>([])
  const [invitations, setInvitations] = useState<InvitationEnAttente[]>([])
  const [reel, setReel] = useState(false)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  const recharger = useCallback(async () => {
    const db = supabase()
    if (!db) {
      setRows(portefeuilleFictif())
      setReel(false)
      setChargement(false)
      return
    }

    // Sans session, on montre le portefeuille de démonstration plutôt qu'un
    // écran vide : les captures et les démonstrations restent possibles.
    const { data: auth } = await db.auth.getSession()
    if (!auth.session) {
      setRows(portefeuilleFictif())
      setReel(false)
      setChargement(false)
      return
    }
    setErreur('')

    const [apercu, fiches, membres, invits, catalogue, exceptions] = await Promise.all([
      db.rpc('reseller_cabinet_overview'),
      db.from('cabinets').select('id, name, slug, tagline, branding, created_at'),
      db.from('cabinet_members').select('cabinet_id, display_name, role'),
      db.from('cabinet_invitations').select('cabinet_id, email, expires_at').is('accepted_at', null),
      db.from('plans').select('code, label, price_cents, max_patients, shop, marque_blanche, site, position').order('position'),
      db
        .from('subscriptions')
        .select('cabinet_id, max_patients_override, shop_override, marque_blanche_override, site_override'),
    ])

    if (apercu.error) {
      setErreur("Votre portefeuille n'a pas pu être chargé. Réessayez dans un instant.")
      setChargement(false)
      return
    }

    const parId = new Map<string, CabinetRow>()
    for (const f of (fiches.data ?? []) as CabinetRow[]) parId.set(f.id, f)

    /* Le catalogue vient de la base. S'il est vide — une base neuve, une
       lecture refusée — on garde celui du produit plutôt que de rendre des
       lignes sans offre : un portefeuille sans prix ne se lit pas. */
    const lues = ((catalogue.data ?? []) as PlanRow[]).map(versOffre)
    const cat = lues.length ? lues : PLANS
    setOffres(cat)

    const parCabinet = new Map<string, ExceptionRow>()
    for (const e of (exceptions.data ?? []) as ExceptionRow[]) parCabinet.set(e.cabinet_id, e)

    const equipes = (membres.data ?? []) as Praticienne[]
    const lignes = ((apercu.data ?? []) as OverviewRow[]).map((o) => {
      const row = versPortfolio(o, parId.get(o.cabinet_id), cat, parCabinet.get(o.cabinet_id))
      const equipe = equipes.find((m) => m.cabinet_id === o.cabinet_id)
      const invit = ((invits.data ?? []) as InvitationEnAttente[]).find((i) => i.cabinet_id === o.cabinet_id)
      row.cabinet.therapist = equipe?.display_name ?? (invit ? 'Invitation envoyée' : 'Aucune praticienne')
      row.cabinet.email = invit?.email ?? ''
      return row
    })

    setRows(lignes)
    setPraticiennes(equipes)
    setInvitations((invits.data ?? []) as InvitationEnAttente[])
    setReel(true)
    setChargement(false)
  }, [])

  useEffect(() => {
    void recharger()
  }, [recharger])

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
         de ses mots pose problème avant d'avoir rempli tout le formulaire. */
      if (CHEMINS_RESERVES.has(slug)) {
        return {
          ok: false,
          message: `L'identifiant « ${slug} » est réservé par la plateforme : il servirait une page de Klaro plutôt que le cabinet. Choisissez-en un autre.`,
        }
      }
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
            ? `L'identifiant « ${slug} » est déjà pris. Choisissez-en un autre.`
            : refuse
              ? `L'identifiant « ${slug} » ne peut pas servir d'adresse : lettres non accentuées, chiffres et tirets, et pas un mot réservé par la plateforme.`
              : "Le cabinet n'a pas pu être créé. Réessayez.",
        }
      }

      const [{ error: eSub }, { error: eInv }] = await Promise.all([
        db.from('subscriptions').insert({
          cabinet_id: cabinet.id,
          plan_code: input.offre,
          status: 'essai',
          trial_ends_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
        }),
        input.email.trim()
          ? db.from('cabinet_invitations').insert({
              cabinet_id: cabinet.id,
              email: input.email.trim().toLowerCase(),
              role: 'owner',
              expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
            })
          : Promise.resolve({ error: null }),
      ])

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

      if (eSub || eInv) {
        return {
          ok: true,
          message: `${cabinet.name} est ouvert, mais ${eSub ? "son offre" : "l'invitation"} n'a pas pu être enregistrée. Reprenez-la depuis sa fiche.`,
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

  const inviterPraticienne = useCallback(
    async (cabinetId: string, email: string): Promise<Resultat> => {
      const db = supabase()
      if (!db || !reel) return { ok: false, message: 'Connectez-vous pour inviter une praticienne.' }
      const { error } = await db.from('cabinet_invitations').insert({
        cabinet_id: cabinetId,
        email: email.trim().toLowerCase(),
        role: 'owner',
        expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
      })
      if (error) {
        await recharger()
        return { ok: false, message: "L'invitation n'a pas pu être enregistrée." }
      }
      const envoi = await demanderInvitation({
        email: email.trim(),
        cabinetId,
        kind: 'praticienne',
      })
      await recharger()
      /* L'invitation est enregistrée quoi qu'il arrive : `ok` reste vrai, sans
         quoi le revendeur la reposerait sur une ligne qui existe déjà. Ce que
         `partiel` porte, c'est que le courriel, lui, n'est pas parti. */
      return {
        ok: true,
        partiel: !envoi.ok,
        message: envoi.message || `Invitation prête pour ${email.trim()}. Elle se connectera avec cette adresse.`,
      }
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
      const { error } = await db.from('cabinets').update(fiche).eq('id', cabinetId)
      await recharger()
      return error
        ? { ok: false, message: "La marque n'a pas pu être publiée. Réessayez." }
        : { ok: true, message: "La marque est publiée. Elle s'applique à l'espace de la thérapeute et à l'application de ses patients." }
    },
    [recharger, reel],
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
         elle manque, et ne touche qu'à l'offre si elle est là. */
      const { error } = await db
        .from('subscriptions')
        .upsert(
          { cabinet_id: cabinetId, plan_code: offre, updated_at: new Date().toISOString() },
          { onConflict: 'cabinet_id' },
        )
      await recharger()
      const label = offres.find((p) => p.code === offre)?.label ?? offre
      return error
        ? { ok: false, message: "L'offre n'a pas pu être changée." }
        : {
            ok: true,
            // Le plafond de fiches et les leviers sont lus à chaque geste :
            // ils valent tout de suite, pas au prochain cycle de facturation.
            message: `Offre ${label} appliquée. Son plafond de fiches et ses options valent dès maintenant.`,
          }
    },
    [offres, recharger, reel],
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

      const { error } = await db.from('plans').update(ligne).eq('code', code)
      await recharger()
      if (error) return { ok: false, message: "L'offre n'a pas pu être enregistrée." }
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

  return {
    rows,
    offres,
    praticiennes,
    invitations,
    reel,
    chargement,
    erreur,
    recharger,
    ouvrirCabinet,
    inviterPraticienne,
    enregistrerMarque,
    changerOffre,
    enregistrerOffre,
    reglerExceptions,
  }
}
