-- ============================================================================
-- Épreuve du cloisonnement, trois acteurs.
--
-- Monte un jeu d'essai, se fait passer successivement pour un revendeur, une
-- thérapeute et un patient, et vérifie ce que chacun atteint réellement à
-- travers la RLS. Termine par un ROLLBACK : rien ne persiste.
--
--   psql "$DATABASE_URL" -f supabase/tests/cloisonnement.sql
--
-- Un échec lève une exception nommée. Pas de sortie = tout est conforme.
-- ============================================================================

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'revendeur@test.local', '', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'therapeute-a@test.local', '', now(), now(), now()),
  ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'therapeute-b@test.local', '', now(), now(), now()),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'patient-a@test.local', '', now(), now(), now());

insert into public.resellers (id, name, slug)
values ('33333333-3333-3333-3333-333333333333', 'Revendeur de test', 'revendeur-de-test');

insert into public.reseller_members (reseller_id, user_id, role)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'owner');

insert into public.cabinets (id, reseller_id, name, slug) values
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Cabinet A', 'cabinet-a'),
  ('88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333', 'Cabinet B', 'cabinet-b');

insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'owner', 'Thérapeute A'),
  ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', 'owner', 'Thérapeute B');

insert into public.patients (id, cabinet_id, auth_user_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question) values
  ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', '66666666-6666-6666-6666-666666666666',
   'Patient A', 'PA', 'Programme Liberté', 'Liberté · semaine 3 / 6', 'Semaine 3 sur 6', 'Envie de fumer', 'Où en est l''envie de fumer ?'),
  ('99999999-9999-9999-9999-999999999999', '88888888-8888-8888-8888-888888888888', null,
   'Patient B', 'PB', 'Programme Équilibre', 'Équilibre · semaine 1 / 8', 'Semaine 1 sur 8', 'Niveau de stress', 'Où en est votre niveau de stress ?');

insert into public.therapy_sessions (cabinet_id, patient_id, consent_given_at, transcript, notes) values
  ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', now(), 'Transcription confidentielle', 'Note clinique'),
  ('88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999', now(), 'Transcription confidentielle', 'Note clinique');

insert into public.journal_pages (cabinet_id, patient_id, title, body, shared) values
  ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', 'Page privée', 'Ce que je ne dis pas', false),
  ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', 'Page partagée', 'Ce que je transmets', true);

-- ---------------------------------------------------------------------------
do $$
declare n integer; s text;
begin
  -- ---- Le revendeur ------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

  select count(*) into n from public.patients;
  if n <> 0 then raise exception 'FUITE : le revendeur atteint % patient(s)', n; end if;
  select count(*) into n from public.therapy_sessions;
  if n <> 0 then raise exception 'FUITE : le revendeur atteint % séance(s)', n; end if;
  select count(*) into n from public.journal_pages;
  if n <> 0 then raise exception 'FUITE : le revendeur atteint % page(s) de journal', n; end if;
  select count(*) into n from public.psych_profiles;
  if n <> 0 then raise exception 'FUITE : le revendeur atteint % profil(s)', n; end if;

  select count(*) into n from public.cabinets;
  if n <> 2 then raise exception 'Le revendeur devrait voir ses 2 cabinets, il en voit %', n; end if;
  select count(*) into n from public.reseller_cabinet_overview();
  if n <> 2 then raise exception 'L''agrégat devrait rendre 2 lignes, il en rend %', n; end if;

  -- Un compteur, oui. Une moyenne sur un seul patient, non.
  select patients_active into n from public.reseller_cabinet_overview() where cabinet_name = 'Cabinet A';
  if n <> 1 then raise exception 'Compteur de patients faux : %', n; end if;
  if (select adherence_avg from public.reseller_cabinet_overview() where cabinet_name = 'Cabinet A') is not null then
    raise exception 'FUITE : moyenne d''assiduité rendue sur moins de trois patients';
  end if;

  -- ---- La thérapeute du cabinet A ---------------------------------------
  perform set_config('role', 'none', true);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

  select count(*) into n from public.patients;
  if n <> 1 then raise exception 'La thérapeute A devrait voir 1 patient, elle en voit %', n; end if;
  select count(*) into n from public.therapy_sessions;
  if n <> 1 then raise exception 'La thérapeute A devrait voir 1 séance, elle en voit %', n; end if;

  -- Le journal privé du patient lui reste fermé.
  select string_agg(title, ', ') into s from public.journal_pages;
  if s is distinct from 'Page partagée' then
    raise exception 'FUITE : la thérapeute voit « % » au lieu de la seule page partagée', s;
  end if;

  select count(*) into n from public.reseller_cabinet_overview();
  if n <> 0 then raise exception 'FUITE : une thérapeute obtient l''agrégat revendeur'; end if;

  -- ---- Le patient -------------------------------------------------------
  perform set_config('role', 'none', true);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);

  select count(*) into n from public.patients;
  if n <> 1 then raise exception 'Le patient devrait voir sa seule fiche, il en voit %', n; end if;
  select count(*) into n from public.therapy_sessions;
  if n <> 0 then raise exception 'FUITE : le patient atteint le dossier clinique (% séance(s))', n; end if;
  select count(*) into n from public.journal_pages;
  if n <> 2 then raise exception 'Le patient devrait voir ses 2 pages, il en voit %', n; end if;
  select count(*) into n from public.cabinets;
  if n <> 0 then raise exception 'FUITE : le patient atteint % cabinet(s)', n; end if;

  perform set_config('role', 'none', true);
  raise notice 'Cloisonnement : revendeur, thérapeute et patient conformes.';
end $$;

rollback;
