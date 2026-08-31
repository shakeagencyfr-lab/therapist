-- ============================================================================
-- 0002 — Données de santé.
--
-- Toutes ces tables portent cabinet_id : c'est la clé d'isolation, et la seule
-- chose que regardent leurs politiques. Aucune de ces politiques ne mentionne
-- public.is_reseller_member ni public.is_reseller_of_cabinet — c'est la
-- garantie de cloisonnement du niveau revendeur, vérifiée par
-- supabase/tests/isolation.sql.
--
-- Le patient accède à ses propres lignes quand l'application patient en a
-- besoin. Il n'accède jamais à therapy_sessions : la transcription et les
-- notes sont le dossier clinique de la thérapeute. Le droit d'accès RGPD du
-- patient s'exerce par une procédure tracée, pas par une requête d'écran.
-- ============================================================================

create type public.module_kind as enum (
  'Audio', 'Exercice', 'Journal', 'Échelle', 'Écriture', 'Séance',
  'Formulaire', 'Visualisation', 'Module'
);

create type public.module_source as enum ('programme', 'seance', 'atelier');
create type public.session_status as enum ('consentement', 'captation', 'brouillon', 'envoye', 'archive');
create type public.affirmation_source as enum ('auto', 'manuel');

-- ---------------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------------

create table public.patients (
  id              uuid primary key default gen_random_uuid(),
  cabinet_id      uuid not null references public.cabinets (id) on delete cascade,
  -- Le compte de l'application patient, s'il en a un.
  auth_user_id    uuid unique references auth.users (id) on delete set null,
  display_name    text not null,          -- « Camille R. »
  initials        text not null,          -- « CR »
  program         text not null,          -- « Programme Liberté »
  subtitle        text not null,
  week_label      text not null,
  next_session    text,
  sessions_done   integer not null default 0 check (sessions_done >= 0),
  sessions_total  integer not null default 0 check (sessions_total >= 0),
  scale_label     text not null,
  scale_question  text not null,
  scale_delta     text,
  created_at      timestamptz not null default now(),
  archived_at     timestamptz
);

create index patients_cabinet_idx on public.patients (cabinet_id) where archived_at is null;

-- ---------------------------------------------------------------------------
-- Parcours de la semaine
-- ---------------------------------------------------------------------------

create table public.patient_modules (
  id          uuid primary key default gen_random_uuid(),
  cabinet_id  uuid not null references public.cabinets (id) on delete cascade,
  patient_id  uuid not null references public.patients (id) on delete cascade,
  title       text not null,
  meta        text not null,
  kind        public.module_kind not null,
  source      public.module_source not null default 'programme',
  position    integer not null default 0,
  done_at     timestamptz,
  -- Consigne détaillée, quand elle existe : { duree, quand, steps[], why, quiz[] }
  consigne    jsonb,
  -- Note libre écrite par le patient dans le module.
  patient_note text,
  created_at  timestamptz not null default now()
);

create index patient_modules_patient_idx on public.patient_modules (patient_id, position);
create index patient_modules_cabinet_idx on public.patient_modules (cabinet_id);

-- Réponses aux quiz de compréhension.
create table public.module_quiz_answers (
  id          uuid primary key default gen_random_uuid(),
  cabinet_id  uuid not null references public.cabinets (id) on delete cascade,
  module_id   uuid not null references public.patient_modules (id) on delete cascade,
  question_index integer not null,
  answer_index   integer not null,
  answered_at timestamptz not null default now(),
  unique (module_id, question_index)
);

-- ---------------------------------------------------------------------------
-- Bibliothèque audio du cabinet, et ce qui est envoyé aux patients
-- ---------------------------------------------------------------------------

create table public.audio_categories (
  id         uuid primary key default gen_random_uuid(),
  cabinet_id uuid not null references public.cabinets (id) on delete cascade,
  label      text not null,
  position   integer not null default 0,
  unique (cabinet_id, label)
);

create table public.audio_library (
  id          uuid primary key default gen_random_uuid(),
  cabinet_id  uuid not null references public.cabinets (id) on delete cascade,
  category_id uuid references public.audio_categories (id) on delete set null,
  title       text not null,
  meta        text,
  duration_seconds integer not null check (duration_seconds > 0),
  -- Chemin dans le bucket privé : jamais d'URL publique sur un enregistrement.
  storage_path text not null,
  created_at  timestamptz not null default now()
);

create index audio_library_cabinet_idx on public.audio_library (cabinet_id);

