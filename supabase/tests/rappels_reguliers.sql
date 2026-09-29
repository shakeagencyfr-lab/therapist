-- 0055 éprouvée contre la vraie base : la discrétion sur l'écran verrouillé,
-- le rappel du soir, les rappels qui reviennent.
--
-- Le bloc fabrique deux cabinets, deux thérapeutes, cinq fiches, puis ANNULE
-- tout par l'exception finale — rien ne subsiste, même en cas de réussite.
-- L'annulation couvre aussi pg_net : ses requêtes ne partent qu'à la
-- validation, qui n'a jamais lieu. Aucun appel ne sort d'ici vers le serveur.
--
-- L'heure des rappels éprouvés est « il y a dix minutes, à Paris » : assez
-- tôt pour être due, assez tard pour ne pas être expirée.
do $$
declare
  v_rev uuid; v_cab uuid; v_cab2 uuid; v_plan text;
  v_ther uuid := gen_random_uuid(); v_ther2 uuid := gen_random_uuid();
  v_ua uuid := gen_random_uuid(); v_ub uuid := gen_random_uuid();
  v_uc uuid := gen_random_uuid(); v_ue uuid := gen_random_uuid();
  -- Anna, Bea : suivies ; Cleo : suivi clos ; Dan : autre cabinet ; Eve : close après coup.
  v_fa uuid; v_fb uuid; v_fc uuid; v_fd uuid; v_fe uuid;
  v_quotidien uuid; v_hebdo uuid; v_autre_jour uuid; v_fini uuid; v_arrete uuid; v_tardif uuid; v_ailleurs uuid;
  v_push uuid; v_push_hebdo uuid;
  v_jour date; v_heure time; v_hh text; v_isodow int;
  v_n int; v_t text; v_c text; v_m boolean; v_b boolean; v_j date; v_s text;
  v_p256 text := repeat('B', 87);
  v_auth text := repeat('a', 22);
