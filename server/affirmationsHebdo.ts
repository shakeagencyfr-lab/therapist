/**
 * Les affirmations du lundi.
 *
 * « Génération automatique chaque lundi » se cochait depuis le début et ne
 * déclenchait rien : le réglage s'écrivait bien en base, et personne ne le
 * lisait jamais. La thérapeute cochait, la phrase promettait un lundi, et
 * aucune ligne ne partait — le patient relisait la même série pendant des
 * mois, ou n'en avait jamais eu.
 *
 * Cette tâche est le lundi qui manquait. Elle n'agit que sur ce que la
 * thérapeute a demandé : les fiches dont `patient_settings.affirmations_auto`
 * est vrai. Deux planificateurs l'appellent, sur la même route et le même
 * secret : l'hébergeur à 6 h UTC (vercel.json), puis la base à 8 h, 10 h et
 * 12 h UTC (0044), qui ne réveille le serveur que s'il reste une fiche à
 * servir. L'offre gratuite de l'hébergeur ne permet qu'un passage par jour et
 * par tâche ; les reprises vivent donc en base, comme les rappels (0040).
 *
 * TROIS BORNES, parce qu'une tâche qui dépense sans témoin doit se tenir :
 *
 *   1. LA CLÉ EST CELLE DU CABINET. Un cabinet sans clé Anthropic est sauté,
 *      pas facturé à la plateforme. C'est la même règle qu'à l'écran.
 *   2. RIEN DE PRIVÉ NE SORT DU DOSSIER. Le contexte n'emporte que les pages
 *      de journal que le patient a MARQUÉES PARTAGÉES — exactement ce que la
 *      politique de lecture accorde au cabinet. La clé de service passe outre
 *      la RLS ; c'est donc ici qu'il faut relire la frontière.
 *   3. UNE FOIS PAR SEMAINE. Une série publiée il y a moins de quatre jours
 *      fait sauter la fiche : une reprise, ou un nouvel essai de l'hébergeur,
 *      ne doivent pas repayer l'appel ni remplacer une série que la
 *      thérapeute vient de corriger à la main.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clientAdmin } from './auth.js'
import { analyserPourCabinet } from './ai.js'
import { cleAnthropicDuCabinet } from './integrations.js'
import { HttpError } from './errors.js'
import type { PatientContext } from './schemas.js'

/** Le compte rendu d'un passage, tel qu'il part au journal. */
export interface BilanHebdo {
  /** Fiches réglées sur la génération automatique. */
  candidates: number
  /** Fiches dont la série a été renouvelée. */
  publiees: number
  /** Fiches sautées : cabinet sans clé, ou série déjà fraîche. */
  sautees: number
  /** Fiches laissées au passage suivant, faute de temps. Jamais silencieuses. */
  restantes: number
  /** Fiches où l'écriture ou l'appel a échoué. */
  echecs: number
}

/** Quatre jours : une série plus fraîche que ça n'est pas à remplacer. */
const FRAICHEUR_JOURS = 4

/**
 * Le temps qu'on s'accorde, et le nombre de fiches menées de front.
 *
 * La fonction est coupée à 60 secondes par l'hébergeur (vercel.json). Une
 * fiche coûte quelques secondes d'appel : au-delà d'une douzaine, la tâche
 * serait tuée en plein milieu, sans rien dire de ce qui restait. On s'arrête
 * donc AVANT, et on compte ce qu'on laisse — la reprise suivante les servira,
 * puisque la fraîcheur fait sauter celles déjà faites, et que l'ordre de
 * passage (plus bas) met en tête celles qui attendent depuis le plus longtemps.
 */
const BUDGET_MS = 48_000
const DE_FRONT = 3

/**
 * L'appelant est-il bien le planificateur ?
 *
 * L'hébergeur signe ses appels avec `CRON_SECRET`. Sans ce secret configuré,
 * la route REFUSE : une tâche qui dépense la clé d'un cabinet ne doit pas
 * s'ouvrir à qui connaît son adresse, et « pas de secret » est le cas où
 * n'importe qui la connaît.
 */