create table public.patient_audios (
  id          uuid primary key default gen_random_uuid(),
  cabinet_id  uuid not null references public.cabinets (id) on delete cascade,
  patient_id  uuid not null references public.patients (id) on delete cascade,
  audio_id    uuid not null references public.audio_library (id) on delete cascade,
  sent_at     timestamptz not null default now(),
  listens     integer not null default 0 check (listens >= 0),
  last_listened_at timestamptz,
  unique (patient_id, audio_id)
);

create index patient_audios_patient_idx on public.patient_audios (patient_id);

-- ---------------------------------------------------------------------------
-- Auto-évaluation, journal
-- ---------------------------------------------------------------------------

create table public.scale_entries (
  id          uuid primary key default gen_random_uuid(),
  cabinet_id  uuid not null references public.cabinets (id) on delete cascade,
  patient_id  uuid not null references public.patients (id) on delete cascade,
  value       integer not null check (value between 0 and 10),
  recorded_at timestamptz not null default now()
);

create index scale_entries_patient_idx on public.scale_entries (patient_id, recorded_at);

create table public.journal_pages (
  id          uuid primary key default gen_random_uuid(),
  cabinet_id  uuid not null references public.cabinets (id) on delete cascade,
  patient_id  uuid not null references public.patients (id) on delete cascade,
  title       text not null,
  body        text not null,
  trigger_label text,
  -- Le patient choisit ce qu'il partage. Faux = la thérapeute ne le voit pas.
  shared      boolean not null default false,
  written_at  timestamptz not null default now()
);

create index journal_pages_patient_idx on public.journal_pages (patient_id, written_at desc);

-- ---------------------------------------------------------------------------
-- Séances et profil psychologique
-- ---------------------------------------------------------------------------

create table public.therapy_sessions (
  id            uuid primary key default gen_random_uuid(),
  cabinet_id    uuid not null references public.cabinets (id) on delete cascade,
  patient_id    uuid not null references public.patients (id) on delete cascade,
  status        public.session_status not null default 'consentement',
  occurred_at   timestamptz not null default now(),
  -- Le consentement est horodaté et conservé : c'est la pièce qui autorise
  -- la captation. Sans lui, pas de transcription.
  consent_given_at timestamptz,
  consent_revoked_at timestamptz,
  duration_seconds integer not null default 0,
  transcript    text,
  -- Effacement de la transcription à la demande du patient, sans perdre la note.
  transcript_deleted_at timestamptz,
  notes         text,
  -- Brouillon produit par l'IA : { synthese, mots[], themes[], propositions[],
  -- induction, questions[], vigilance[], categories_audio[], message }
  draft         jsonb,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  constraint therapy_sessions_transcript_needs_consent
    check (transcript is null or consent_given_at is not null)
);

create index therapy_sessions_patient_idx on public.therapy_sessions (patient_id, occurred_at desc);

-- Une version par actualisation : le profil se précise, il ne s'écrase pas.
create table public.psych_profiles (
  id            uuid primary key default gen_random_uuid(),
  cabinet_id    uuid not null references public.cabinets (id) on delete cascade,
  patient_id    uuid not null references public.patients (id) on delete cascade,
  version       integer not null,
  -- Nombre de séances au moment de l'établissement : c'est lui qui donne la
  -- marge d'incertitude affichée — marge = max(3, round(26 - séances × 3)).
  sessions_count integer not null check (sessions_count >= 0),
  portrait      text not null,
  axes          jsonb not null,   -- [{ label, value, note }] × 5
  levers        jsonb not null,   -- [{ title, body }] × 3–4
  care          jsonb not null,   -- [string] × 1–3
  resume        text,
  source_session_id uuid references public.therapy_sessions (id) on delete set null,
  generated_at  timestamptz not null default now(),
  unique (patient_id, version)
);

create index psych_profiles_patient_idx on public.psych_profiles (patient_id, version desc);

-- ---------------------------------------------------------------------------
-- Affirmations, modules du cabinet, notifications
-- ---------------------------------------------------------------------------

create table public.affirmations (
  id           uuid primary key default gen_random_uuid(),
  cabinet_id   uuid not null references public.cabinets (id) on delete cascade,
  patient_id   uuid not null references public.patients (id) on delete cascade,
  text         text not null,
  position     integer not null default 0,
  source       public.affirmation_source not null default 'manuel',
  published_at timestamptz,
  created_at   timestamptz not null default now()
);

create index affirmations_patient_idx on public.affirmations (patient_id, position);

create table public.patient_settings (
  patient_id   uuid primary key references public.patients (id) on delete cascade,
  cabinet_id   uuid not null references public.cabinets (id) on delete cascade,
  -- Génération automatique des affirmations le lundi.
  affirmations_auto boolean not null default false
);

