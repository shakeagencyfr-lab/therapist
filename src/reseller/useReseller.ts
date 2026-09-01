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
import { supabase } from '@/lib/supabase'
import { CABINETS, CABINET_STATS, PLANS, SUBSCRIPTIONS } from '@/data/reseller'
import { slugify } from '@/state/resellerSelectors'
import type { CabinetBranding, PlanCode, PortfolioRow } from '@/types/reseller'

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
  ai_spend_cents_month: number
  ai_cap_cents: number | null
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
}

export interface ResellerData {
  rows: PortfolioRow[]
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
}

/** Le portefeuille de démonstration, quand il n'y a pas de session. */
function portefeuilleFictif(): PortfolioRow[] {
  return CABINETS.filter((c) => !c.archived).map((cabinet) => {
    const subscription = SUBSCRIPTIONS[cabinet.id]
    const plan = PLANS.find((p) => p.code === subscription.plan) ?? PLANS[0]
    const capCents = subscription.capOverrideCents ?? plan.aiCapCents
    const stats = CABINET_STATS[cabinet.id]
    return {
      cabinet,
      stats,
      subscription,
      plan,
      capCents,
      usagePct: capCents > 0 ? (stats.aiSpendCents / capCents) * 100 : 0,
    }
  })
}

/** Une ligne de la base, mise à la forme que les écrans attendent déjà. */
function versPortfolio(o: OverviewRow, fiche: CabinetRow | undefined): PortfolioRow {
  const plan = PLANS.find((p) => p.code === o.plan_code) ?? PLANS[0]
  const capCents = o.ai_cap_cents ?? plan.aiCapCents
  const spend = Number(o.ai_spend_cents_month ?? 0)
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
      aiSpendCents: spend,
    },
    subscription: {
      cabinetId: o.cabinet_id,
      plan: (o.plan_code ?? 'cabinet') as PlanCode,
      status: (o.status ?? 'essai') as PortfolioRow['subscription']['status'],
      periodEnd: o.current_period_end ?? '—',
      capOverrideCents: null,
    },
    plan,
    capCents,
    usagePct: capCents > 0 ? (spend / capCents) * 100 : 0,
  }
}

export function useReseller(): ResellerData {
  const [rows, setRows] = useState<PortfolioRow[]>(() => portefeuilleFictif())
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

    const [apercu, fiches, membres, invits] = await Promise.all([
      db.rpc('reseller_cabinet_overview'),
      db.from('cabinets').select('id, name, slug, tagline, branding, created_at'),
      db.from('cabinet_members').select('cabinet_id, display_name, role'),
      db.from('cabinet_invitations').select('cabinet_id, email, expires_at').is('accepted_at', null),
    ])

    if (apercu.error) {
      setErreur("Votre portefeuille n'a pas pu être chargé. Réessayez dans un instant.")
      setChargement(false)
      return
    }

    const parId = new Map<string, CabinetRow>()
    for (const f of (fiches.data ?? []) as CabinetRow[]) parId.set(f.id, f)

    const equipes = (membres.data ?? []) as Praticienne[]
    const lignes = ((apercu.data ?? []) as OverviewRow[]).map((o) => {
      const row = versPortfolio(o, parId.get(o.cabinet_id))
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
        return {
          ok: false,
          message: doublon
            ? `Le sous-domaine « ${slug} » est déjà pris. Choisissez-en un autre.`
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

      await recharger()

      if (eSub || eInv) {
        return {
          ok: true,
          message: `${cabinet.name} est ouvert, mais ${eSub ? "son offre" : "l'invitation"} n'a pas pu être enregistrée. Reprenez-la depuis sa fiche.`,
        }
      }
      return {
        ok: true,
        message: input.email.trim()
          ? `${cabinet.name} est ouvert en essai. ${input.praticienne.trim() || 'La praticienne'} recevra son lien en se connectant avec ${input.email.trim()}.`
          : `${cabinet.name} est ouvert en essai. Reste à inviter sa praticienne.`,
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
      await recharger()
      return error
        ? { ok: false, message: "L'invitation n'a pas pu être enregistrée." }
        : { ok: true, message: `Invitation prête pour ${email.trim()}. Elle se connectera avec cette adresse.` }
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
      const { error } = await db
        .from('subscriptions')
        .update({ plan_code: offre, updated_at: new Date().toISOString() })
        .eq('cabinet_id', cabinetId)
      await recharger()
      const label = PLANS.find((p) => p.code === offre)?.label ?? offre
      return error
        ? { ok: false, message: "L'offre n'a pas pu être changée." }
        : { ok: true, message: `Offre ${label} appliquée. Le nouveau plafond vaut pour le prochain cycle.` }
    },
    [recharger, reel],
  )

  return {
    rows,
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
  }
}
