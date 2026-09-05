-- 0036 éprouvée contre la vraie base : rien avant l'heure dite.
--
-- Le bloc fabrique un cabinet, un compte et une notification programmée, puis
-- ANNULE tout par l'exception finale — rien ne subsiste, même en cas de
-- réussite. Le cabinet reçoit un abonnement actif : depuis 0035, une fiche ne
-- s'ouvre pas dans un cabinet sans contrat.
do $$
declare
  v_rev uuid; v_cab uuid; v_uid uuid := gen_random_uuid();
  v_fiche uuid; v_push uuid; v_n int; v_plan text;
begin
  select id into v_rev from public.resellers limit 1;
  if v_rev is null then raise exception 'RIEN À ÉPROUVER : aucun revendeur en base'; end if;
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Cabinet horaire', 'cab-horaire-t', 'x') returning id into v_cab;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'patiente-horaire@exemple.test', '', now(), now(), now());

  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, v_uid, 'Nadia', 'N', 'p', 's', 'w', 'l', 'q', 'patiente-horaire@exemple.test')
  returning id into v_fiche;

  insert into public.push_notifications (cabinet_id, title, body, scheduled_for, scheduled_at)
  values (v_cab, 'Ce soir', 'Pensez à votre audio.', 'Ce soir, 20 h', now() + interval '6 hours')
  returning id into v_push;
  insert into public.push_recipients (push_id, patient_id, cabinet_id)
  values (v_push, v_fiche, v_cab);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  -- 1 et 2. Avant l'heure, ni la ligne d'adressage ni le texte. Les deux, car
  --         l'une sans l'autre laisserait lire le message par l'autre porte.
  select count(*) into v_n from public.push_recipients where push_id = v_push;
  if v_n <> 0 then raise exception 'ECHEC 1 : la patiente voit une notification programmée pour ce soir'; end if;
  select count(*) into v_n from public.push_notifications where id = v_push;
  if v_n <> 0 then raise exception 'ECHEC 2 : elle lit le texte d''une notification pas encore due'; end if;

  -- 3. Et l'on n'accuse pas réception de ce qui n'est pas arrivé.
  perform public.patient_marquer_lue(v_push);
  set local role postgres;
  select count(*) into v_n from public.push_recipients where push_id = v_push and read_at is not null;
  if v_n <> 0 then raise exception 'ECHEC 3 : une notification pas encore due a été marquée lue'; end if;

  update public.push_notifications set scheduled_at = now() - interval '1 minute' where id = v_push;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  -- 4, 5 et 6. L'heure passée, tout s'ouvre — et se marque lu.
  select count(*) into v_n from public.push_recipients where push_id = v_push;
  if v_n <> 1 then raise exception 'ECHEC 4 : l''heure passée, la notification reste invisible'; end if;
  select count(*) into v_n from public.push_notifications where id = v_push;
  if v_n <> 1 then raise exception 'ECHEC 5 : le texte reste illisible après l''heure'; end if;
  perform public.patient_marquer_lue(v_push);

  set local role postgres;
  select count(*) into v_n from public.push_recipients where push_id = v_push and read_at is not null;
  if v_n <> 1 then raise exception 'ECHEC 6 : la notification due ne se marque pas lue'; end if;

  raise exception 'REUSSITE : rien avant l''heure, tout après, et la lecture suit';
end $$;