begin
  select id into v_rev from public.resellers order by created_at limit 1;
  if v_rev is null then raise exception 'RIEN À ÉPROUVER : aucun revendeur en base'; end if;
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;

  v_jour := ((now() - interval '10 minutes') at time zone 'Europe/Paris')::date;
  v_heure := date_trunc('minute', (now() - interval '10 minutes') at time zone 'Europe/Paris')::time;
  v_hh := to_char(v_heure, 'HH24:MI');
  v_isodow := extract(isodow from v_jour)::int;

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Cabinet rappels réguliers', 'cab-rappels-reg-t', 'x') returning id into v_cab;
  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Autre cabinet', 'cab-rappels-reg2-t', 'x') returning id into v_cab2;
  insert into public.subscriptions (cabinet_id, plan_code, status)
  values (v_cab, v_plan, 'actif'), (v_cab2, v_plan, 'actif');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values
    (v_ther, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'therapeute-rappels-reg@exemple.test', '', now(), now(), now()),
    (v_ther2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'therapeute2-rappels-reg@exemple.test', '', now(), now(), now()),
    (v_ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'anna-rappels-reg@exemple.test', '', now(), now(), now()),
    (v_ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'bea-rappels-reg@exemple.test', '', now(), now(), now()),
    (v_uc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'cleo-rappels-reg@exemple.test', '', now(), now(), now()),
    (v_ue, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'eve-rappels-reg@exemple.test', '', now(), now(), now());

  insert into public.cabinet_members (cabinet_id, user_id, display_name)
  values (v_cab, v_ther, 'Thérapeute'), (v_cab2, v_ther2, 'Autre thérapeute');

  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, v_ua, 'Anna', 'A', 'p', 's', 'w', 'l', 'Votre sommeil, de 0 à 10 ?', 'anna-rappels-reg@exemple.test')
  returning id into v_fa;
  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, v_ub, 'Bea', 'B', 'p', 's', 'w', 'l', 'Vos crises de panique aujourd''hui ?', 'bea-rappels-reg@exemple.test')
  returning id into v_fb;
  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email, archived_at)
  values (v_cab, v_uc, 'Cleo', 'C', 'p', 's', 'w', 'l', 'q', 'cleo-rappels-reg@exemple.test', now() - interval '3 days')
  returning id into v_fc;
  insert into public.patients (cabinet_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question)
  values (v_cab2, 'Dan', 'D', 'p', 's', 'w', 'l', 'q')
  returning id into v_fd;
  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, v_ue, 'Eve', 'E', 'p', 's', 'w', 'l', 'q', 'eve-rappels-reg@exemple.test')
  returning id into v_fe;

  -- Un téléphone chacune (le déclencheur de rangement pose le cabinet).
  insert into public.push_subscriptions (patient_id, cabinet_id, user_id, endpoint, p256dh, auth)
  values
    (v_fa, v_cab, v_ua, 'https://fcm.googleapis.com/fcm/send/epreuve-reg-a', v_p256, v_auth),
    (v_fb, v_cab, v_ub, 'https://fcm.googleapis.com/fcm/send/epreuve-reg-b', v_p256, v_auth),
    (v_fc, v_cab, v_uc, 'https://fcm.googleapis.com/fcm/send/epreuve-reg-c', v_p256, v_auth),
    (v_fe, v_cab, v_ue, 'https://fcm.googleapis.com/fcm/send/epreuve-reg-e', v_p256, v_auth);

  -- Un rappel d'un autre cabinet, pour éprouver les frontières.
  insert into public.rappels_recurrents (cabinet_id, title, body, heure, fin_le)
  values (v_cab2, 'Ailleurs', 'Un autre cabinet.', v_heure, v_jour + 3)
  returning id into v_ailleurs;

  -- ══ LES RAPPELS QUI REVIENNENT ═════════════════════════════════════════
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ther::text, 'role', 'authenticated')::text, true);

  v_quotidien := public.cabinet_programmer_rappel(
    v_cab, 'Respiration', 'Trois respirations lentes avant de dormir.', null, v_hh, v_jour + 7,
    array[v_fa, v_fb, v_fe]);
  v_hebdo := public.cabinet_programmer_rappel(
    v_cab, 'Chaque semaine', 'Relisez votre carnet.', v_isodow::smallint, v_hh, v_jour + 14, array[v_fa]);
  v_autre_jour := public.cabinet_programmer_rappel(
    v_cab, 'Un autre jour', 'Pas aujourd''hui.', ((v_isodow % 7) + 1)::smallint, v_hh, v_jour + 14, array[v_fa]);
  v_fini := public.cabinet_programmer_rappel(
    v_cab, 'Fini', 'Terminé hier.', null, v_hh, v_jour + 1, array[v_fa]);
  v_arrete := public.cabinet_programmer_rappel(
    v_cab, 'Arrêté', 'Arrêté avant l''heure.', null, v_hh, v_jour + 7, array[v_fa]);
  v_tardif := public.cabinet_programmer_rappel(
    v_cab, 'Tardif', 'Programmé après l''heure du jour.', null, v_hh, v_jour + 7, array[v_fa]);

  -- 1. Les destinataires s'écrivent avec le rappel, rangés dans le cabinet de la fiche.
  select count(*) into v_n from public.rappels_recurrents_patients where rappel_id = v_quotidien and cabinet_id = v_cab;
  if v_n <> 3 then raise exception 'ECHEC 1 : % destinataires enregistrés au lieu de 3', v_n; end if;

  -- 2. Arrêter : une fois, pas deux.
  if not public.cabinet_arreter_rappel(v_arrete) then raise exception 'ECHEC 2 : la thérapeute ne peut pas arrêter son rappel'; end if;
  if public.cabinet_arreter_rappel(v_arrete) then raise exception 'ECHEC 2b : un rappel déjà arrêté se dit arrêté une seconde fois'; end if;

  -- 3. Les refus, dits : suivi clos, autre cabinet, fin passée, plus d'un an, mot vide, heure illisible.
  begin
    perform public.cabinet_programmer_rappel(v_cab, 't', 'x', null, v_hh, v_jour + 3, array[v_fc]);
    raise exception 'ECHEC 3 : un rappel se programme pour un suivi clos';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cabinet_programmer_rappel(v_cab, 't', 'x', null, v_hh, v_jour + 3, array[v_fa, v_fd]);
    raise exception 'ECHEC 3b : un rappel se programme pour la fiche d''un autre cabinet';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cabinet_programmer_rappel(v_cab2, 't', 'x', null, v_hh, v_jour + 3, array[v_fd]);
    raise exception 'ECHEC 3c : une thérapeute programme dans un cabinet qui n''est pas le sien';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cabinet_programmer_rappel(v_cab, 't', 'x', null, v_hh, (now() at time zone 'Europe/Paris')::date - 1, array[v_fa]);
    raise exception 'ECHEC 3d : une date de fin passée est acceptée';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cabinet_programmer_rappel(v_cab, 't', 'x', null, v_hh, v_jour + 400, array[v_fa]);
    raise exception 'ECHEC 3e : un rappel de plus d''un an est accepté';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cabinet_programmer_rappel(v_cab, 't', '   ', null, v_hh, v_jour + 3, array[v_fa]);
    raise exception 'ECHEC 3f : un rappel sans texte est accepté';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cabinet_programmer_rappel(v_cab, 't', 'x', null, '25:00', v_jour + 3, array[v_fa]);
    raise exception 'ECHEC 3g : une heure illisible est acceptée';
  exception when invalid_parameter_value then null;
  end;

  -- 4. Rien ne s'écrit à la main : ni rappel, ni arrêt détourné.
  begin
    insert into public.rappels_recurrents (cabinet_id, title, body, heure, fin_le)
    values (v_cab, 't', 'x', v_heure, v_jour + 3);
    raise exception 'ECHEC 4 : un rappel s''écrit sans passer par cabinet_programmer_rappel()';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.rappels_recurrents set fin_le = v_jour + 300 where id = v_quotidien;
    raise exception 'ECHEC 4b : un rappel se modifie directement';
  exception when insufficient_privilege then null;
  end;

  -- 5. Un mot ne se rattache pas au rappel d'un autre cabinet.
  begin
    insert into public.push_notifications (cabinet_id, title, body, scheduled_for, rappel_recurrent_id, occurrence)
    values (v_cab, 'x', 'x', 'x', v_ailleurs, v_jour);
    raise exception 'ECHEC 5 : un mot occupe le jour d''un rappel d''un autre cabinet';
  exception when check_violation then null;
  end;

  -- 6. La thérapeute ne voit pas les rappels de l'autre cabinet.
  select count(*) into v_n from public.rappels_recurrents where id = v_ailleurs;
  if v_n <> 0 then raise exception 'ECHEC 6 : la thérapeute lit les rappels d''un autre cabinet'; end if;

  -- 7. La personne suivie ne lit pas la planification.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ua::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.rappels_recurrents;
  if v_n <> 0 then raise exception 'ECHEC 7 : une patiente lit % rappels récurrents du cabinet', v_n; end if;
  select count(*) into v_n from public.rappels_recurrents_patients;
  if v_n <> 0 then raise exception 'ECHEC 7b : une patiente lit les destinataires des rappels'; end if;
  if public.cabinet_arreter_rappel(v_quotidien) then raise exception 'ECHEC 7c : une patiente arrête un rappel du cabinet'; end if;

  -- 8. Écrire les mots du jour est l'affaire du passage de la minute seul.
  begin
    perform public.generer_rappels_recurrents();
    raise exception 'ECHEC 8 : une patiente déclenche l''écriture des rappels';
  exception when insufficient_privilege then null;
  end;

  -- ── Le passage de la minute ────────────────────────────────────────────
  set local role postgres;
  -- Les rappels ont été programmés hier ; « Tardif » l'est à l'instant, après l'heure du jour.
  update public.rappels_recurrents set created_at = now() - interval '1 day'
   where cabinet_id = v_cab and id <> v_tardif;
  -- « Fini » s'est terminé hier.
  update public.rappels_recurrents set fin_le = v_jour - 1 where id = v_fini;
  -- Eve clôt son suivi après avoir été choisie.
  update public.patients set archived_at = now() where id = v_fe;

  v_n := public.generer_rappels_recurrents();
  if v_n <> 2 then raise exception 'ECHEC 9 : % mots du jour écrits au lieu de 2 (quotidien, hebdomadaire)', v_n; end if;

  select id into v_push from public.push_notifications where rappel_recurrent_id = v_quotidien and occurrence = v_jour;
  if v_push is null then raise exception 'ECHEC 10 : le rappel quotidien n''a pas écrit son mot du jour'; end if;
  select count(*) into v_n from public.push_notifications
   where id = v_push and scheduled_at = ((v_jour + v_heure) at time zone 'Europe/Paris') and title = 'Respiration';
  if v_n <> 1 then raise exception 'ECHEC 10b : le mot du jour n''est pas daté de l''heure du rappel'; end if;

  -- 11. RIEN POUR UN SUIVI CLOS : Eve, choisie puis close, ne reçoit rien.
  select count(*) into v_n from public.push_recipients where push_id = v_push;
  if v_n <> 2 then raise exception 'ECHEC 11 : % destinataires au lieu d''Anna et Bea', v_n; end if;
  select count(*) into v_n from public.push_recipients where push_id = v_push and patient_id = v_fe;
  if v_n <> 0 then raise exception 'ECHEC 11b : un suivi clos reçoit encore le rappel'; end if;

  select id into v_push_hebdo from public.push_notifications where rappel_recurrent_id = v_hebdo and occurrence = v_jour;
  if v_push_hebdo is null then raise exception 'ECHEC 12 : le rappel hebdomadaire n''est pas parti le bon jour'; end if;

  -- 13. Rien pour un autre jour de la semaine, après la date de fin, une
  --     fois arrêté, ni pour une heure passée avant la programmation.
  select count(*) into v_n from public.push_notifications
   where rappel_recurrent_id in (v_autre_jour, v_fini, v_arrete, v_tardif);
  if v_n <> 0 then raise exception 'ECHEC 13 : % mots écrits pour des rappels qui ne devaient pas partir', v_n; end if;

  -- 14. PAS DE DOUBLON : un second passage, puis le passage complet, n'écrivent rien de plus.
  v_n := public.generer_rappels_recurrents();
  if v_n <> 0 then raise exception 'ECHEC 14 : un second passage écrit % mots de plus', v_n; end if;
  perform public.declencher_rappels();
  select count(*) into v_n from public.push_notifications where rappel_recurrent_id in (v_quotidien, v_hebdo);
  if v_n <> 2 then raise exception 'ECHEC 14b : % mots du jour après le passage complet au lieu de 2', v_n; end if;
  begin
    insert into public.push_notifications (cabinet_id, title, body, scheduled_for, rappel_recurrent_id, occurrence)
    values (v_cab, 'x', 'x', 'x', v_quotidien, v_jour);
    raise exception 'ECHEC 14c : un second mot du même jour s''écrit pour le même rappel';
  exception when unique_violation then null;
  end;

  -- ── Dans l'espace, le rappel ne s'empile pas ───────────────────────────
  -- Le mot de la veille du rappel quotidien, déjà là.
  insert into public.push_notifications (cabinet_id, title, body, scheduled_for, scheduled_at, rappel_recurrent_id, occurrence)
  values (v_cab, 'Respiration', 'Hier.', 'x', ((v_jour - 1 + v_heure) at time zone 'Europe/Paris'), v_quotidien, v_jour - 1)
  returning id into v_c;
  insert into public.push_recipients (push_id, patient_id, cabinet_id) values (v_c::uuid, v_fa, v_cab);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ua::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.patient_mots(v_fa, 20);
  if v_n <> 2 then raise exception 'ECHEC 15 : % mots dans l''espace d''Anna au lieu de 2 (un par rappel)', v_n; end if;
  select count(*) into v_n from public.patient_mots(v_fa, 20) where push_id = v_push;
  if v_n <> 1 then raise exception 'ECHEC 15b : l''espace ne montre pas le DERNIER envoi du rappel quotidien'; end if;

  -- ══ LA DISCRÉTION ═══════════════════════════════════════════════════════
  -- Anna choisit d'afficher le contenu ; Bea n'a rien réglé.
  select masquer_contenu into v_b from public.patient_preferences_rappels(v_fa);
  if v_b is distinct from true then raise exception 'ECHEC 16 : sans réglage, le contenu n''est pas masqué par défaut'; end if;
  select masquer_contenu into v_b from public.patient_regler_rappels(v_fa, false, null, null);
  if v_b is distinct from false then raise exception 'ECHEC 16b : Anna ne peut pas afficher le contenu de ses rappels'; end if;

  -- 17. Réglages de la fiche d'une autre : refusés, en lecture comme en écriture.
  begin
    perform public.patient_regler_rappels(v_fb, false, null, null);
    raise exception 'ECHEC 17 : Anna règle les rappels de Bea';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_n from public.patient_preferences_rappels(v_fb);
  if v_n <> 0 then raise exception 'ECHEC 17b : Anna lit les réglages de Bea'; end if;

  -- 18. La table ne se lit pas directement, même pour ses propres lignes.
  begin
    perform 1 from public.preferences_rappels;
    raise exception 'ECHEC 18 : la table des réglages se lit sans passer par sa fonction';
  exception when insufficient_privilege then null;
  end;

  -- 19. Le cabinet ne lit pas les réglages de ses patientes.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ther::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.patient_preferences_rappels(v_fa);
  if v_n <> 0 then raise exception 'ECHEC 19 : la thérapeute lit les réglages de rappel d''Anna'; end if;
  begin
    perform public.patient_regler_rappels(v_fa, true, null, null);
    raise exception 'ECHEC 19b : la thérapeute change la discrétion choisie par Anna';
  exception when insufficient_privilege then null;
  end;

  -- 20. LE CONTENU MASQUÉ NE QUITTE PAS LA BASE.
  set local role service_role;
  select titre, corps, masque into v_t, v_c, v_m from public.rappels_a_pousser(500)
   where push_id = v_push and patient_id = v_fb;
  if v_m is distinct from true then raise exception 'ECHEC 20 : le rappel de Bea n''est pas masqué (défaut)'; end if;
  if v_t <> 'Un nouveau mot dans votre espace' or v_c <> 'Il se lit en ouvrant votre espace.' then
    raise exception 'ECHEC 20b : le rappel masqué ne porte pas le texte neutre (% / %)', v_t, v_c;
  end if;
  if v_t || v_c ~* 'respiration' then raise exception 'ECHEC 20c : le contenu masqué sort de la base'; end if;

  -- 21. Et Anna, qui a choisi de le lire, le lit.
  select titre, corps, masque into v_t, v_c, v_m from public.rappels_a_pousser(500)
   where push_id = v_push and patient_id = v_fa;
  -- Déjà réclamé par l'appel précédent (lot de 500) : on relit la ligne réclamée.
  if v_t is null then
    set local role postgres;
    update public.push_recipients set push_claimed_at = null where push_id = v_push and patient_id = v_fa;
    set local role service_role;
    select titre, corps, masque into v_t, v_c, v_m from public.rappels_a_pousser(500)
     where push_id = v_push and patient_id = v_fa;
  end if;
  if v_m is distinct from false or v_t <> 'Respiration' or v_c <> 'Trois respirations lentes avant de dormir.' then
    raise exception 'ECHEC 21 : Anna ne reçoit pas le contenu qu''elle a choisi d''afficher (% / % / %)', v_m, v_t, v_c;
  end if;

  -- ══ LE RAPPEL DU SOIR ═══════════════════════════════════════════════════
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ua::text, 'role', 'authenticated')::text, true);
  select soir_actif, soir_heure, masquer_contenu into v_b, v_t, v_m
    from public.patient_regler_rappels(v_fa, null, true, v_hh);
  if v_b is distinct from true or v_t <> v_hh then raise exception 'ECHEC 22 : le rappel du soir ne s''active pas à l''heure choisie'; end if;
  if v_m is distinct from false then raise exception 'ECHEC 22b : régler le soir a changé la discrétion'; end if;
  begin
    perform public.patient_regler_rappels(v_fa, null, null, '25:00');
    raise exception 'ECHEC 22c : une heure illisible est acceptée';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform * from public.rappels_du_soir_a_pousser(10);
    raise exception 'ECHEC 22d : une patiente réclame les rappels du soir';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ub::text, 'role', 'authenticated')::text, true);
  perform public.patient_regler_rappels(v_fb, null, true, v_hh);

  -- 23. Réglé À L'INSTANT pour une heure déjà passée : rien ce soir.
  set local role service_role;
  select count(*) into v_n from public.rappels_du_soir_a_pousser(500) where patient_id in (v_fa, v_fb);
  if v_n <> 0 then raise exception 'ECHEC 23 : un rappel du soir sonne pour une heure passée avant son réglage'; end if;

  -- Réglés hier. Cleo, suivi clos, l'avait réglé aussi.
  set local role postgres;
  update public.preferences_rappels set soir_regle_le = now() - interval '1 day' where patient_id in (v_fa, v_fb);
  insert into public.preferences_rappels (patient_id, soir_actif, soir_heure, soir_regle_le)
  values (v_fc, true, v_heure, now() - interval '1 day');

  -- 24. Anna et Bea sont dues ; Cleo, suivi clos, non.
  set local role service_role;
  select count(*) into v_n from public.rappels_du_soir_a_pousser(500) where patient_id in (v_fa, v_fb, v_fc);
  if v_n <> 2 then
    -- Relu sans réclamer, pour dire lequel manque.
    set local role postgres;
    select string_agg(patient_id::text, ', ') into v_s from public.soirs_dus();
    raise exception 'ECHEC 24 : % rappels du soir réclamés au lieu de 2 (dus : %)', v_n, coalesce(v_s, 'aucun');
  end if;

  -- 25. Réclamés, ils ne se reprennent pas aussitôt.
  select count(*) into v_n from public.rappels_du_soir_a_pousser(500) where patient_id in (v_fa, v_fb);
  if v_n <> 0 then raise exception 'ECHEC 25 : le même rappel du soir est réclamé deux fois'; end if;

  -- 26. Le texte : la question du soir pour Anna, rien de la sienne pour Bea.
  set local role postgres;
  update public.preferences_rappels set soir_reclame_le = null where patient_id in (v_fa, v_fb);
  set local role service_role;
  select titre, corps, masque, jour into v_t, v_c, v_m, v_j
    from public.rappels_du_soir_a_pousser(500) where patient_id = v_fa;
  if v_m is distinct from false or v_t <> 'Votre note du soir' or v_c <> 'Votre sommeil, de 0 à 10 ?' or v_j <> v_jour then
    raise exception 'ECHEC 26 : le rappel du soir d''Anna ne porte pas sa question (% / % / % / %)', v_m, v_t, v_c, v_j;
  end if;
  select titre, corps, masque into v_t, v_c, v_m
    from public.rappels_du_soir_a_pousser(500) where patient_id = v_fb;
  if v_m is distinct from true or v_t <> 'Un rappel de votre espace' or v_c ~* 'panique' then
    raise exception 'ECHEC 26b : le rappel du soir de Bea laisse paraître sa question (% / %)', v_t, v_c;
  end if;

  -- 27. UN SEUL PAR SOIR : le serveur note le jour traité, plus rien ne part ce soir-là.
  update public.preferences_rappels
     set soir_envoye_le = v_jour, soir_statut = 'envoyee', soir_reclame_le = null
   where patient_id in (v_fa, v_fb);
  select count(*) into v_n from public.rappels_du_soir_a_pousser(500) where patient_id in (v_fa, v_fb);
  if v_n <> 0 then raise exception 'ECHEC 27 : un second rappel du soir part le même soir'; end if;

  -- 28. Note déjà prise : pas de rappel. Sans téléphone : pas de réveil du serveur.
  set local role postgres;
  update public.preferences_rappels set soir_envoye_le = null where patient_id in (v_fa, v_fb);
  insert into public.scale_entries (cabinet_id, patient_id, value, recorded_at)
  values (v_cab, v_fb, 6, ((v_jour + v_heure) at time zone 'Europe/Paris') - interval '1 hour');
  delete from public.push_subscriptions where patient_id = v_fa;
  select count(*) into v_n from public.soirs_dus() where patient_id in (v_fa, v_fb);
  if v_n <> 0 then raise exception 'ECHEC 28 : % rappels du soir dus malgré la note prise ou l''absence de téléphone', v_n; end if;

  -- 29. Un statut inconnu n'entre pas.
  begin
    update public.preferences_rappels set soir_statut = 'peut-etre' where patient_id = v_fa;
    raise exception 'ECHEC 29 : un statut du soir inventé a été accepté';
  exception when check_violation then null;
  end;

  raise exception 'REUSSITE : contenu masqué par défaut et jamais sorti de la base, rappel du soir unique et à l''heure choisie, rappels récurrents sans doublon, rien après la date de fin ni pour un suivi clos, planification cloisonnée par cabinet';
end $$;
