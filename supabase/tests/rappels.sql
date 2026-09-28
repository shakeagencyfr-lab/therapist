-- 0040 éprouvée contre la vraie base : les rappels sur le téléphone.
--
-- Le bloc fabrique un cabinet, une thérapeute, deux patientes et trois
-- rappels, puis ANNULE tout par l'exception finale — rien ne subsiste, même
-- en cas de réussite. L'annulation couvre aussi pg_net : ses requêtes ne
-- partent qu'à la validation de la transaction, et celle-ci n'est jamais
-- validée. Aucun appel ne peut donc sortir d'ici vers le serveur.
do $$
declare
  v_rev uuid; v_cab uuid; v_plan text;
  v_ther uuid := gen_random_uuid();
  v_ua uuid := gen_random_uuid(); v_ub uuid := gen_random_uuid();
  v_fa uuid; v_fb uuid;
  v_du uuid; v_futur uuid; v_vieux uuid;
  v_n int; v_s text; v_c uuid;
  -- Une vraie forme d'adresse Google, et des clés à la bonne longueur.
  v_ep text := 'https://fcm.googleapis.com/fcm/send/epreuve-klaro-0040';
  v_p256 text := repeat('B', 87);
  v_auth text := repeat('a', 22);
begin
  select id into v_rev from public.resellers limit 1;
  if v_rev is null then raise exception 'RIEN À ÉPROUVER : aucun revendeur en base'; end if;
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Cabinet rappels', 'cab-rappels-t', 'x') returning id into v_cab;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values
    (v_ther, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'therapeute-rappels@exemple.test', '', now(), now(), now()),
    (v_ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'patiente-a-rappels@exemple.test', '', now(), now(), now()),
    (v_ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'patiente-b-rappels@exemple.test', '', now(), now(), now());

  insert into public.cabinet_members (cabinet_id, user_id, display_name) values (v_cab, v_ther, 'Thérapeute');

  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, v_ua, 'Anna', 'A', 'p', 's', 'w', 'l', 'q', 'patiente-a-rappels@exemple.test')
  returning id into v_fa;
  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, v_ub, 'Bea', 'B', 'p', 's', 'w', 'l', 'q', 'patiente-b-rappels@exemple.test')
  returning id into v_fb;

  -- ── Anna inscrit son téléphone ─────────────────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ua::text, 'role', 'authenticated')::text, true);

  -- 1. L'inscription passe, et le cabinet vient de la fiche, pas de l'appel.
  perform public.enregistrer_appareil(v_fa, v_ep, v_p256, v_auth, '/cab-rappels-t/mon', 'epreuve');
  select count(*) into v_n from public.push_subscriptions where endpoint = v_ep;
  if v_n <> 1 then raise exception 'ECHEC 1 : Anna ne voit pas le téléphone qu''elle vient d''inscrire'; end if;

  -- 2. Pas d'inscription directe : la table n'accepte rien du navigateur.
  begin
    insert into public.push_subscriptions (patient_id, cabinet_id, user_id, endpoint, p256dh, auth)
    values (v_fa, v_cab, v_ua, 'https://fcm.googleapis.com/fcm/send/direct', v_p256, v_auth);
    raise exception 'ECHEC 2 : un téléphone s''inscrit sans passer par enregistrer_appareil()';
  exception when insufficient_privilege then null;
  end;

  -- 3. Pas pour la fiche d'une autre.
  begin
    perform public.enregistrer_appareil(v_fb, 'https://fcm.googleapis.com/fcm/send/autre', v_p256, v_auth);
    raise exception 'ECHEC 3 : Anna inscrit un téléphone sur la fiche de Bea';
  exception when insufficient_privilege then null;
  end;

  -- 4. LE SERVEUR ÉCRIT À CETTE ADRESSE : hors des quatre services de
  --    notification, elle est refusée — sinon nous serions un relais.
  begin
    perform public.enregistrer_appareil(v_fa, 'https://interne.exemple.test/hook', v_p256, v_auth);
    raise exception 'ECHEC 4 : une adresse quelconque a été acceptée comme adresse d''envoi';
  exception when check_violation then null;
  end;

  -- 5. Le serveur seul réclame les envois.
  begin
    perform * from public.rappels_a_pousser(10);
    raise exception 'ECHEC 5 : une patiente peut réclamer les envois dus';
  exception when insufficient_privilege then null;
  end;

  -- ── Bea s'inscrit depuis le MÊME téléphone ─────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ub::text, 'role', 'authenticated')::text, true);
  perform public.enregistrer_appareil(v_fb, v_ep, v_p256, v_auth);

  set local role postgres;
  -- 6. Le téléphone a changé de mains : les rappels d'Anna n'y iront plus.
  select patient_id into v_c from public.push_subscriptions where endpoint = v_ep;
  if v_c is distinct from v_fb then
    raise exception 'ECHEC 6 : le téléphone partagé reste inscrit au nom de la patiente précédente';
  end if;
  select cabinet_id into v_c from public.push_subscriptions where endpoint = v_ep;
  if v_c is distinct from v_cab then raise exception 'ECHEC 6b : le cabinet n''a pas été posé d''après la fiche'; end if;

  -- ── La thérapeute ──────────────────────────────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ther::text, 'role', 'authenticated')::text, true);

  -- 7. Elle ne lit pas les adresses d'envoi : ce sont des capacités.
  select count(*) into v_n from public.push_subscriptions;
  if v_n <> 0 then raise exception 'ECHEC 7 : la thérapeute lit les adresses d''envoi de ses patientes'; end if;

  -- 8. Mais elle sait qui recevra le rappel sur son téléphone.
  select appareils into v_n from public.cabinet_appareils(v_cab) where patient_id = v_fb;
  if coalesce(v_n, 0) <> 1 then raise exception 'ECHEC 8 : la thérapeute ne voit pas que Bea a activé les rappels'; end if;
  select count(*) into v_n from public.cabinet_appareils(v_cab) where patient_id = v_fa;
  if v_n <> 0 then raise exception 'ECHEC 8b : Anna apparaît avec un téléphone qui n''est plus le sien'; end if;

  -- ── Les envois ─────────────────────────────────────────────────────────
  set local role postgres;
  insert into public.push_notifications (cabinet_id, title, body, scheduled_for, scheduled_at)
  values (v_cab, 'Maintenant', 'Respirez.', 'Maintenant', now() - interval '1 minute') returning id into v_du;
  insert into public.push_notifications (cabinet_id, title, body, scheduled_for, scheduled_at)
  values (v_cab, 'Ce soir', 'Audio du soir.', 'Ce soir', now() + interval '6 hours') returning id into v_futur;
  insert into public.push_notifications (cabinet_id, title, body, scheduled_for, scheduled_at)
  values (v_cab, 'Ce matin', 'Trop tard.', 'Ce matin', now() - interval '3 hours') returning id into v_vieux;
  insert into public.push_recipients (push_id, patient_id, cabinet_id)
  values (v_du, v_fb, v_cab), (v_futur, v_fb, v_cab), (v_vieux, v_fb, v_cab);

  -- 9. Le passage de la minute marque ce qui est trop tardif pour valoir un
  --    rappel. (Le secret du coffre est lu, mais pg_net ne part qu'à la
  --    validation — qui n'aura pas lieu.)
  perform public.declencher_rappels();
  select push_status into v_s from public.push_recipients where push_id = v_vieux;
  if v_s is distinct from 'expiree' then raise exception 'ECHEC 9 : un rappel de trois heures de retard n''est pas marqué expiré (%)', v_s; end if;

  -- 10. Le serveur réclame ce qui est dû — et seulement cela.
  set local role service_role;
  select count(*) into v_n from public.rappels_a_pousser(50) where push_id in (v_du, v_futur, v_vieux);
  if v_n <> 1 then raise exception 'ECHEC 10 : % envois réclamés au lieu du seul qui est dû', v_n; end if;

  -- 11. Un second passage, aussitôt, ne reprend pas ce que le premier tient.
  select count(*) into v_n from public.rappels_a_pousser(50) where push_id = v_du;
  if v_n <> 0 then raise exception 'ECHEC 11 : le même rappel est réclamé deux fois'; end if;

  -- 12. Le rappel programmé pour ce soir attend son heure.
  set local role postgres;
  select count(*) into v_n from public.push_recipients where push_id = v_futur and push_claimed_at is not null;
  if v_n <> 0 then raise exception 'ECHEC 12 : un rappel de ce soir a été réclamé dès maintenant'; end if;

  -- 13. Un statut inconnu n'entre pas.
  begin
    update public.push_recipients set push_status = 'peut-etre' where push_id = v_du;
    raise exception 'ECHEC 13 : un statut d''envoi inventé a été accepté';
  exception when check_violation then null;
  end;

  raise exception 'REUSSITE : inscription, changement de mains, adresses tenues secrètes, envois réclamés à l''heure et une seule fois';
end $$;
