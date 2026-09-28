-- ============================================================================
-- Épreuve de la connexion par lien magique.
--
-- Quatre comptes arrivent avec quatre adresses ; on vérifie que claim_access()
-- rattache chacun à ce qui l'attendait — et seulement à cela — puis que
-- my_context() ouvre le bon espace.
--
--   psql "$DATABASE_URL" -f supabase/tests/connexion.sql
--
-- Un seul bloc DO qui se termine par RAISE EXCEPTION 'REUSSITE …' : rien
-- ne persiste. L'épreuve dépendait d'un jeu d'essai (le revendeur « Shake »,
-- le cabinet de Laetitia et ses cinq patients) qui n'existe qu'en
-- développement : en production, elle échouait sur des adresses déjà prises.
-- Elle fabrique désormais ce qui attend chaque compte — une invitation de
-- revendeur, une invitation de cabinet, une fiche — sous des adresses de
-- test.
--
-- Le quatrième cas est le plus important : une adresse que personne n'a
-- invitée obtient un compte valide et aucun accès. Se connecter ne donne
-- droit à rien en soi.
-- ============================================================================

do $$
declare
  v_plan text;
  v_org uuid; v_cab uuid; v_pat uuid;
  ctx jsonb; n integer; s text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
    ('aaaa1111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','connexion-revendeur@exemple.fr','',now(),now(),now()),
    ('bbbb2222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','connexion-therapeute@exemple.fr','',now(),now(),now()),
    ('cccc3333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','connexion-patient@exemple.fr','',now(),now(),now()),
    ('dddd4444-4444-4444-8444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','connexion-inconnu@exemple.fr','',now(),now(),now());

  -- Ce qui attend chacun, posé avant la première bascule de rôle.
  insert into public.resellers (name, slug) values ('Revendeur de la connexion', 'revendeur-de-la-connexion') returning id into v_org;
  insert into public.reseller_invitations (reseller_id, email, role, expires_at)
  values (v_org, 'connexion-revendeur@exemple.fr', 'owner', now() + interval '1 day');

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_org, 'Cabinet de la connexion', 'cabinet-de-la-connexion', 'Espace thérapie') returning id into v_cab;
  /* Depuis 0035, une fiche ne s'ouvre pas dans un cabinet sans contrat. */
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif');
  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
  values (v_cab, 'connexion-therapeute@exemple.fr', 'owner', now() + interval '1 day');

  -- Cinq fiches, dont celle qui attend le patient ; six exercices, quatre faits.
  insert into public.patients (cabinet_id, display_name, initials, email, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'Camille R.', 'CR', 'connexion-patient@exemple.fr', 'Programme Liberté', '', '', 'Envie de fumer', 'Où en est l''envie de fumer ?')
  returning id into v_pat;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  select v_cab, 'Témoin ' || i, 'T' || i, '', '', '', '', '' from generate_series(1, 4) as i;
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, done_at)
  select v_cab, v_pat, 'Exercice ' || i, '', 'Exercice', i, case when i <= 4 then now() end
    from generate_series(1, 6) as i;

  -- 1. Le revendeur : son organisation, et aucun patient.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"aaaa1111-1111-4111-8111-111111111111","role":"authenticated"}',true);
  perform public.claim_access();
  ctx := public.my_context();
  if ctx->'reseller'->>'name' is distinct from 'Revendeur de la connexion' then
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
  if ctx->'cabinet'->>'name' is distinct from 'Cabinet de la connexion' then
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
    raise exception 'Patient non rattaché : %', ctx;
  end if;
  select count(*) into n from public.patients;
  if n <> 1 then raise exception 'Le patient devrait voir sa seule fiche, il en voit %', n; end if;
  select count(*) into n from public.patient_modules;
  if n <> 6 then raise exception 'Le patient devrait voir ses 6 modules, il en voit %', n; end if;
  select count(*) into n from public.therapy_sessions;
  if n <> 0 then raise exception 'FUITE : le patient atteint le dossier clinique'; end if;

  -- Il coche un module : le seul geste d'écriture qui lui est ouvert ici.
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
  raise exception 'REUSSITE : connexion conforme — revendeur, thérapeute et patient rattachés à ce qui les attendait, et une adresse non invitée n''obtient rien. (Rien ne persiste.)';
end $$;
