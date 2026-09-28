-- ============================================================================
-- Chaque jour se coche ; les mots et les pages se rangent en tête (0051).
--
--   cocher            → une ligne pour le jour de Paris, une seule même si
--                       l'on appuie deux fois ; done_at dit ce jour
--   décocher          → le jour de Paris seul ; hier reste fait, done_at
--                       revient à hier ; un done_at d'avant les jours (posé
--                       hors de la fonction) survit à un décochage du jour
--   écrire soi-même   → refusé : le jour est celui de la base
--   la fiche          → la praticienne coche par la même fonction et lit
--                       les jours de ses fiches, aussi regroupés par
--                       exercice ; un autre cabinet ni ne lit ni ne coche ; un exercice retiré, une fiche close ne
--                       se cochent plus, et le patient ne relit plus les
--                       jours d'un exercice retiré
--   les mots          → triés par leur date d'envoi, pas d'écriture ; un mot
--                       programmé plus tard n'apparaît pas ; un compte du
--                       cabinet n'y lit rien
--   le journal        → une page neuve se range devant la première page
--                       rangée ; sans rang nulle part, elle reste sans rang
--
-- Un seul bloc DO qui se termine par RAISE EXCEPTION 'REUSSITE …' : rien
-- ne persiste. Un ECHEC ou une FUITE lève avant, avec la raison.
--
--   psql "$DATABASE_URL" -f supabase/tests/journee_quotidienne.sql
-- ============================================================================