-- Modules créés dans l'atelier, réutilisables par le cabinet.
create table public.custom_modules (
  id          uuid primary key default gen_random_uuid(),
  cabinet_id  uuid not null references public.cabinets (id) on delete cascade,
  title       text not null,
  kind        public.module_kind not null,
  duree       text not null,
  quand       text not null,
  steps       jsonb not null,
  pourquoi    text,
  quiz        jsonb not null default '[]'::jsonb,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index custom_modules_cabinet_idx on public.custom_modules (cabinet_id);

create table public.push_notifications (
  id            uuid primary key default gen_random_uuid(),
  cabinet_id    uuid not null references public.cabinets (id) on delete cascade,
  title         text not null,
  body          text not null,
  scheduled_for text not null,          -- « Ce soir, 20 h »
  sent_at       timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create table public.push_recipients (
  push_id    uuid not null references public.push_notifications (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  cabinet_id uuid not null references public.cabinets (id) on delete cascade,
  read_at    timestamptz,
  primary key (push_id, patient_id)
);

-- ---------------------------------------------------------------------------
-- Appartenance côté patient
-- ---------------------------------------------------------------------------

create or replace function public.is_patient_record(p_patient uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.patients p
    where p.id = p_patient and p.auth_user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS — le cabinet pour tout, le patient pour ce qui est à lui.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'patients', 'patient_modules', 'module_quiz_answers', 'audio_categories',
    'audio_library', 'patient_audios', 'scale_entries', 'journal_pages',
    'therapy_sessions', 'psych_profiles', 'affirmations', 'patient_settings',
    'custom_modules', 'push_notifications', 'push_recipients'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    -- La thérapeute et son équipe : tout, dans leur cabinet, et rien ailleurs.
    execute format(
      'create policy "cabinet" on public.%I for all to authenticated
         using (public.is_cabinet_member(cabinet_id))
         with check (public.is_cabinet_member(cabinet_id))', t);
  end loop;
end $$;

-- Le patient lit sa fiche et met à jour ce qui lui appartient.
create policy "le patient lit sa fiche"
  on public.patients for select to authenticated
  using (auth_user_id = auth.uid());

create policy "le patient lit ses modules"
  on public.patient_modules for select to authenticated
  using (public.is_patient_record(patient_id));

create policy "le patient coche et annote ses modules"
  on public.patient_modules for update to authenticated
  using (public.is_patient_record(patient_id))
  with check (public.is_patient_record(patient_id));

create policy "le patient répond aux quiz"
  on public.module_quiz_answers for all to authenticated
  using (exists (
    select 1 from public.patient_modules m
    where m.id = module_quiz_answers.module_id and public.is_patient_record(m.patient_id)
  ))
  with check (exists (
    select 1 from public.patient_modules m
    where m.id = module_quiz_answers.module_id and public.is_patient_record(m.patient_id)
  ));

create policy "le patient lit ses audios"
  on public.patient_audios for select to authenticated
  using (public.is_patient_record(patient_id));

create policy "le patient compte ses écoutes"
  on public.patient_audios for update to authenticated
  using (public.is_patient_record(patient_id))
  with check (public.is_patient_record(patient_id));

create policy "le patient note son échelle"
  on public.scale_entries for insert to authenticated
  with check (public.is_patient_record(patient_id));

create policy "le patient relit son échelle"
  on public.scale_entries for select to authenticated
  using (public.is_patient_record(patient_id));

create policy "le patient tient son journal"
  on public.journal_pages for all to authenticated
  using (public.is_patient_record(patient_id))
  with check (public.is_patient_record(patient_id));

create policy "le patient lit ses affirmations publiées"
  on public.affirmations for select to authenticated
  using (public.is_patient_record(patient_id) and published_at is not null);

create policy "le patient lit ses notifications"
  on public.push_recipients for select to authenticated
  using (public.is_patient_record(patient_id));

create policy "le patient marque une notification lue"
  on public.push_recipients for update to authenticated
  using (public.is_patient_record(patient_id))
  with check (public.is_patient_record(patient_id));

-- Le journal privé du patient reste invisible au cabinet tant qu'il ne l'a pas
-- partagé. La politique « cabinet » ci-dessus est donc trop large pour cette
-- table : on la remplace.
drop policy "cabinet" on public.journal_pages;

create policy "le cabinet lit le journal partagé"
  on public.journal_pages for select to authenticated
  using (public.is_cabinet_member(cabinet_id) and shared);
