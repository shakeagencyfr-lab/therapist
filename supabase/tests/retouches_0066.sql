-- 0066 éprouvée contre la vraie base : les avis sur l'IA et les préférences
-- retenues.
--
--   praticienne   → vote (pouce levé, pouce baissé) ; types et votes
--                   inconnus refusés ; relit ses avis
--   retenir       → une consigne de 1 à 400 caractères, sans doublon ;
--                   vingt actives au plus par type, la plus ancienne se retire,
--                   les autres types n'en souffrent pas ; au journal, sans la
--                   consigne
--   oublier       → la préférence ne se relit plus comme active
--   navigateur    → personne n'écrit les tables directement
--   autres        → ni voisin, ni patient, ni revendeur ne lit, vote, retient
--                   ou oublie ; rien pour l'anonyme
--   vie privée    → un avis ne porte ni patient ni contenu
--   consommation  → `ai_call_kind` connaît 'revision'
--
-- Un bloc, ANNULÉ par l'exception finale : rien ne subsiste.
do $$
declare
  v_suf     text := substr(md5(random()::text), 1, 8);
  v_ther    uuid := gen_random_uuid();
  v_voisine uuid := gen_random_uuid();
  v_compte  uuid := gen_random_uuid();
  v_rev     uuid := gen_random_uuid();
  v_res     uuid;
  v_plan    text;
  v_cab     uuid;
  v_voisin  uuid;
  v_p1 uuid; v_p2 uuid; v_premiere uuid; v_autre uuid;
  v_n int; v_cols text;
