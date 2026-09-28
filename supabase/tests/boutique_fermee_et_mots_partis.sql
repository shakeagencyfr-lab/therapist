-- ============================================================================
-- 0047 éprouvée contre la vraie base.
--
--   La boutique du patient : ouverte seulement si le contrat court, si
--   l'offre ouvre le levier, et si la thérapeute l'allume — l'onglet
--   (`patient_cabinet_settings`) ET la vitrine (politique de `products`).
--   Avant 0047, la vitrine restait VIDE même tout ouvert (ECHEC 2) : la
--   politique joignait des réglages que le patient ne peut pas lire.
--   Un produit ne livre pas l'audio d'un autre cabinet (0044, en régression).
--   Un mot programmé se modifie et s'annule avant l'heure, plus après.
--
-- Le bloc fabrique ses deux cabinets, ses comptes et ses données, puis
-- ANNULE tout par l'exception finale : rien ne subsiste, même en cas de
-- réussite. Chaque cabinet reçoit un abonnement actif — depuis 0035, une
-- fiche ne s'ouvre pas dans un cabinet sans contrat.
--
--   psql "$DATABASE_URL" -f supabase/tests/boutique_fermee_et_mots_partis.sql
-- ============================================================================

do $$
declare
  v_rev uuid; v_cab uuid; v_voisin uuid;
  v_ther uuid := gen_random_uuid();
  v_pat_uid uuid := gen_random_uuid();
  v_fiche uuid; v_prod uuid; v_audio_voisin uuid;
  v_futur uuid; v_parti uuid; v_orphelin uuid;
  v jsonb; n int;
