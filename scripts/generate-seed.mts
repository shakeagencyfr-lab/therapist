/**
 * Fabrique supabase/seed.sql à partir des données de démonstration.
 *
 * Les écrans ont été construits sur des données en dur ; ce script les verse
 * dans la base, à l'identique, pour que l'application puisse lire de vraies
 * lignes au lieu d'un fichier TypeScript. Le contenu reste de la
 * démonstration : ce sont des patients fictifs.
 *
 *   npm run seed:generate
 */
import { PATIENTS, PATIENT_ORDER } from '../src/data/patients'
import { AUDIO_CATEGORIES, AUDIO_LIBRARY } from '../src/data/audioLibrary'
import { JOURNAL_PAGES } from '../src/data/journalPages'
import { INITIAL_AFFIRMATIONS, INITIAL_AFF_AUTO } from '../src/data/affirmations'
import { CONSIGNES } from '../src/data/consignes'
import { durationToSeconds } from '../src/lib/format'

const q = (v: string | null | undefined) => (v == null ? 'null' : `'${v.replace(/'/g, "''")}'`)
const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`

const RESELLER = '10000000-0000-4000-8000-000000000001'
const CABINET = '20000000-0000-4000-8000-000000000001'
const patientId = (i: number) => `30000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
const catId = (i: number) => `40000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
const audioId = (i: number) => `50000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`

const L: string[] = []
L.push(`-- Généré par scripts/generate-seed.mts — ne pas modifier à la main.
--
-- Un revendeur, un cabinet, ses cinq patients et tout ce qui les accompagne.
-- Contenu de démonstration : les patients sont fictifs. Rejouable — chaque
-- insertion est idempotente.

begin;

insert into public.resellers (id, name, slug, support_email) values
  (${q(RESELLER)}, 'Shake', 'shake', 'shakeagencyfr@gmail.com')
on conflict (id) do nothing;

insert into public.cabinets (id, reseller_id, name, slug, tagline, branding) values
  (${q(CABINET)}, ${q(RESELLER)}, 'Cabinet Laetitia Ollivier', 'laetitia-ollivier', 'Espace thérapie',
   ${j({ accent: '#A17A45', accentHover: '#856239', accentDeep: '#6E5230', dark: '#33291C', logo: 'LO' })})
on conflict (id) do nothing;

insert into public.subscriptions (cabinet_id, plan_code, status, current_period_end) values
  (${q(CABINET)}, 'cabinet', 'actif', now() + interval '30 days')
