-- ============================================================================
-- Son journal : le reprendre, l'emporter, partir — même une fois le suivi clos.
--
--   modifier     le patient corrige le titre et le texte de SA page ; la page
--                d'un autre ne bouge pas, et la page reste rangée dans son
--                cabinet
--   emporter     il lit toutes ses pages, pour la copie qu'il télécharge
--   suivi clos   my_context ne lui montre plus de fiche : c'est pourquoi le
--                serveur la cherche par la clé de service (server/compte.ts)
--   partir       sous la clé de service, la fiche close se retrouve par son
--                compte, son journal s'efface, la fiche se détache — aucun
--                déclencheur ne s'y oppose — et le dossier du cabinet reste
--   après        se reconnecter avec la même adresse ne rattache pas la
--                fiche close
--
-- Aucune migration : ce que ces gestes demandent à la base existe déjà. Cette
-- épreuve dit qu'ils y passent, et que rien d'autre ne passe avec eux.
--
-- Un seul bloc DO qui se termine par RAISE EXCEPTION 'REUSSITE …' : rien ne
-- persiste. Une FUITE ou un ECHEC lève avant, avec la raison.
--
--   psql "$DATABASE_URL" -f supabase/tests/journal_et_depart.sql
-- ============================================================================

do $$
declare
  v_praticienne uuid := 'bbbb0000-0000-4000-8000-00000000b0a1';
  v_compte      uuid := 'cccc0000-0000-4000-8000-00000000b0c1';
  v_autre       uuid := 'cccc0000-0000-4000-8000-00000000b0c2';
  v_plan text; v_org uuid; v_cab uuid;
  v_pat uuid; v_pat_autre uuid; v_page uuid; v_page_autre uuid; v_trouvee uuid;
  ctx jsonb; n integer;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
    (v_praticienne,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','testb0-praticienne@exemple.fr','',now(),now(),now()),
    (v_compte,     '00000000-0000-0000-0000-000000000000','authenticated','authenticated','testb0-patient@exemple.fr','',now(),now(),now()),
    (v_autre,      '00000000-0000-0000-0000-000000000000','authenticated','authenticated','testb0-autre@exemple.fr','',now(),now(),now());

  insert into public.resellers (name, slug) values ('Revendeur b0', 'revendeur-b0') returning id into v_org;
  insert into public.cabinets (reseller_id, name, slug) values (v_org, 'Cabinet b0', 'cabinet-b0') returning id into v_cab;
  /* Depuis 0035, une fiche ne s'ouvre pas dans un cabinet sans contrat. */
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif');
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values (v_cab, v_praticienne, 'owner', 'Praticienne b0');

  insert into public.patients (cabinet_id, auth_user_id, email, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, v_compte, 'testb0-patient@exemple.fr', 'Test P.', 'TP', '', '', '', '', '')
  returning id into v_pat;
  insert into public.patients (cabinet_id, auth_user_id, email, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, v_autre, 'testb0-autre@exemple.fr', 'Autre P.', 'AP', '', '', '', '', '')
  returning id into v_pat_autre;

  insert into public.journal_pages (cabinet_id, patient_id, title, body, shared)
  values (v_cab, v_pat, 'Lundi', 'Une phrase de travers.', true) returning id into v_page;
  insert into public.journal_pages (cabinet_id, patient_id, title, body, shared)
  values (v_cab, v_pat, 'Mardi', 'Une autre page.', false);
  insert into public.journal_pages (cabinet_id, patient_id, title, body, shared)
  values (v_cab, v_pat_autre, 'Chez l''autre', 'Pas à toi.', false) returning id into v_page_autre;

  ---------------------------------------------------------------- 1. modifier
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_compte, 'role','authenticated')::text, true);

  update public.journal_pages set title = 'Lundi, repris', body = 'La phrase, corrigée.' where id = v_page;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC : le patient ne peut pas modifier sa page (% ligne)', n; end if;

  -- La page d'un autre : la RLS la cache, la mise à jour ne touche rien.
  update public.journal_pages set body = 'Réécrit par un autre.' where id = v_page_autre;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FUITE : un patient a modifié la page d''un autre'; end if;

  -- Une page ne se déplace pas vers un autre dossier en la modifiant.
  begin
    update public.journal_pages set patient_id = v_pat_autre where id = v_page;
    raise exception 'FUITE : un patient a rangé sa page dans la fiche d''un autre';
  exception when insufficient_privilege or check_violation then null;
  end;

  --------------------------------------------------------------- 2. emporter
  select count(*) into n from public.journal_pages;
  if n <> 2 then raise exception 'ECHEC : le patient devrait lire ses deux pages, et elles seules (%)', n; end if;

  perform set_config('role','none',true);
  if (select body from public.journal_pages where id = v_page) <> 'La phrase, corrigée.' then
    raise exception 'ECHEC : la correction n''est pas en base';
  end if;
  if (select cabinet_id from public.journal_pages where id = v_page) <> v_cab then
    raise exception 'FUITE : la page modifiée a quitté son cabinet';
  end if;
  if (select body from public.journal_pages where id = v_page_autre) <> 'Pas à toi.' then
    raise exception 'FUITE : la page d''un autre a changé';
  end if;

  ------------------------------------------------------------- 3. suivi clos
  update public.patients set archived_at = now() where id = v_pat;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_compte, 'role','authenticated')::text, true);
  ctx := public.my_context();
  if ctx->'patient' <> 'null'::jsonb then
    raise exception 'ECHEC : my_context montre encore la fiche close — le serveur n''aurait pas à la chercher : %', ctx;
  end if;
  -- Ce que le compte ne voit plus, il ne peut pas l'effacer lui-même.
  delete from public.journal_pages where patient_id = v_pat;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FUITE : un suivi clos efface encore son journal sous la RLS'; end if;

  ------------------------------------------------------------------ 4. partir
  perform set_config('role','none',true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role','service_role',true);

  -- La recherche du serveur : la fiche du compte, close ou non.
  select id into v_trouvee from public.patients where auth_user_id = v_compte;
  if v_trouvee is distinct from v_pat then raise exception 'ECHEC : la fiche close n''est pas retrouvée par son compte'; end if;

  delete from public.journal_pages where patient_id = v_trouvee;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'ECHEC : le journal de la fiche close ne s''efface pas (% page(s))', n; end if;

  -- Aucun déclencheur ne s'y oppose : ni le plafond, ni l'adresse du compte.
  update public.patients set auth_user_id = null where id = v_trouvee;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC : la fiche close ne se détache pas'; end if;

  perform set_config('role','none',true);
  if not exists (select 1 from public.patients where id = v_pat and archived_at is not null and auth_user_id is null) then
    raise exception 'ECHEC : le dossier du cabinet devait rester, clos et détaché';
  end if;
  if not exists (select 1 from public.journal_pages where id = v_page_autre) then
    raise exception 'FUITE : le journal d''un autre patient est parti avec';
  end if;

  ------------------------------------------------------------------ 5. après
  /* Le compte n'est pas encore supprimé ici (le serveur le fait après) :
     c'est le pire cas — une reconnexion immédiate ne doit pas rouvrir la
     fiche close. */
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_compte, 'role','authenticated')::text, true);
  perform public.claim_access();
  perform set_config('role','none',true);
  if (select auth_user_id from public.patients where id = v_pat) is not null then
    raise exception 'FUITE : se reconnecter a rattaché la fiche close';
  end if;

  raise exception 'REUSSITE : une page se corrige chez soi et nulle part ailleurs, le journal entier se lit pour être emporté, et un suivi clos se quitte — fiche retrouvée, journal effacé, dossier gardé, rien de rattaché ensuite.';
end $$;