do $$
declare
  v_praticienne uuid := 'bbbb0000-0000-4000-8000-0000000046a1';
  v_voisine     uuid := 'bbbb0000-0000-4000-8000-0000000046a2';
  v_compte      uuid := 'cccc0000-0000-4000-8000-0000000046c1';
  v_plan text; v_org uuid; v_cab uuid; v_autre_cab uuid;
  v_pat uuid; v_seul uuid; v_m1 uuid; v_m2 uuid; v_m3 uuid; v_m4 uuid;
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_hier_instant timestamptz := now() - interval '1 day';
  v_ancien timestamptz := now() - interval '3 days';
  v_done timestamptz; v_ordre text; v_rang integer;
  n integer; refuse boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
    (v_praticienne,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','test46-praticienne@exemple.fr','',now(),now(),now()),
    (v_voisine,    '00000000-0000-0000-0000-000000000000','authenticated','authenticated','test46-voisine@exemple.fr','',now(),now(),now()),
    (v_compte,     '00000000-0000-0000-0000-000000000000','authenticated','authenticated','test46-patient@exemple.fr','',now(),now(),now());

  insert into public.resellers (name, slug) values ('Revendeur 0046', 'revendeur-0046') returning id into v_org;
  insert into public.cabinets (reseller_id, name, slug) values (v_org, 'Cabinet 0046', 'cabinet-0046') returning id into v_cab;
  insert into public.cabinets (reseller_id, name, slug) values (v_org, 'Cabinet voisin 0046', 'cabinet-voisin-0046') returning id into v_autre_cab;
  /* Depuis 0035, une fiche ne s'ouvre pas dans un cabinet sans contrat. */
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif'), (v_autre_cab, v_plan, 'actif');
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values
    (v_cab, v_praticienne, 'owner', 'Praticienne 0046'),
    (v_autre_cab, v_voisine, 'owner', 'Voisine 0046');

  insert into public.patients (cabinet_id, auth_user_id, email, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, v_compte, 'test46-patient@exemple.fr', 'Test P.', 'TP', '', '', '', '', '')
  returning id into v_pat;
  -- Une seconde fiche, sans compte : son journal n'a jamais été rangé.
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'Seul S.', 'SS', '', '', '', '', '')
  returning id into v_seul;

  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position)
  values (v_cab, v_pat, 'Trois respirations', '', 'Exercice', 0) returning id into v_m1;
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position)
  values (v_cab, v_pat, 'Ancrage', '', 'Exercice', 1) returning id into v_m2;
  -- Un exercice fait il y a trois jours, avant que les jours existent.
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, done_at)
  values (v_cab, v_pat, 'Trois lignes', '', 'Écriture', 2, v_ancien) returning id into v_m3;
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position)
  values (v_cab, v_pat, 'Ancien exercice', '', 'Exercice', 3) returning id into v_m4;

  -- Hier, sur le premier ; un jour sur celui qui va être retiré.
  insert into public.module_completions (module_id, patient_id, jour, created_at) values
    (v_m1, v_pat, v_aujourdhui - 1, v_hier_instant),
    (v_m4, v_pat, v_aujourdhui - 1, v_hier_instant);
  if (select cabinet_id from public.module_completions where module_id = v_m1) is distinct from v_cab then
    raise exception 'ECHEC : le jour fait n''a pas été rangé dans le cabinet de la fiche.';
  end if;
  update public.patient_modules set archived_at = now() where id = v_m4;

  -- ----------------------------------------------------- 1. le patient coche
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_compte, 'role','authenticated')::text, true);

  v_done := public.patient_set_module_done(v_m1, true);
  if v_done is null or (v_done at time zone 'Europe/Paris')::date <> v_aujourdhui then
    raise exception 'ECHEC : cocher devrait dater done_at d''aujourd''hui (%).', v_done;
  end if;
  perform public.patient_set_module_done(v_m1, true);
  select count(*) into n from public.module_completions where module_id = v_m1 and jour = v_aujourdhui;
  if n <> 1 then raise exception 'ECHEC : deux appuis devraient laisser une seule ligne pour aujourd''hui (%).', n; end if;
  select count(*) into n from public.module_completions where module_id = v_m1;
  if n <> 2 then raise exception 'ECHEC : le patient devrait relire hier et aujourd''hui (% ligne(s)).', n; end if;

  -- -------------------------------------------------- 2. le patient décoche
  v_done := public.patient_set_module_done(v_m1, false);
  if v_done is distinct from v_hier_instant then
    raise exception 'ECHEC : décocher aujourd''hui devrait ramener done_at à hier (%).', v_done;
  end if;
  select count(*) into n from public.module_completions where module_id = v_m1 and jour = v_aujourdhui;
  if n <> 0 then raise exception 'ECHEC : aujourd''hui devrait être décoché.'; end if;
  select count(*) into n from public.module_completions where module_id = v_m1 and jour = v_aujourdhui - 1;
  if n <> 1 then raise exception 'ECHEC : décocher aujourd''hui a effacé hier.'; end if;

  v_done := public.patient_set_module_done(v_m3, false);
  if v_done is distinct from v_ancien then
    raise exception 'ECHEC : un done_at d''avant les jours ne doit pas tomber à un décochage du jour (%).', v_done;
  end if;

  -- ------------------------------------------- 3. ce que le patient n'écrit pas
  refuse := false;
  begin
    insert into public.module_completions (module_id, patient_id, jour) values (v_m2, v_pat, v_aujourdhui - 5);
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'FUITE : le patient écrit lui-même un jour passé.'; end if;

  refuse := false;
  begin perform public.patient_set_module_done(v_m4, true); exception when others then refuse := true; end;
  if not refuse then raise exception 'FUITE : le patient coche un exercice retiré.'; end if;
  select count(*) into n from public.module_completions where module_id = v_m4;
  if n <> 0 then raise exception 'FUITE : le patient relit les jours d''un exercice retiré (%).', n; end if;
  select count(*) into n from public.jours_faits_depuis(v_aujourdhui - 7) where module_id = v_m4;
  if n <> 0 then raise exception 'FUITE : le regroupement rend au patient les jours d''un exercice retiré.'; end if;

  -- --------------------------------------------------------- 4. la fiche
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_praticienne, 'role','authenticated')::text, true);

  v_done := public.patient_set_module_done(v_m2, true);
  if v_done is null then raise exception 'ECHEC : la case de la fiche ne coche pas.'; end if;
  select count(*) into n from public.module_completions where patient_id = v_pat;
  -- m1 hier, m2 aujourd'hui, m4 hier (retiré : le dossier le garde).
  if n <> 3 then raise exception 'ECHEC : la praticienne devrait lire les 3 jours de sa fiche (%).', n; end if;
  -- Regroupés par exercice pour le dossier : une ligne chacun.
  select count(*) into n from public.jours_faits_depuis(v_aujourdhui - 7) where module_id in (v_m1, v_m2, v_m4);
  if n <> 3 then raise exception 'ECHEC : le regroupement devrait rendre une ligne par exercice (%).', n; end if;
  if (select jours from public.jours_faits_depuis(v_aujourdhui - 7) where module_id = v_m1)
     is distinct from array[v_aujourdhui - 1] then
    raise exception 'ECHEC : les jours regroupés du premier exercice sont faux.';
  end if;

  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_voisine, 'role','authenticated')::text, true);
  select count(*) into n from public.module_completions;
  if n <> 0 then raise exception 'FUITE : un autre cabinet lit % jour(s) fait(s).', n; end if;
  select count(*) into n from public.jours_faits_depuis(v_aujourdhui - 7);
  if n <> 0 then raise exception 'FUITE : un autre cabinet lit les jours regroupés (% ligne(s)).', n; end if;
  refuse := false;
  begin perform public.patient_set_module_done(v_m2, false); exception when others then refuse := true; end;
  if not refuse then raise exception 'FUITE : un autre cabinet décoche un exercice.'; end if;

  -- Fiche close : ni le patient ni la praticienne ne cochent plus.
  perform set_config('role','none',true);
  update public.patients set archived_at = now() where id = v_pat;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_praticienne, 'role','authenticated')::text, true);
  refuse := false;
  begin perform public.patient_set_module_done(v_m1, true); exception when others then refuse := true; end;
  if not refuse then raise exception 'FUITE : une fiche close se coche encore côté cabinet.'; end if;

  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_compte, 'role','authenticated')::text, true);
  refuse := false;
  begin perform public.patient_set_module_done(v_m1, true); exception when others then refuse := true; end;
  if not refuse then raise exception 'FUITE : un suivi clos coche encore un exercice.'; end if;
  select count(*) into n from public.module_completions;
  if n <> 0 then raise exception 'FUITE : un suivi clos relit % jour(s) fait(s).', n; end if;

  perform set_config('role','none',true);
  update public.patients set archived_at = null where id = v_pat;

  -- --------------------------------------------------------- 5. les mots
  -- Un mot immédiat d'avant-hier ; un mot écrit il y a dix jours et
  -- programmé pour il y a une heure ; un mot programmé pour demain.
  insert into public.push_notifications (id, cabinet_id, title, body, scheduled_for, scheduled_at, created_at) values
    ('eeee0000-0000-4000-8000-0000000046e1', v_cab, 'Immédiat', 'a', 'maintenant', null, now() - interval '2 days'),
    ('eeee0000-0000-4000-8000-0000000046e2', v_cab, 'Programmé', 'b', 'il y a une heure', now() - interval '1 hour', now() - interval '10 days'),
    ('eeee0000-0000-4000-8000-0000000046e3', v_cab, 'Demain', 'c', 'demain', now() + interval '1 day', now());
  insert into public.push_recipients (push_id, patient_id, cabinet_id) values
    ('eeee0000-0000-4000-8000-0000000046e1', v_pat, v_cab),
    ('eeee0000-0000-4000-8000-0000000046e2', v_pat, v_cab),
    ('eeee0000-0000-4000-8000-0000000046e3', v_pat, v_cab);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_compte, 'role','authenticated')::text, true);
  select string_agg(t.title, '|' order by t.rang) into v_ordre
    from public.patient_mots(v_pat, 20) with ordinality as t(push_id, title, body, du_le, read_at, rang);
  if v_ordre is distinct from 'Programmé|Immédiat' then
    raise exception 'ECHEC : les mots devraient venir par date d''envoi, sans celui de demain (%).', v_ordre;
  end if;
  select t.title into v_ordre from public.patient_mots(v_pat, 1) t;
  if v_ordre is distinct from 'Programmé' then
    raise exception 'ECHEC : le plus récent des mots n''est pas dans le premier lot (%).', v_ordre;
  end if;

  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_praticienne, 'role','authenticated')::text, true);
  select count(*) into n from public.patient_mots(v_pat, 20);
  if n <> 0 then raise exception 'FUITE : un compte du cabinet lit % mot(s) comme s''ils étaient les siens.', n; end if;

  -- --------------------------------------------------------- 6. le journal
  perform set_config('role','none',true);
  insert into public.journal_pages (cabinet_id, patient_id, title, body, shared, position) values
    (v_cab, v_pat, 'Rangée en premier', 'x', false, 0),
    (v_cab, v_pat, 'Rangée en second', 'y', false, 1);
  insert into public.journal_pages (cabinet_id, patient_id, title, body, shared)
  values (v_cab, v_seul, 'Jamais rangée', 'z', false);
  select position into v_rang from public.journal_pages where patient_id = v_seul;
  if v_rang is not null then raise exception 'ECHEC : un journal jamais rangé reçoit un rang (%).', v_rang; end if;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_compte, 'role','authenticated')::text, true);
  insert into public.journal_pages (cabinet_id, patient_id, title, body, shared)
  values (v_cab, v_pat, 'Un mot', 'Pour ma thérapeute.', true);
  select position into v_rang from public.journal_pages where patient_id = v_pat and title = 'Un mot';
  if v_rang is distinct from -1 then
    raise exception 'ECHEC : le mot devrait se ranger devant la première page (rang %).', v_rang;
  end if;

  perform set_config('role','none',true);
  raise exception 'REUSSITE : chaque jour se coche pour lui-même, les mots et les pages se rangent en tête.';
end
$$;