export function cronAutorise(entete: string | null): boolean {
  const secret = (process.env.CRON_SECRET ?? '').trim()
  if (!secret) return false
  const donne = (entete ?? '').trim()
  const presente = donne.startsWith('Bearer ') ? donne.slice(7) : donne
  /* En temps constant (pentest P21) : une comparaison de texte s'arrête au
     premier caractère différent, et sa durée dit combien étaient justes.
     Les empreintes ont la même longueur quoi qu'on présente. */
  const a = createHash('sha256').update(presente).digest()
  const b = createHash('sha256').update(secret).digest()
  return timingSafeEqual(a, b)
}

interface FicheAuto {
  id: string
  cabinet_id: string
  display_name: string
  program: string | null
  subtitle: string | null
  week_label: string | null
  sessions_done: number | null
  sessions_total: number | null
  scale_label: string | null
  scale_delta: string | null
}

/** La date de la série en place d'une fiche, telle que la base la rend. */
export interface DernierePublication {
  patient_id: string
  published_at: string | null
}

/**
 * Qui passe ce lundi, et dans quel ordre.
 *
 * LES PLUS ANCIENNES D'ABORD. Le budget ne couvre pas toujours toutes les
 * fiches. Servies dans l'ordre où la base les rend — un ordre qui ne change
 * pas d'une semaine à l'autre —, les mêmes passaient devant chaque lundi, et
 * celles du bout de la liste n'étaient jamais servies. Une fiche qui n'a
 * jamais eu de série passe en tête ; ensuite, la série la plus vieille.
 *
 * Une série publiée après `limite` est fraîche : la fiche est sautée, et
 * comptée comme telle.
 */
export function ordreDePassage<F extends { id: string }>(
  fiches: readonly F[],
  publications: readonly DernierePublication[],
  limite: number,
): { aFaire: F[]; fraiches: number } {
  const derniere = new Map<string, number>()
  for (const p of publications) {
    const instant = p.published_at ? Date.parse(p.published_at) : Number.NaN
    if (Number.isNaN(instant)) continue
    derniere.set(p.patient_id, Math.max(derniere.get(p.patient_id) ?? -Infinity, instant))
  }
  const age = (id: string) => derniere.get(id) ?? -Infinity

  let fraiches = 0
  const aFaire = fiches.filter((f) => {
    if (age(f.id) < limite) return true
    fraiches += 1
    return false
  })
  /* À date égale — deux fiches jamais servies, par exemple —, l'identifiant
     départage : un ordre qui dépendrait du hasard de la requête ne se
     vérifierait pas. */
  aFaire.sort((a, b) => age(a.id) - age(b.id) || a.id.localeCompare(b.id))
  return { aFaire, fraiches }
}

/** Le contexte du prompt, assemblé depuis la base et non depuis un écran. */
async function contexteDe(admin: SupabaseClient, fiche: FicheAuto): Promise<PatientContext> {
  const [modules, pages] = await Promise.all([
    admin
      .from('patient_modules')
      .select('title, done_at')
      .eq('patient_id', fiche.id)
      .order('position', { ascending: true }),
    /* PARTAGÉES SEULEMENT. Une page que le patient garde pour lui n'est pas
       lisible par son cabinet ; elle ne devient pas lisible parce que c'est
       un serveur qui la lit. */
    admin
      .from('journal_pages')
      .select('title, body, written_at')
      .eq('patient_id', fiche.id)
      .eq('shared', true)
      .order('written_at', { ascending: false })
      .limit(12),
  ])

  const journal = ((pages.data ?? []) as Array<{ title: string | null; body: string | null; written_at: string }>)
    .map((p) => ({ date: p.written_at.slice(0, 10), text: p.body ?? '' }))
    .filter((j) => j.text.trim())

  return {
    name: fiche.display_name,
    program: fiche.program ?? '',
    subtitle: fiche.subtitle ?? '',
    weekLabel: fiche.week_label ?? '',
    sessions: fiche.sessions_done ?? 0,
    totalSessions: fiche.sessions_total ?? 0,
    adherence: 0,
    scaleLabel: fiche.scale_label ?? '',
    // Les affirmations ne citent que le libellé de l'échelle : ni sa
    // question ni ses notes ne leur servent, on ne les lit pas.
    scaleQuestion: '',
    scaleDelta: fiche.scale_delta ?? '',
    echelle: [],
    modules: ((modules.data ?? []) as Array<{ title: string; done_at: string | null }>).map((m) => ({
      title: m.title,
      done: Boolean(m.done_at),
    })),
    journal,
    shared: journal.map((j) => j.text).join(' '),
    profile: { updated: '', portrait: '', axes: [], levers: [], care: [] },
  }
}

