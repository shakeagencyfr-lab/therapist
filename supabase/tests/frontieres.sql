-- Les frontières refermées par 0030, éprouvées contre la vraie base.
--
-- Elle fabrique un cabinet et un compte témoins, joue l'attaque, et ANNULE
-- tout par une exception finale : rien ne subsiste, même en cas de réussite.
--
-- Pourquoi un compte fabriqué plutôt qu'un vrai : le seul compte patient
-- rattaché en production est aussi membre du cabinet, donc la politique
-- « cabinet » accepte légitimement ses écritures. Une épreuve qui l'aurait
-- pris pour cobaye aurait conclu à un échec là où il n'y en a pas.
do $$
declare
  v_rev uuid; v_cab_att uuid; v_cab_vise uuid;
  v_uid uuid := gen_random_uuid();
  v_fiche uuid; v_range uuid; v_n int; v_module uuid;
begin
  select id into v_rev from public.resellers limit 1;
  select id into v_cab_vise from public.cabinets where archived_at is null limit 1;
  if v_rev is null or v_cab_vise is null then
    raise exception 'RIEN À ÉPROUVER : ni revendeur ni cabinet en base';
  end if;

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Cabinet attaquant', 'cab-attaquant-t', 'x') returning id into v_cab_att;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'mallory-temoin@exemple.test', '', now(), now(), now());

  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_cab_att, v_uid, 'Mallory', 'M', 'p', 's', 'w', 'l', 'q', 'mallory-temoin@exemple.test')
  returning id into v_fiche;

  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind)
  values (v_cab_att, v_fiche, 'm', '{}'::jsonb, 'Exercice') returning id into v_module;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  -- 1. Le journal se range chez la fiche, quel que soit le cabinet demandé.
  insert into public.journal_pages (cabinet_id, patient_id, title, body, shared)
  values (v_cab_vise, v_fiche, 't', 'b', true) returning cabinet_id into v_range;
  if v_range <> v_cab_att then
    raise exception 'ECHEC 1 : le journal est parti chez % au lieu de %', v_range, v_cab_att;
  end if;

  -- 2. L'auto-évaluation n'a plus de porte directe : seul le RPC écrit.
  begin
    insert into public.scale_entries (cabinet_id, patient_id, value) values (v_cab_vise, v_fiche, 9);
    raise exception 'ECHEC 2 : l insertion directe d une echelle est encore acceptee';
  exception when insufficient_privilege then null;
  end;

  -- 3. Le quiz se range par son module.
  insert into public.module_quiz_answers (cabinet_id, module_id, question_index, answer_index)
  values (v_cab_vise, v_module, 0, 1) returning cabinet_id into v_range;
  if v_range <> v_cab_att then raise exception 'ECHEC 3 : le quiz est parti chez %', v_range; end if;

  -- 4. Le journal d'accès refuse une ligne forgée.
  begin
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id)
    values (v_cab_vise, v_uid, 'faux', 'patients', v_fiche);
    raise exception 'ECHEC 4 : une ligne d audit forgee est acceptee';
  exception when insufficient_privilege then null;
  end;

  -- 5. Plus aucune politique ne laisse un patient réécrire sa ligne de
  --    destinataire — donc plus aucun moyen de repointer un push_id.
  select count(*) into v_n from pg_policies
   where schemaname='public' and tablename='push_recipients' and cmd='UPDATE'
     and policyname <> 'cabinet';
  if v_n > 0 then raise exception 'ECHEC 5 : la politique d UPDATE patient subsiste'; end if;

  reset role;
  raise exception 'REUSSITE : cinq frontieres tiennent.';
end $$;
