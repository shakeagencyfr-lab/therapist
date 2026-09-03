-- ============================================================================
-- Épreuve de la connexion par lien magique.
--
-- Quatre comptes arrivent avec quatre adresses ; on vérifie que claim_access()
-- rattache chacun à ce qui l'attendait — et seulement à cela — puis que
-- my_context() ouvre le bon espace. Termine par un ROLLBACK.
--
--   psql "$DATABASE_URL" -f supabase/tests/connexion.sql
--
-- Le quatrième cas est le plus important : une adresse que personne n'a
-- invitée obtient un compte valide et aucun accès. Se connecter ne donne
-- droit à rien en soi.
-- ============================================================================

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('aaaa1111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','shakeagencyfr@gmail.com','',now(),now(),now()),
  ('bbbb2222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','shakeagencyfr+laetitia@gmail.com','',now(),now(),now()),
  ('cccc3333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','shakeagencyfr+camille@gmail.com','',now(),now(),now()),
  ('dddd4444-4444-4444-8444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','inconnu@exemple.fr','',now(),now(),now());

do $$
declare ctx jsonb; n integer; s text;
begin
  -- 1. Le revendeur : son organisation, et aucun patient.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"aaaa1111-1111-4111-8111-111111111111","role":"authenticated"}',true);
  perform public.claim_access();
  ctx := public.my_context();
  if ctx->'reseller'->>'name' is distinct from 'Shake' then
    raise exception 'Revendeur non rattaché : %', ctx;
  end if;
  if ctx->'cabinet' <> 'null'::jsonb or ctx->'patient' <> 'null'::jsonb then
    raise exception 'Le revendeur a reçu un autre rôle : %', ctx;
  end if;
  select count(*) into n from public.patients;
  if n <> 0 then raise exception 'FUITE : le revendeur voit % patients', n; end if;

  -- 2. La thérapeute : son cabinet et ses cinq patients.
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"bbbb2222-2222-4222-8222-222222222222","role":"authenticated"}',true);
  perform public.claim_access();
  ctx := public.my_context();
  if ctx->'cabinet'->>'name' is distinct from 'Cabinet Laetitia Ollivier' then
    raise exception 'Thérapeute non rattachée : %', ctx;
  end if;
  select count(*) into n from public.patients;
  if n <> 5 then raise exception 'La thérapeute devrait voir 5 patients, elle en voit %', n; end if;

  -- 3. Le patient : sa fiche, ses modules, et pas le dossier clinique.
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"cccc3333-3333-4333-8333-333333333333","role":"authenticated"}',true);
  perform public.claim_access();
  ctx := public.my_context();
  if ctx->'patient'->>'display_name' is distinct from 'Camille R.' then
    raise exception 'Patient non rattachée : %', ctx;
  end if;
  select count(*) into n from public.patients;
  if n <> 1 then raise exception 'Le patient devrait voir sa seule fiche, il en voit %', n; end if;
  select count(*) into n from public.patient_modules;
  if n <> 6 then raise exception 'Le patient devrait voir ses 6 modules, il en voit %', n; end if;
  select count(*) into n from public.therapy_sessions;
  if n <> 0 then raise exception 'FUITE : le patient atteint le dossier clinique'; end if;

  -- Elle coche un module : le seul geste d'écriture qui lui est ouvert.
  select id into s from public.patient_modules where done_at is null limit 1;
  perform public.patient_set_module_done(s::uuid, true);
  select count(*) into n from public.patient_modules where done_at is not null;
  if n <> 5 then raise exception 'Le module coché n''a pas été enregistré (% faits)', n; end if;

  -- 4. Une adresse que personne n'attend : compte valide, aucun accès.
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"dddd4444-4444-4444-8444-444444444444","role":"authenticated"}',true);
  perform public.claim_access();
  ctx := public.my_context();
  if ctx->'cabinet' <> 'null'::jsonb or ctx->'patient' <> 'null'::jsonb or ctx->'reseller' <> 'null'::jsonb then
    raise exception 'FUITE : une adresse non invitée a obtenu un accès : %', ctx;
  end if;
  select count(*) into n from public.patients;
  if n <> 0 then raise exception 'FUITE : un inconnu voit % patients', n; end if;

  perform set_config('role','none',true);
  raise notice 'Connexion : les quatre scénarios sont conformes.';
end $$;

rollback;
