-- ============================================================================
-- Épreuve des contrats (0049), contre la vraie base.
--
-- Le bloc fabrique DEUX revendeurs, chacun avec son offre et son cabinet, une
-- praticienne et un patient, joue les gestes sous les droits réels de chacun,
-- puis ANNULE tout par l'exception finale : rien ne subsiste, même en cas de
-- réussite.
--
--   1. Le catalogue appartient à son revendeur : le propriétaire de B ne lit,
--      ne règle ni ne pose les offres de A ; un employé de A ne les règle
--      pas ; le propriétaire de A les règle, sans pouvoir en changer le code
--      ni le revendeur. Les abonnements gardent leur `plan_code`.
--   2. Un essai a toujours une fin, même posé sans date par un `upsert`.
--   3. Le plafond dit « Closez un suivi terminé » ; hors contrat, rouvrir un
--      suivi est refusé avec le message du contrat.
--   4. La praticienne règle le nom, le sur-titre et la marque de son cabinet,
--      pas son identifiant ni son archivage ; le revendeur, si.
--   5. Un ancien identifiant mène au cabinet, reste à lui, et les rappels
--      déjà programmés suivent le nouveau.
--   6. Les droits disent la fin d'essai et qui est le revendeur.
--   7. Le journal garde les changements, et chacun ne relit que les siens.
--
--   psql "$DATABASE_URL" -f supabase/tests/contrats.sql
-- ============================================================================

do $$
declare
  v_suf   text := substr(md5(random()::text), 1, 6);
  v_oa    uuid := gen_random_uuid();   -- propriétaire du revendeur A
  v_sa    uuid := gen_random_uuid();   -- employé du revendeur A
  v_ob    uuid := gen_random_uuid();   -- propriétaire du revendeur B
  v_pr    uuid := gen_random_uuid();   -- praticienne du cabinet de A
  v_pa    uuid := gen_random_uuid();   -- compte du patient
  v_ra    uuid;
  v_rb    uuid;
  v_ka    uuid;
  v_kb    uuid;
  v_kc    uuid;
  v_plan_a text;
  v_plan_b text;
  v_slug1 text;
  v_slug2 text;
  v_patient uuid;
  v_patient2 uuid;
  v_n     integer;
  v_prix  integer;
  v_site  boolean;
  v_txt   text;
  v_msg   text;
  v_fin   timestamptz;
  v_refus boolean;
  v_droits jsonb;