on conflict (cabinet_id) do nothing;
`)

L.push(`-- Rayons de la bibliothèque audio.`)
AUDIO_CATEGORIES.forEach((label, i) => {
  L.push(`insert into public.audio_categories (id, cabinet_id, label, position) values (${q(catId(i))}, ${q(CABINET)}, ${q(label)}, ${i}) on conflict (id) do nothing;`)
})

L.push(`\n-- Enregistrements du cabinet. Le chemin de stockage est une réserve :
-- les fichiers seront déposés dans un bucket privé.`)
AUDIO_LIBRARY.forEach((a, i) => {
  const cat = AUDIO_CATEGORIES.indexOf(a.cat)
  L.push(`insert into public.audio_library (id, cabinet_id, category_id, title, meta, duration_seconds, storage_path) values (${q(audioId(i))}, ${q(CABINET)}, ${cat >= 0 ? q(catId(cat)) : 'null'}, ${q(a.title)}, ${q(a.meta)}, ${durationToSeconds(a.duration)}, ${q(`${CABINET}/${a.id}.mp3`)}) on conflict (id) do nothing;`)
})

PATIENT_ORDER.forEach((key, pi) => {
  const p = PATIENTS[key]
  const id = patientId(pi)
  const email = `shakeagencyfr+${key}@gmail.com`
  L.push(`\n-- ${p.name}`)
  L.push(`insert into public.patients (id, cabinet_id, email, display_name, initials, program, subtitle, week_label, next_session, sessions_done, sessions_total, scale_label, scale_question, scale_delta) values (${q(id)}, ${q(CABINET)}, ${q(email)}, ${q(p.name)}, ${q(p.initials)}, ${q(p.program)}, ${q(p.subtitle)}, ${q(p.weekLabel)}, ${q(p.nextSession)}, ${p.sessions}, ${p.totalSessions}, ${q(p.scaleLabel)}, ${q(p.scaleQuestion)}, ${q(p.scaleDelta)}) on conflict (id) do nothing;`)
  L.push(`insert into public.patient_settings (patient_id, cabinet_id, affirmations_auto) values (${q(id)}, ${q(CABINET)}, ${INITIAL_AFF_AUTO[key] ? 'true' : 'false'}) on conflict (patient_id) do nothing;`)

  p.modules.forEach((m, mi) => {
    const c = CONSIGNES[m.title]
    L.push(`insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, done_at, consigne) select ${q(CABINET)}, ${q(id)}, ${q(m.title)}, ${q(m.meta)}, ${q(m.kind)}::public.module_kind, ${mi}, ${m.done ? 'now()' : 'null'}, ${c ? j(c) : 'null'} where not exists (select 1 from public.patient_modules where patient_id = ${q(id)} and position = ${mi});`)
  })

  p.audios.forEach((a) => {
    const li = AUDIO_LIBRARY.findIndex((x) => x.title === a.title)
    if (li < 0) return
    const listens = Number((a.meta.match(/Écouté (\d+)/) ?? [])[1] ?? 0)
    L.push(`insert into public.patient_audios (cabinet_id, patient_id, audio_id, listens) values (${q(CABINET)}, ${q(id)}, ${q(audioId(li))}, ${listens}) on conflict (patient_id, audio_id) do nothing;`)
  })

  // L'échelle : une valeur par jour, la plus récente aujourd'hui.
  p.scale.forEach((v, si) => {
    const back = p.scale.length - 1 - si
    L.push(`insert into public.scale_entries (cabinet_id, patient_id, value, recorded_at) select ${q(CABINET)}, ${q(id)}, ${v}, now() - interval '${back} days' where not exists (select 1 from public.scale_entries where patient_id = ${q(id)} and recorded_at::date = (now() - interval '${back} days')::date);`)
  })

  const prof = p.profile
  L.push(`insert into public.psych_profiles (cabinet_id, patient_id, version, sessions_count, portrait, axes, levers, care) values (${q(CABINET)}, ${q(id)}, 1, ${p.sessions}, ${q(prof.portrait)}, ${j(prof.axes)}, ${j(prof.levers)}, ${j(prof.care)}) on conflict (patient_id, version) do nothing;`)

  ;(JOURNAL_PAGES[key] ?? []).forEach((page) => {
    L.push(`insert into public.journal_pages (cabinet_id, patient_id, title, body, shared, written_at) select ${q(CABINET)}, ${q(id)}, ${q(page.title)}, ${q(page.text)}, ${page.shared}, now() where not exists (select 1 from public.journal_pages where patient_id = ${q(id)} and title = ${q(page.title)});`)
  })

  ;(INITIAL_AFFIRMATIONS[key] ?? []).forEach((text, ai) => {
    L.push(`insert into public.affirmations (cabinet_id, patient_id, text, position, source, published_at) select ${q(CABINET)}, ${q(id)}, ${q(text)}, ${ai}, 'manuel', now() where not exists (select 1 from public.affirmations where patient_id = ${q(id)} and position = ${ai});`)
  })
})

L.push(`
-- Trois portes d'entrée, toutes vers la même boîte : le revendeur, la
-- thérapeute, et une patiente. Le lien magique crée le compte à la première
-- connexion, claim_access() le rattache à la bonne fiche.
insert into public.reseller_invitations (reseller_id, email, role) values
  (${q(RESELLER)}, 'shakeagencyfr@gmail.com', 'owner')
on conflict (reseller_id, email) do nothing;

insert into public.cabinet_invitations (cabinet_id, email, role, token_hash, expires_at) values
  (${q(CABINET)}, 'shakeagencyfr+laetitia@gmail.com', 'owner', 'seed-laetitia', now() + interval '30 days')
on conflict (token_hash) do nothing;

commit;
`)

console.log(L.join('\n'))
