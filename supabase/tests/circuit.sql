-- ============================================================================
-- Le circuit entier, joué sous les droits réels de chaque acteur.
--
--   revendeur → ouvre un cabinet, invite la praticienne
--   praticienne → rejoint, trouve son cabinet vide, crée son patient
--   patient → rejoint sa fiche, voit son module, le coche
--   revendeur → voit le compteur monter à 1, et toujours aucun patient
--
--   psql "$DATABASE_URL" -f supabase/tests/circuit.sql
--
-- Un seul bloc DO qui se termine par RAISE EXCEPTION 'REUSSITE …' : rien
-- ne persiste. L'épreuve fabrique son propre revendeur plutôt que d'emprunter
-- celui de la base : jouée contre la production, elle ne doit ni dépendre de
-- ce qui s'y trouve, ni lire un compteur qui appartient à un vrai cabinet.
--
-- Piège rencontré en l'écrivant : lire un identifiant APRÈS avoir changé de
-- rôle le cache derrière la RLS. Tout ce qui doit être connu du scénario se
-- lit avant la première bascule.
-- ============================================================================

do $$
declare
  v_revendeur uuid := 'aaaa0000-0000-4000-8000-00000000c1c1';
  v_org uuid; v_cab uuid; v_pat uuid;
  ctx jsonb; n integer; s text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
    (v_revendeur,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','circuit-revendeur@exemple.fr','',now(),now(),now()),
    ('bbbb0000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','laetitia@exemple.fr','',now(),now(),now()),
    ('cccc0000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','camille@exemple.fr','',now(),now(),now());

  insert into public.resellers (name, slug) values ('Revendeur du circuit', 'revendeur-du-circuit') returning id into v_org;
  insert into public.reseller_members (reseller_id, user_id, role) values (v_org, v_revendeur, 'owner');
  -- Depuis 0049, un revendeur ne pose que les offres de SON catalogue : celui
  -- du circuit a donc la sienne, créée par la plateforme.
  insert into public.plans (code, label, price_cents, max_patients, shop, marque_blanche, site, position, reseller_id)
  values ('circuit-cabinet', 'Cabinet', 7900, 80, true, true, true, 99, v_org);

  ---------------------------------------------------------------- revendeur
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_revendeur, 'role','authenticated')::text, true);

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_org, 'Cabinet Laetitia Ollivier', 'laetitia-ollivier', 'Espace thérapie')
  returning id into v_cab;

  /* Un essai qui court : depuis 0035, c'est lui qui ouvre le droit de créer
     une fiche. */
  insert into public.subscriptions (cabinet_id, plan_code, status, trial_ends_at)
  values (v_cab, 'circuit-cabinet', 'essai', now() + interval '14 days');

  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
  values (v_cab, 'laetitia@exemple.fr', 'owner', now() + interval '30 days');

  select count(*) into n from public.patients;
  if n <> 0 then raise exception 'FUITE : le revendeur voit % patients', n; end if;

  ------------------------------------------------------------- praticienne
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"bbbb0000-0000-4000-8000-000000000002","role":"authenticated"}',true);

  perform public.claim_access();
  ctx := public.my_context();
  if ctx->'cabinet'->>'name' is distinct from 'Cabinet Laetitia Ollivier' then
    raise exception 'La praticienne n''a pas rejoint son cabinet : %', ctx;
  end if;

  select count(*) into n from public.patients;
  if n <> 0 then raise exception 'Un cabinet neuf devrait être vide, il a % fiches', n; end if;

  insert into public.patients (cabinet_id, display_name, initials, email, program, subtitle,
                               week_label, sessions_done, sessions_total, scale_label, scale_question)
  values (v_cab, 'Camille R.', 'CR', 'camille@exemple.fr', 'Programme Liberté',
          'Liberté · semaine 1 / 6', 'Semaine 1 sur 6', 0, 6,
          'Envie de fumer', 'Où en est l''envie de fumer ?')
  returning id into v_pat;

  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position)
  values (v_cab, v_pat, 'Geste d''ancrage avant le café', 'Tous les jours · 2 min', 'Exercice', 0);

  select count(*) into n from public.patients;
  if n <> 1 then raise exception 'La praticienne devrait voir son patient, elle en voit %', n; end if;

  ------------------------------------------------------------------ patient
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"cccc0000-0000-4000-8000-000000000003","role":"authenticated"}',true);

  perform public.claim_access();
  ctx := public.my_context();
  if ctx->'patient'->>'display_name' is distinct from 'Camille R.' then
    raise exception 'Le patient n''a pas été rattaché à sa fiche : %', ctx;
  end if;
  if ctx->'patient'->>'cabinet_name' is distinct from 'Cabinet Laetitia Ollivier' then
    raise exception 'Mauvais cabinet rattaché : %', ctx;
  end if;

  select count(*) into n from public.patient_modules;
  if n <> 1 then raise exception 'Il devrait voir son module, il en voit %', n; end if;

  select id into s from public.patient_modules limit 1;
  perform public.patient_set_module_done(s::uuid, true);
  select count(*) into n from public.patient_modules where done_at is not null;
  if n <> 1 then raise exception 'Le module coché n''a pas été enregistré'; end if;

  select count(*) into n from public.cabinets;
  if n <> 0 then raise exception 'FUITE : le patient atteint % cabinet(s)', n; end if;

  ---------------------------------------------- le revendeur, après coup
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_revendeur, 'role','authenticated')::text, true);

  select patients_active into n from public.reseller_cabinet_overview() where cabinet_id = v_cab;
  if n is distinct from 1 then raise exception 'Le compteur du revendeur devrait montrer 1 patient, il montre %', n; end if;
  select count(*) into n from public.patients;
  if n <> 0 then raise exception 'FUITE : le revendeur voit le patient créé'; end if;

  perform set_config('role','none',true);
  raise exception 'REUSSITE : circuit complet — revendeur, praticienne, patient, chacun sous ses droits. (Rien ne persiste.)';
end $$;