begin
  v_plan_a := 'epreuve-a-' || v_suf;
  v_plan_b := 'epreuve-b-' || v_suf;
  v_slug1  := 'epreuve-ancien-' || v_suf;
  v_slug2  := 'epreuve-nouveau-' || v_suf;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.email, '', now(), now(), now()
    from (values
      (v_oa, 'proprio-a-' || v_suf || '@exemple.test'),
      (v_sa, 'employe-a-' || v_suf || '@exemple.test'),
      (v_ob, 'proprio-b-' || v_suf || '@exemple.test'),
      (v_pr, 'praticienne-' || v_suf || '@exemple.test'),
      (v_pa, 'patient-' || v_suf || '@exemple.test')
    ) as u(id, email);

  insert into public.resellers (name, slug, support_email)
  values ('Revendeur A', 'revendeur-a-' || v_suf, 'support-a@exemple.test')
  returning id into v_ra;
  insert into public.resellers (name, slug)
  values ('Revendeur B', 'revendeur-b-' || v_suf)
  returning id into v_rb;
  insert into public.reseller_members (reseller_id, user_id, role)
  values (v_ra, v_oa, 'owner'), (v_ra, v_sa, 'staff'), (v_rb, v_ob, 'owner');

  insert into public.plans (code, label, price_cents, max_patients, shop, marque_blanche, site, position, reseller_id)
  values (v_plan_a, 'Offre A', 7900, 10, true, true, true, 90, v_ra),
         (v_plan_b, 'Offre B', 3900, 10, true, false, false, 91, v_rb);

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_ra, 'Cabinet A', v_slug1, 'x') returning id into v_ka;
  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rb, 'Cabinet B', 'epreuve-b-' || v_suf, 'x') returning id into v_kb;
  insert into public.subscriptions (cabinet_id, plan_code, status)
  values (v_ka, v_plan_a, 'actif'), (v_kb, v_plan_b, 'actif');
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name)
  values (v_ka, v_pr, 'owner', 'Praticienne A');

  ------------------------------------------------ 1. le catalogue et son revendeur
  -- Le propriétaire de B tente de fermer les leviers de l'offre de A.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ob, 'role', 'authenticated')::text, true);
  update public.plans set site = false, shop = false, marque_blanche = false, price_cents = 1
   where code = v_plan_a;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ECHEC 1a : le propriétaire de B a réglé l''offre de A'; end if;

  select count(*) into v_n from public.plans where code = v_plan_a;
  if v_n <> 0 then raise exception 'ECHEC 1b : le propriétaire de B lit le catalogue de A'; end if;

  v_refus := false;
  begin
    update public.subscriptions set plan_code = v_plan_a where cabinet_id = v_kb;
  exception when check_violation then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC 1c : B pose l''offre de A à son propre cabinet'; end if;

  -- Son offre à lui, il la règle.
  update public.plans set price_cents = 4200 where code = v_plan_b;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ECHEC 1d : le propriétaire de B ne règle pas sa propre offre'; end if;

  -- Un employé de A ne règle pas le catalogue de l'enseigne.
  perform set_config('request.jwt.claims', json_build_object('sub', v_sa, 'role', 'authenticated')::text, true);
  update public.plans set price_cents = 2 where code = v_plan_a;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ECHEC 1e : un employé de A a réglé une offre'; end if;

  -- La praticienne ne relève pas son propre plafond.
  perform set_config('request.jwt.claims', json_build_object('sub', v_pr, 'role', 'authenticated')::text, true);
  update public.plans set max_patients = 9999 where code = v_plan_a;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ECHEC 1f : la praticienne a réglé l''offre de son cabinet'; end if;

  -- Le propriétaire de A règle son offre, mais ni son code ni son revendeur.
  perform set_config('request.jwt.claims', json_build_object('sub', v_oa, 'role', 'authenticated')::text, true);
  update public.plans set price_cents = 8900 where code = v_plan_a;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ECHEC 1g : le propriétaire de A ne règle pas son offre'; end if;

  v_refus := false;
  begin
    update public.plans set reseller_id = v_rb where code = v_plan_a;
  exception when insufficient_privilege then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC 1h : une offre change de revendeur depuis le navigateur'; end if;

  v_refus := false;
  begin
    update public.plans set code = 'epreuve-vole-' || v_suf where code = v_plan_a;
  exception when insufficient_privilege then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC 1i : le code d''une offre change depuis le navigateur'; end if;
  perform set_config('role', 'postgres', true);

  select price_cents, site into v_prix, v_site from public.plans where code = v_plan_a;
  if v_prix <> 8900 or not v_site then
    raise exception 'ECHEC 1j : l''offre de A a bougé sous une autre main (prix %, site %)', v_prix, v_site;
  end if;
  select plan_code into v_txt from public.subscriptions where cabinet_id = v_kb;
  if v_txt <> v_plan_b then raise exception 'ECHEC 1k : l''abonnement de B a changé d''offre (%)', v_txt; end if;

  ------------------------------------------------ 2. un essai a une fin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_oa, 'role', 'authenticated')::text, true);
  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_ra, 'Cabinet C', 'epreuve-c-' || v_suf, 'x') returning id into v_kc;
  -- Le geste « changer d'offre » d'un cabinet sans contrat : un upsert qui ne
  -- dit que l'offre.
  insert into public.subscriptions (cabinet_id, plan_code) values (v_kc, v_plan_a)
  on conflict (cabinet_id) do update set plan_code = excluded.plan_code;
  perform set_config('role', 'postgres', true);

  select trial_ends_at, status::text into v_fin, v_txt from public.subscriptions where cabinet_id = v_kc;
  if v_txt <> 'essai' or v_fin is null
     or v_fin < now() + interval '13 days' or v_fin > now() + interval '15 days' then
    raise exception 'ECHEC 2a : un essai posé sans date n''a pas ses quatorze jours (statut %, fin %)', v_txt, v_fin;
  end if;
  update public.subscriptions set trial_ends_at = null where cabinet_id = v_kc;
  select trial_ends_at into v_fin from public.subscriptions where cabinet_id = v_kc;
  if v_fin is null then raise exception 'ECHEC 2b : un essai a perdu sa date de fin'; end if;
  update public.subscriptions set trial_ends_at = now() - interval '1 day' where cabinet_id = v_kc;
  if public.abonnement_en_regle(v_kc) then raise exception 'ECHEC 2c : un essai échu reste en règle'; end if;

  ------------------------------------------------ 3. le plafond dit le bon geste
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question, auth_user_id)
  values (v_ka, 'Épreuve un', 'EU', '', '', '', '', '', v_pa) returning id into v_patient;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_ka, 'Épreuve deux', 'ED', '', '', '', '', '') returning id into v_patient2;
  update public.patients set archived_at = now() where id = v_patient2;

  update public.subscriptions set max_patients_override = 1 where cabinet_id = v_ka;
  v_msg := '';
  begin
    insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
    values (v_ka, 'Épreuve trois', 'ET', '', '', '', '', '');
  exception when check_violation then v_msg := sqlerrm;
  end;
  if v_msg not like '%Closez un suivi terminé%' then
    raise exception 'ECHEC 3a : le message du plafond ne dit pas le geste qui existe — %', v_msg;
  end if;
  update public.subscriptions set max_patients_override = null where cabinet_id = v_ka;

  update public.subscriptions set status = 'impaye' where cabinet_id = v_ka;
  v_msg := '';
  begin
    update public.patients set archived_at = null where id = v_patient2;
  exception when check_violation then v_msg := sqlerrm;
  end;
  if v_msg not like '%abonnement n''est plus en cours%rouverte%' then
    raise exception 'ECHEC 3b : hors contrat, la réouverture ne dit pas la vraie cause — %', v_msg;
  end if;
  update public.subscriptions set status = 'actif' where cabinet_id = v_ka;

  ------------------------------------------------ 4. ce qui revient au revendeur
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_pr, 'role', 'authenticated')::text, true);
  update public.cabinets set name = 'Cabinet A renommé', tagline = 'Hypnose' where id = v_ka;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ECHEC 4a : la praticienne ne règle plus le nom de son cabinet'; end if;

  v_refus := false;
  begin
    update public.cabinets set slug = 'epreuve-vole-' || v_suf where id = v_ka;
  exception when insufficient_privilege then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC 4b : la praticienne change l''identifiant de son cabinet'; end if;

  v_refus := false;
  begin
    update public.cabinets set archived_at = now() where id = v_ka;
  exception when insufficient_privilege then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC 4c : la praticienne archive son cabinet'; end if;

  ------------------------------------------------ 5. un ancien identifiant reste une adresse
  perform set_config('role', 'postgres', true);
  insert into public.push_subscriptions (patient_id, cabinet_id, user_id, endpoint, p256dh, auth, chemin)
  values (v_patient, v_ka, v_pa, 'https://fcm.googleapis.com/fcm/send/epreuve-' || v_suf,
          repeat('p', 60), repeat('a', 20), '/' || v_slug1 || '/mon');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_oa, 'role', 'authenticated')::text, true);
  update public.cabinets set slug = v_slug2 where id = v_ka;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ECHEC 5a : le revendeur ne change pas l''identifiant de son cabinet'; end if;
  select count(*) into v_n from public.cabinet_slug_aliases where cabinet_id = v_ka and slug = v_slug1;
  if v_n <> 1 then raise exception 'ECHEC 5b : le revendeur ne lit pas l''ancien identifiant de son cabinet'; end if;

  -- La porte répond sous l'ancien identifiant, et donne le nouveau — à un
  -- visiteur qui n'est personne.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_txt := public.cabinet_vitrine(v_slug1)->>'slug';
  if v_txt is distinct from v_slug2 then
    raise exception 'ECHEC 5c : l''ancienne adresse ne mène plus au cabinet (%)', v_txt;
  end if;
  v_txt := public.cabinet_vitrine(upper(v_slug2))->>'slug';
  if v_txt is distinct from v_slug2 then raise exception 'ECHEC 5d : la nouvelle adresse ne répond pas'; end if;
  perform set_config('role', 'postgres', true);

  select chemin into v_txt from public.push_subscriptions where patient_id = v_patient;
  if v_txt <> '/' || v_slug2 || '/mon' then
    raise exception 'ECHEC 5e : le rappel rouvre encore l''ancienne porte (%)', v_txt;
  end if;

  -- L'ancien identifiant reste au cabinet A : B ne peut ni le prendre en
  -- ouvrant un cabinet, ni y renommer le sien.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ob, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.cabinet_slug_aliases where cabinet_id = v_ka;
  if v_n <> 0 then raise exception 'ECHEC 5f : un autre revendeur lit les anciens identifiants de A'; end if;
  v_refus := false;
  begin
    insert into public.cabinets (reseller_id, name, slug, tagline) values (v_rb, 'Capteur', v_slug1, 'x');
  exception when unique_violation then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC 5g : un ancien identifiant a été repris par un autre cabinet'; end if;
  v_refus := false;
  begin
    update public.cabinets set slug = v_slug1 where id = v_kb;
  exception when unique_violation then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC 5h : un cabinet s''est renommé sous l''ancien identifiant d''un autre'; end if;

  -- A reprend son ancien identifiant : il redevient l'adresse, l'autre devient
  -- l'ancien.
  perform set_config('request.jwt.claims', json_build_object('sub', v_oa, 'role', 'authenticated')::text, true);
  update public.cabinets set slug = v_slug1 where id = v_ka;
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from public.cabinet_slug_aliases where cabinet_id = v_ka and slug = v_slug1;
  if v_n <> 0 then raise exception 'ECHEC 5i : l''identifiant repris est resté un ancien'; end if;
  if public.cabinet_vitrine(v_slug2)->>'slug' is distinct from v_slug1 then
    raise exception 'ECHEC 5j : l''identifiant quitté ne mène plus au cabinet';
  end if;

  ------------------------------------------------ 6. ce que la thérapeute lit de son contrat
  update public.subscriptions set status = 'essai', trial_ends_at = now() + interval '3 days' where cabinet_id = v_ka;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_pr, 'role', 'authenticated')::text, true);
  v_droits := public.mes_droits();
  perform set_config('role', 'postgres', true);
  if v_droits->>'revendeur' is distinct from 'Revendeur A'
     or v_droits->>'revendeur_courriel' is distinct from 'support-a@exemple.test' then
    raise exception 'ECHEC 6a : les droits ne disent pas qui est le revendeur — %', v_droits;
  end if;
  if v_droits->>'fin_essai' is null or not (v_droits->>'en_regle')::boolean then
    raise exception 'ECHEC 6b : un essai qui court ne dit pas sa fin — %', v_droits;
  end if;
  update public.subscriptions set status = 'actif' where cabinet_id = v_ka;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_pr, 'role', 'authenticated')::text, true);
  v_droits := public.mes_droits();
  perform set_config('role', 'postgres', true);
  if v_droits ? 'fin_essai' and v_droits->>'fin_essai' is not null then
    raise exception 'ECHEC 6c : un contrat actif annonce encore une fin d''essai — %', v_droits;
  end if;

  ------------------------------------------------ 7. le journal
  select count(*) into v_n from public.audit_log
   where cabinet_id = v_ka and action = 'contrat.statut' and meta->>'apres' = 'impaye';
  if v_n <> 1 then raise exception 'ECHEC 7a : le passage en impayé n''est pas au journal'; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_oa, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.journal_des_contrats(200) j where j.cabinet_id = v_kb;
  if v_n <> 0 then raise exception 'ECHEC 7b : A relit les contrats de B'; end if;
  select count(*) into v_n from public.journal_des_contrats(200) j where j.cabinet_id = v_ka;
  if v_n = 0 then raise exception 'ECHEC 7c : A ne relit pas les contrats de son cabinet'; end if;
  select count(*) into v_n from public.journal_des_contrats(200) j
   where j.action = 'offre.reglee' and j.meta->>'code' = v_plan_a and j.auteur = 'vous';
  if v_n <> 1 then raise exception 'ECHEC 7d : le réglage de l''offre de A n''est pas relu par A comme le sien (%)', v_n; end if;
  select count(*) into v_n from public.journal_des_contrats(200) j where j.meta->>'code' = v_plan_b;
  if v_n <> 0 then raise exception 'ECHEC 7e : A relit les réglages d''offre de B'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ob, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.journal_des_contrats(200) j where j.cabinet_id = v_ka or j.meta->>'code' = v_plan_a;
  if v_n <> 0 then raise exception 'ECHEC 7f : B relit le journal de A'; end if;

  -- La praticienne n'est pas revendeur : rien.
  perform set_config('request.jwt.claims', json_build_object('sub', v_pr, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.journal_des_contrats(200);
  if v_n <> 0 then raise exception 'ECHEC 7g : la praticienne relit le journal du revendeur'; end if;
  perform set_config('role', 'postgres', true);

  raise exception 'REUSSITE : catalogue tenu par son revendeur, essai borné, plafond qui dit « Closez », identifiant et archivage réservés au revendeur, anciens identifiants redirigés et gardés, droits qui nomment le revendeur, journal cloisonné';
end $$;