begin
  -- ══ Le décor ═══════════════════════════════════════════════════════════
  -- Un cabinet en règle : sans contrat, aucune fiche ne s'ouvre (0049).
  select code, reseller_id into v_plan, v_res from public.plans where max_patients is null limit 1;
  if v_plan is null then select code, reseller_id into v_plan, v_res from public.plans order by position desc limit 1; end if;
  if v_plan is null then raise exception 'RIEN À ÉPROUVER : aucune offre au catalogue'; end if;
  if v_res is null then
    insert into public.resellers (name, slug) values ('Revendeur 0066', 'revendeur-0066-' || v_suf) returning id into v_res;
  end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), now(), now()
    from (values
      (v_ther, 'praticienne-0066-' || v_suf || '@exemple.test'),
      (v_voisine, 'voisine-0066-' || v_suf || '@exemple.test'),
      (v_compte, 'patient-0066-' || v_suf || '@exemple.test'),
      (v_rev, 'revendeur-0066-' || v_suf || '@exemple.test')
    ) as u(id, email);
  insert into public.reseller_members (reseller_id, user_id, role) values (v_res, v_rev, 'owner');

  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Cabinet 0066', 'cab-0066-' || v_suf, 'x') returning id into v_cab;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Voisin 0066', 'cab-0066v-' || v_suf, 'x') returning id into v_voisin;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif'), (v_voisin, v_plan, 'actif');
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values
    (v_cab, v_ther, 'owner', 'Praticienne 0066'), (v_voisin, v_voisine, 'owner', 'Voisine 0066');
  insert into public.patients (cabinet_id, auth_user_id, email, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, v_compte, 'patient-0066-' || v_suf || '@exemple.test', 'Anna 0066', 'A', '', '', '', '', '');

  -- ══ La consommation connaît la retouche ═════════════════════════════════
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'ai_call_kind' and e.enumlabel = 'revision') then
    raise exception 'ECHEC 0 : ai_call_kind ne connaît pas « revision »';
  end if;

  -- ══ La praticienne vote ═════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ther, 'role', 'authenticated', 'aal', 'aal1')::text, true);

  perform public.cabinet_voter_ia(v_cab, 'hypnose', 'haut');
  perform public.cabinet_voter_ia(v_cab, 'synthese', 'bas');
  perform public.cabinet_voter_ia(v_cab, 'vigilance', 'bas');
  select count(*) into v_n from public.retours_ia where cabinet_id = v_cab;
  if v_n <> 3 then raise exception 'ECHEC 1 : % avis relus au lieu de 3', v_n; end if;
  select count(*) into v_n from public.retours_ia where cabinet_id = v_cab and cree_par = v_ther and vote = 'haut' and cible = 'hypnose';
  if v_n <> 1 then raise exception 'ECHEC 1b : l''avis ne dit pas qui, quoi et dans quel sens'; end if;

  begin
    perform public.cabinet_voter_ia(v_cab, 'patient', 'haut');
    raise exception 'ECHEC 2 : un type inconnu se note';
  exception when check_violation then null;
  end;
  begin
    perform public.cabinet_voter_ia(v_cab, 'hypnose', 'bof');
    raise exception 'ECHEC 2b : un vote qui n''est ni haut ni bas passe';
  exception when check_violation then null;
  end;

  -- ══ Retenir ═════════════════════════════════════════════════════════════
  v_p1 := public.cabinet_retenir_preference(v_cab, 'hypnose', '  Des phrases plus longues, plus lentes, avec davantage de pauses  ');
  v_p2 := public.cabinet_retenir_preference(v_cab, 'hypnose', 'des phrases plus longues, plus lentes, avec davantage de pauses');
  if v_p1 is null or v_p1 <> v_p2 then raise exception 'ECHEC 3 : la même préférence se retient deux fois'; end if;
  if (select consigne from public.preferences_ia where id = v_p1) <> 'Des phrases plus longues, plus lentes, avec davantage de pauses' then
    raise exception 'ECHEC 3b : la consigne n''est pas gardée telle qu''écrite, sans ses blancs';
  end if;

  begin
    perform public.cabinet_retenir_preference(v_cab, 'hypnose', '   ');
    raise exception 'ECHEC 4 : une préférence vide se retient';
  exception when check_violation then null;
  end;
  begin
    perform public.cabinet_retenir_preference(v_cab, 'hypnose', repeat('x', 401));
    raise exception 'ECHEC 4b : une préférence de 401 caractères se retient';
  exception when check_violation then
    if sqlerrm !~ '400 caractères' then raise exception 'ECHEC 4c : refus mal dit (%)', sqlerrm; end if;
  end;
  begin
    perform public.cabinet_retenir_preference(v_cab, 'mots', 'Plus de mots');
    raise exception 'ECHEC 4d : un type qui ne se retouche pas retient une préférence';
  exception when check_violation then null;
  end;

  -- Vingt actives au plus : la vingt et unième retire la plus ancienne.
  v_premiere := v_p1;
  for i in 2..21 loop
    perform public.cabinet_retenir_preference(v_cab, 'hypnose', 'Préférence numéro ' || i);
  end loop;
  v_autre := public.cabinet_retenir_preference(v_cab, 'message', 'Un ton plus chaleureux');
  select count(*) into v_n from public.preferences_ia where cabinet_id = v_cab and cible = 'hypnose' and actif;
  if v_n <> 20 then raise exception 'ECHEC 5 : % préférences actives au lieu de 20', v_n; end if;
  if (select actif from public.preferences_ia where id = v_premiere) then
    raise exception 'ECHEC 5b : la plus ancienne reste active au-delà de vingt';
  end if;
  if not exists (select 1 from public.preferences_ia where cabinet_id = v_cab and cible = 'hypnose' and actif and consigne = 'Préférence numéro 21') then
    raise exception 'ECHEC 5c : la plus récente n''est pas active';
  end if;
  if not (select actif from public.preferences_ia where id = v_autre) then
    raise exception 'ECHEC 5d : le plafond d''un type retire la préférence d''un autre';
  end if;

  -- ══ Oublier ═════════════════════════════════════════════════════════════
  perform public.cabinet_oublier_preference(v_autre);
  if (select actif from public.preferences_ia where id = v_autre) then
    raise exception 'ECHEC 6 : une préférence oubliée reste active';
  end if;

  -- ══ Le navigateur n'écrit rien directement ═══════════════════════════════
  begin
    insert into public.retours_ia (cabinet_id, cible, vote) values (v_cab, 'hypnose', 'haut');
    raise exception 'ECHEC 7 : la praticienne écrit un avis sans passer par la fonction';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.preferences_ia (cabinet_id, cible, consigne) values (v_cab, 'hypnose', 'Contourner le plafond');
    raise exception 'ECHEC 7b : la praticienne écrit une préférence sans passer par la fonction';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.preferences_ia set actif = true where id = v_premiere;
    raise exception 'ECHEC 7c : la praticienne réactive une préférence en contournant le plafond';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.retours_ia where cabinet_id = v_cab;
    raise exception 'ECHEC 7d : la praticienne efface des avis';
  exception when insufficient_privilege then null;
  end;

  -- ══ Les autres ══════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_voisine, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into v_n from public.retours_ia where cabinet_id = v_cab;
  if v_n <> 0 then raise exception 'ECHEC 8 : un autre cabinet lit les avis'; end if;
  select count(*) into v_n from public.preferences_ia where cabinet_id = v_cab;
  if v_n <> 0 then raise exception 'ECHEC 8b : un autre cabinet lit les préférences'; end if;
  begin
    perform public.cabinet_voter_ia(v_cab, 'hypnose', 'bas');
    raise exception 'ECHEC 8c : un autre cabinet vote pour celui-ci';
  exception when no_data_found then null;
  end;
  begin
    perform public.cabinet_retenir_preference(v_cab, 'hypnose', 'Glisser une consigne chez le voisin');
    raise exception 'ECHEC 8d : un autre cabinet retient une préférence chez celui-ci';
  exception when no_data_found then null;
  end;
  begin
    perform public.cabinet_oublier_preference(v_p1);
    raise exception 'ECHEC 8e : un autre cabinet oublie une préférence de celui-ci';
  exception when no_data_found then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_compte, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into v_n from public.retours_ia;
  if v_n <> 0 then raise exception 'ECHEC 9 : le patient lit des avis'; end if;
  select count(*) into v_n from public.preferences_ia;
  if v_n <> 0 then raise exception 'ECHEC 9b : le patient lit des préférences'; end if;
  begin
    perform public.cabinet_voter_ia(v_cab, 'hypnose', 'bas');
    raise exception 'ECHEC 9c : le patient vote sur les textes de son cabinet';
  exception when no_data_found then null;
  end;
  begin
    perform public.cabinet_retenir_preference(v_cab, 'hypnose', 'Écrire ce que je veux');
    raise exception 'ECHEC 9d : le patient retient une préférence';
  exception when no_data_found then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into v_n from public.retours_ia where cabinet_id = v_cab;
  if v_n <> 0 then raise exception 'ECHEC 10 : le revendeur lit les avis d''un cabinet'; end if;
  select count(*) into v_n from public.preferences_ia where cabinet_id = v_cab;
  if v_n <> 0 then raise exception 'ECHEC 10b : le revendeur lit les préférences d''un cabinet'; end if;
  begin
    perform public.cabinet_retenir_preference(v_cab, 'hypnose', 'Le revendeur oriente l''IA');
    raise exception 'ECHEC 10c : le revendeur retient une préférence pour un cabinet';
  exception when no_data_found then null;
  end;

  -- ══ Anonyme, droits et vie privée ═══════════════════════════════════════
  perform set_config('role', 'postgres', true);
  if has_function_privilege('anon', 'public.cabinet_voter_ia(uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public.cabinet_retenir_preference(uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public.cabinet_oublier_preference(uuid)', 'execute') then
    raise exception 'ECHEC 11 : un visiteur anonyme appelle une fonction des retouches';
  end if;
  if has_table_privilege('anon', 'public.retours_ia', 'select')
     or has_table_privilege('anon', 'public.preferences_ia', 'select') then
    raise exception 'ECHEC 11b : un visiteur anonyme lit les retouches';
  end if;
  if has_table_privilege('authenticated', 'public.retours_ia', 'insert')
     or has_table_privilege('authenticated', 'public.retours_ia', 'update')
     or has_table_privilege('authenticated', 'public.retours_ia', 'delete')
     or has_table_privilege('authenticated', 'public.preferences_ia', 'insert')
     or has_table_privilege('authenticated', 'public.preferences_ia', 'update')
     or has_table_privilege('authenticated', 'public.preferences_ia', 'delete') then
    raise exception 'ECHEC 11c : un droit d''écriture reste ouvert au navigateur';
  end if;
  if not exists (select 1 from pg_proc p where p.proname = 'cabinet_retenir_preference'
                  and p.prosecdef and 'search_path=""' = any(p.proconfig)) then
    raise exception 'ECHEC 11d : cabinet_retenir_preference n''est pas une fonction définie à chemin vide';
  end if;

  select string_agg(column_name, ',' order by column_name) into v_cols
    from information_schema.columns where table_schema = 'public' and table_name = 'retours_ia';
  if v_cols <> 'cabinet_id,cible,cree_le,cree_par,id,vote' then
    raise exception 'ECHEC 12 : un avis porte autre chose que son type et son sens (%)', v_cols;
  end if;

  select count(*) into v_n from public.audit_log
   where cabinet_id = v_cab and action = 'ia.preference_retenue' and not (meta ? 'consigne');
  if v_n <> 22 then raise exception 'ECHEC 13 : % préférence(s) retenue(s) au journal au lieu de 22', v_n; end if;
  select count(*) into v_n from public.audit_log where cabinet_id = v_cab and action = 'ia.preference_oubliee';
  if v_n <> 1 then raise exception 'ECHEC 13b : l''oubli n''est pas au journal'; end if;

  raise exception 'REUSSITE : la praticienne vote, retient sans doublon, vingt par type au plus (la plus ancienne se retire), oublie ; types, votes et consignes hors bornes refusés ; personne n''écrit les tables en direct ; ni voisin, ni patient, ni revendeur, ni anonyme ; un avis ne porte ni patient ni contenu ; revision est un genre de consommation';
end $$;