begin
  select id into v_rev from public.resellers limit 1;
  if v_rev is null then raise exception 'RIEN À ÉPROUVER : aucun revendeur en base'; end if;

  -- Une offre témoin qui ouvre la boutique, sans plafond de fiches.
  insert into public.plans (code, label, price_cents, max_patients, shop)
  values ('temoin-0047', 'Témoin 0047', 0, null, true);

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Cabinet 0047', 'cabinet-0047-t', 'x') returning id into v_cab;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, 'temoin-0047', 'actif');
  insert into public.cabinet_settings (cabinet_id, shop_enabled) values (v_cab, true);

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Voisin 0047', 'voisin-0047-t', 'x') returning id into v_voisin;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_voisin, 'temoin-0047', 'actif');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at) values
    (v_ther, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'therapeute-0047@exemple.test', '', now(), now(), now()),
    (v_pat_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'patient-0047@exemple.test', '', now(), now(), now());
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name)
  values (v_cab, v_ther, 'owner', 'Thérapeute 0047');

  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, v_pat_uid, 'Camille', 'C', 'p', 's', 'w', 'l', 'q', 'patient-0047@exemple.test')
  returning id into v_fiche;

  insert into public.products (cabinet_id, title, kind, price_cents)
  values (v_cab, 'Séance de suivi', 'seance', 6000) returning id into v_prod;

  insert into public.audio_library (cabinet_id, title, duration_seconds, storage_path)
  values (v_voisin, 'Audio du voisin', 600, v_voisin || '/voisin.mp3') returning id into v_audio_voisin;

  -- ---- 1. Tout ouvert : l'onglet et la vitrine ---------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_pat_uid, 'role', 'authenticated')::text, true);
  v := public.patient_cabinet_settings();
  if not coalesce((v->>'shop_enabled')::boolean, false) then
    raise exception 'ECHEC 1 : contrat, offre et réglage ouverts, la boutique reste fermée';
  end if;
  select count(*) into n from public.products;
  if n <> 1 then raise exception 'ECHEC 2 : la vitrine ouverte montre % produit(s) au lieu d''un', n; end if;

  -- ---- 2. Hors contrat : fermée des deux côtés --------------------------
  perform set_config('role', 'postgres', true);
  update public.subscriptions set status = 'impaye' where cabinet_id = v_cab;
  perform set_config('role', 'authenticated', true);
  v := public.patient_cabinet_settings();
  if coalesce((v->>'shop_enabled')::boolean, false) then
    raise exception 'ECHEC 3 : contrat impayé, l''onglet Boutique reste ouvert';
  end if;
  select count(*) into n from public.products;
  if n <> 0 then raise exception 'ECHEC 4 : contrat impayé, la vitrine montre encore % produit(s)', n; end if;

  -- ---- 3. Contrat en règle mais levier fermé : fermée aussi --------------
  perform set_config('role', 'postgres', true);
  update public.subscriptions set status = 'actif', shop_override = false where cabinet_id = v_cab;
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.products;
  if n <> 0 then raise exception 'ECHEC 5 : levier fermé par l''offre, la vitrine reste lisible'; end if;

  -- ---- 4. La fonction ne sonde pas le cabinet d'un autre -----------------
  if public.boutique_ouverte_pour_moi(v_voisin) then
    raise exception 'ECHEC 6 : la règle répond pour un cabinet dont on n''est pas patient';
  end if;
  perform set_config('role', 'anon', true);
  begin
    perform public.boutique_ouverte_pour_moi(v_cab);
    raise exception 'ECHEC 7 : un visiteur anonyme appelle la règle de la boutique';
  exception when insufficient_privilege then null;
  end;

  -- ---- 5. L'audio d'un autre cabinet ne se vend pas (0044) ---------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ther, 'role', 'authenticated')::text, true);
  begin
    update public.products set kind = 'audio', audio_id = v_audio_voisin where id = v_prod;
    raise exception 'ECHEC 8 : un produit livre l''audio d''un autre cabinet';
  exception when check_violation then null;
  end;

  -- ---- 6. Un mot programmé : modifiable et annulable avant l'heure -------
  insert into public.push_notifications (cabinet_id, title, body, scheduled_for, scheduled_at)
  values (v_cab, 'Ce soir', 'Pensez à votre audio.', 'Ce soir, 20 h', now() + interval '6 hours')
  returning id into v_futur;
  insert into public.push_recipients (push_id, patient_id, cabinet_id) values (v_futur, v_fiche, v_cab);

  update public.push_notifications
     set title = 'Demain matin', body = 'Un mot, reprogrammé.', scheduled_for = 'Demain, 8 h',
         scheduled_at = now() + interval '12 hours'
   where id = v_futur;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC 9 : un mot programmé ne se modifie pas'; end if;

  delete from public.push_notifications where id = v_futur;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC 10 : un mot programmé ne s''annule pas'; end if;

  -- ---- 7. Un mot parti : figé ---------------------------------------------
  insert into public.push_notifications (cabinet_id, title, body, scheduled_for, scheduled_at)
  values (v_cab, 'Maintenant', 'Déjà parti.', 'Maintenant', now() - interval '1 minute')
  returning id into v_parti;
  insert into public.push_recipients (push_id, patient_id, cabinet_id) values (v_parti, v_fiche, v_cab);

  begin
    update public.push_notifications set body = 'Réécrit après coup.' where id = v_parti;
    raise exception 'ECHEC 11 : un mot parti se réécrit';
  exception when check_violation then null;
  end;
  begin
    update public.push_notifications set scheduled_at = now() + interval '1 day' where id = v_parti;
    raise exception 'ECHEC 12 : un mot parti se reprogramme';
  exception when check_violation then null;
  end;
  begin
    delete from public.push_notifications where id = v_parti;
    raise exception 'ECHEC 13 : un mot parti s''efface';
  exception when check_violation then null;
  end;

  -- ---- 8. L'orpheline s'efface toujours (échec des destinataires) ---------
  insert into public.push_notifications (cabinet_id, title, body, scheduled_for, scheduled_at)
  values (v_cab, 'Orpheline', 'Sans destinataire.', 'Maintenant', now())
  returning id into v_orphelin;
  delete from public.push_notifications where id = v_orphelin;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC 14 : la ligne orpheline ne s''efface plus'; end if;

  -- ---- 9. Le cabinet qui part emporte ses mots, partis compris -----------
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  delete from public.cabinets where id = v_cab;
  select count(*) into n from public.push_notifications where id = v_parti;
  if n <> 0 then raise exception 'ECHEC 15 : la suppression du cabinet laisse ses mots derrière elle'; end if;

  raise exception 'REUSSITE : boutique fermée hors contrat et hors offre (onglet et vitrine), audio du voisin refusé, mot programmé modifiable et annulable avant l''heure, figé après ; orpheline et suppression du cabinet non gênées. (Rien ne persiste.)';
end $$;
