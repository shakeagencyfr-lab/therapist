-- 0062 éprouvée contre la vraie base : un rappel ne part que vers le compte
-- qui tient la fiche, et seulement tant que le cabinet est ouvert.
--
-- Le bloc fabrique un cabinet, une thérapeute, deux fiches, puis ANNULE tout
-- par l'exception finale — rien ne subsiste, même en cas de réussite. Les
-- fonctions éprouvées (rappels_a_pousser, generer_rappels_recurrents)
-- parcourent toute la base : ce qu'elles réclament ou écrivent ailleurs est
-- annulé avec le reste, et l'on ne compte ici que nos fiches.
do $$
declare
  v_rev uuid; v_cab uuid; v_plan text;
  v_ther uuid := gen_random_uuid();
  v_ua uuid := gen_random_uuid(); v_ua2 uuid := gen_random_uuid(); v_ub uuid := gen_random_uuid();
  v_fa uuid; v_fb uuid; v_push uuid; v_rec uuid;
  v_jour date; v_heure time; v_n int;
  v_p256 text := repeat('B', 87);
  v_auth text := repeat('a', 22);
begin
  select id into v_rev from public.resellers order by created_at limit 1;
  if v_rev is null then raise exception 'RIEN À ÉPROUVER : aucun revendeur en base'; end if;
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;

  v_jour := ((now() - interval '10 minutes') at time zone 'Europe/Paris')::date;
  v_heure := date_trunc('minute', (now() - interval '10 minutes') at time zone 'Europe/Paris')::time;

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Cabinet rappels et comptes', 'cab-rappels-compte-t', 'x') returning id into v_cab;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values
    (v_ther, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'therapeute-rappels-compte@exemple.test', '', now(), now(), now()),
    (v_ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'anna-rappels-compte@exemple.test', '', now(), now(), now()),
    (v_ua2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'anna2-rappels-compte@exemple.test', '', now(), now(), now()),
    (v_ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'bea-rappels-compte@exemple.test', '', now(), now(), now());

  insert into public.cabinet_members (cabinet_id, user_id, display_name) values (v_cab, v_ther, 'Thérapeute');

  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, v_ua, 'Anna', 'A', 'p', 's', 'w', 'l', 'q', 'anna-rappels-compte@exemple.test')
  returning id into v_fa;
  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, v_ub, 'Bea', 'B', 'p', 's', 'w', 'l', 'q', 'bea-rappels-compte@exemple.test')
  returning id into v_fb;

  insert into public.push_subscriptions (patient_id, cabinet_id, user_id, endpoint, p256dh, auth)
  values
    (v_fa, v_cab, v_ua, 'https://fcm.googleapis.com/fcm/send/epreuve-compte-a', v_p256, v_auth),
    (v_fb, v_cab, v_ub, 'https://fcm.googleapis.com/fcm/send/epreuve-compte-b', v_p256, v_auth);

  -- Anna et Bea ont réglé hier un rappel du soir à l'heure d'il y a dix minutes.
  insert into public.preferences_rappels (patient_id, masquer_contenu, soir_actif, soir_heure, soir_regle_le)
  values (v_fa, false, true, v_heure, now() - interval '1 day'),
         (v_fb, false, true, v_heure, now() - interval '1 day');

  select count(*) into v_n from public.soirs_dus() where patient_id in (v_fa, v_fb);
  if v_n <> 2 then raise exception 'ECHEC 0 : % rappels du soir dus au lieu de 2 avant l''épreuve', v_n; end if;

  -- ══ LA FICHE QUITTE SON COMPTE ═════════════════════════════════════════

  -- 1. Le cabinet détache Anna : ses téléphones et ses réglages partent.
  update public.patients set auth_user_id = null where id = v_fa;
  select count(*) into v_n from public.push_subscriptions where patient_id = v_fa;
  if v_n <> 0 then raise exception 'ECHEC 1 : % téléphones de l''ancien compte restent sous la fiche détachée', v_n; end if;
  select count(*) into v_n from public.preferences_rappels where patient_id = v_fa;
  if v_n <> 0 then raise exception 'ECHEC 1b : les réglages de l''ancien compte restent sur la fiche'; end if;

  -- 2. Bea n'a rien perdu.
  select count(*) into v_n from public.push_subscriptions where patient_id = v_fb;
  if v_n <> 1 then raise exception 'ECHEC 2 : la fiche voisine a perdu son téléphone'; end if;
  select count(*) into v_n from public.soirs_dus() where patient_id = v_fb;
  if v_n <> 1 then raise exception 'ECHEC 2b : le rappel du soir de la fiche voisine n''est plus dû'; end if;

  -- 3. Un nouveau compte s'y rattache et inscrit son téléphone ; la fiche
  --    passe ensuite à un troisième : seul le téléphone du compte partant part.
  update public.patients set auth_user_id = v_ua2 where id = v_fa;
  insert into public.push_subscriptions (patient_id, cabinet_id, user_id, endpoint, p256dh, auth)
  values (v_fa, v_cab, v_ua2, 'https://fcm.googleapis.com/fcm/send/epreuve-compte-a2', v_p256, v_auth);
  update public.patients set auth_user_id = v_ua where id = v_fa;
  select count(*) into v_n from public.push_subscriptions where patient_id = v_fa;
  if v_n <> 0 then raise exception 'ECHEC 3 : le téléphone du compte partant reste (% trouvés)', v_n; end if;

  -- 4. Réenregistrer la fiche sans toucher au compte n'efface rien.
  insert into public.push_subscriptions (patient_id, cabinet_id, user_id, endpoint, p256dh, auth)
  values (v_fa, v_cab, v_ua, 'https://fcm.googleapis.com/fcm/send/epreuve-compte-a3', v_p256, v_auth);
  update public.patients set auth_user_id = v_ua, display_name = 'Anna R.' where id = v_fa;
  select count(*) into v_n from public.push_subscriptions where patient_id = v_fa;
  if v_n <> 1 then raise exception 'ECHEC 4 : un réenregistrement sans changement de compte efface le téléphone'; end if;

  -- 5. Le compte effacé (la clé étrangère vide la fiche) : ses téléphones partent aussi.
  insert into public.preferences_rappels (patient_id, soir_actif, soir_heure, soir_regle_le)
  values (v_fa, true, v_heure, now() - interval '1 day');
  delete from auth.users where id = v_ua;
  select count(*) into v_n from public.preferences_rappels where patient_id = v_fa;
  if v_n <> 0 then raise exception 'ECHEC 5 : les réglages d''un compte effacé restent sur la fiche'; end if;
  if exists (select 1 from public.patients where id = v_fa and auth_user_id is not null) then
    raise exception 'ECHEC 5b : la fiche garde un compte effacé';
  end if;

  -- 6. Un téléphone rangé sous la fiche au nom d'un autre compte ne compte
  --    pas pour le rappel du soir.
  update public.patients set auth_user_id = v_ua2 where id = v_fa;
  insert into public.preferences_rappels (patient_id, masquer_contenu, soir_actif, soir_heure, soir_regle_le)
  values (v_fa, false, true, v_heure, now() - interval '1 day');
  insert into public.push_subscriptions (patient_id, cabinet_id, user_id, endpoint, p256dh, auth)
  values (v_fa, v_cab, v_ub, 'https://fcm.googleapis.com/fcm/send/epreuve-compte-intrus', v_p256, v_auth);
  select count(*) into v_n from public.soirs_dus() where patient_id = v_fa;
  if v_n <> 0 then raise exception 'ECHEC 6 : le rappel du soir compte le téléphone d''un autre compte'; end if;

  -- ══ LE CABINET FERMÉ ═══════════════════════════════════════════════════

  -- Un mot dû il y a dix minutes pour Bea, un rappel quotidien à l'heure d'il y a dix minutes.
  insert into public.push_notifications (cabinet_id, title, body, scheduled_for, scheduled_at, created_by)
  values (v_cab, 'Ce soir', 'Respirez.', 'Aujourd''hui', now() - interval '10 minutes', v_ther)
  returning id into v_push;
  insert into public.push_recipients (push_id, patient_id, cabinet_id) values (v_push, v_fb, v_cab);

  insert into public.rappels_recurrents (cabinet_id, title, body, heure, fin_le, created_by, created_at)
  values (v_cab, 'Respiration', 'Trois respirations.', v_heure, v_jour + 3, v_ther, now() - interval '1 day')
  returning id into v_rec;
  insert into public.rappels_recurrents_patients (rappel_id, patient_id, cabinet_id) values (v_rec, v_fb, v_cab);

  update public.cabinets set archived_at = now() where id = v_cab;

  -- 7. Fermé : rien ne se réclame, aucun soir n'est dû, aucun récurrent ne s'écrit.
  select count(*) into v_n from public.rappels_a_pousser(500) where patient_id in (v_fa, v_fb);
  if v_n <> 0 then raise exception 'ECHEC 7 : % mots réclamés pour un cabinet fermé', v_n; end if;
  select count(*) into v_n from public.soirs_dus() where patient_id in (v_fa, v_fb);
  if v_n <> 0 then raise exception 'ECHEC 7b : un rappel du soir est dû dans un cabinet fermé'; end if;
  perform public.generer_rappels_recurrents();
  select count(*) into v_n from public.push_notifications where rappel_recurrent_id = v_rec;
  if v_n <> 0 then raise exception 'ECHEC 7c : un rappel récurrent s''écrit pour un cabinet fermé'; end if;

  -- 8. Rouvert : le mot encore dans sa fenêtre part, le soir et le récurrent reviennent.
  update public.cabinets set archived_at = null where id = v_cab;
  select count(*) into v_n from public.rappels_a_pousser(500) where patient_id = v_fb and push_id = v_push;
  if v_n <> 1 then raise exception 'ECHEC 8 : le mot d''un cabinet rouvert ne se réclame pas'; end if;
  select count(*) into v_n from public.soirs_dus() where patient_id = v_fb;
  if v_n <> 1 then raise exception 'ECHEC 8b : le rappel du soir ne revient pas à la réouverture'; end if;
  perform public.generer_rappels_recurrents();
  select count(*) into v_n from public.push_notifications where rappel_recurrent_id = v_rec;
  if v_n <> 1 then raise exception 'ECHEC 8c : % occurrences écrites à la réouverture au lieu d''une', v_n; end if;

  -- 9. Personne d'autre que le serveur ne déclenche ni ne lit ces fonctions.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ub::text, 'role', 'authenticated')::text, true);
  begin
    perform public.oublier_l_ancien_compte();
    raise exception 'ECHEC 9 : une patiente appelle la fonction du déclencheur';
  exception when insufficient_privilege or feature_not_supported then null;
  end;
  begin
    perform 1 from public.soirs_dus();
    raise exception 'ECHEC 9b : une patiente lit les rappels du soir dus';
  exception when insufficient_privilege then null;
  end;
  set local role postgres;

  raise exception 'REUSSITE : une fiche détachée ou passée à un autre compte perd les téléphones et les réglages de l''ancien, sans toucher aux voisines ; un cabinet fermé ne réclame, ne rappelle ni n''écrit plus rien, et retrouve ses rappels à la réouverture';
end $$;