/**
 * Le passage hebdomadaire.
 *
 * Un patient qui échoue n'arrête pas les autres : la tâche va jusqu'au bout
 * et rend son compte. Un cabinet sans clé fait sauter toutes ses fiches d'un
 * coup, sans appeler quoi que ce soit.
 */
export async function publierLesAffirmationsDeLaSemaine(): Promise<BilanHebdo> {
  const client = clientAdmin()
  if (!client) {
    throw new HttpError(503, "Le serveur n'a pas sa clé de service : la tâche du lundi ne peut rien lire.")
  }
  // Le narrowing ne survit pas aux fermetures plus bas : on le fige ici.
  const admin: SupabaseClient = client

  const { data: reglages, error } = await admin
    .from('patient_settings')
    .select('patient_id')
    .eq('affirmations_auto', true)
  if (error) throw new HttpError(502, "Les réglages des fiches n'ont pas pu être lus.")

  const ids = (reglages ?? []).map((r) => (r as { patient_id: string }).patient_id)
  const bilan: BilanHebdo = { candidates: ids.length, publiees: 0, sautees: 0, restantes: 0, echecs: 0 }
  if (!ids.length) return bilan

  const { data: fiches } = await admin
    .from('patients')
    .select('id, cabinet_id, display_name, program, subtitle, week_label, sessions_done, sessions_total, scale_label, scale_delta')
    .in('id', ids)
    .is('archived_at', null)

  /* La date de chaque série se lit en une requête, pas un aller-retour par
     patient. Une série s'écrit d'un bloc (cabinet_publier_affirmations) :
     toutes ses lignes portent la même date, et la position 0 existe dès
     qu'une ligne existe. Ne lire qu'elle donne une ligne par fiche — et
     garde la réponse loin du plafond de lignes de l'API, qui tronquerait
     sans rien dire et ferait repayer des séries fraîches. */
  const { data: publications, error: eDates } = await admin
    .from('affirmations')
    .select('patient_id, published_at')
    .in('patient_id', ids)
    .eq('position', 0)
    .not('published_at', 'is', null)
  if (eDates) throw new HttpError(502, "Les dates des séries en place n'ont pas pu être lues.")

  const { aFaire, fraiches } = ordreDePassage(
    (fiches ?? []) as FicheAuto[],
    (publications ?? []) as DernierePublication[],
    Date.now() - FRAICHEUR_JOURS * 86400_000,
  )
  bilan.sautees += fraiches

  /** Une lecture de clé par cabinet, pas une par fiche. */
  const cles = new Map<string, boolean>()
  async function cabinetArmé(cabinetId: string): Promise<boolean> {
    if (!cles.has(cabinetId)) cles.set(cabinetId, Boolean(await cleAnthropicDuCabinet(cabinetId)))
    return cles.get(cabinetId) ?? false
  }

  const fin = Date.now() + BUDGET_MS
  let prochaine = 0
  async function servir(): Promise<void> {
    for (;;) {
      const fiche = aFaire[prochaine++]
      if (!fiche) return
      if (Date.now() > fin) {
        bilan.restantes += 1
        continue
      }
      if (!(await cabinetArmé(fiche.cabinet_id))) {
        bilan.sautees += 1
        continue
      }
      try {
        const contexte = await contexteDe(admin, fiche)
        const produit = await analyserPourCabinet('affirmations', { context: contexte }, fiche.cabinet_id)
        const liste = ((produit.data as { affirmations?: unknown[] } | null)?.affirmations ?? [])
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        if (!liste.length) {
          bilan.echecs += 1
          continue
        }
        const { error: eEcriture } = await admin.rpc('cabinet_publier_affirmations', {
          p_patient: fiche.id,
          p_textes: liste,
        })
        if (eEcriture) {
          console.error(`[affirmations] écriture ${fiche.id} — ${eEcriture.message}`)
          bilan.echecs += 1
          continue
        }
        bilan.publiees += 1
      } catch (err) {
        // Journal technique seulement : ni contenu de dossier, ni clé.
        console.error(`[affirmations] fiche ${fiche.id} — ${(err as Error).message}`)
        bilan.echecs += 1
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(DE_FRONT, aFaire.length) }, servir))
  return bilan
}
