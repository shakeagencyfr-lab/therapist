-- ============================================================================
-- Un suivi clos ferme la porte (migration 0044).
--
--   suivi en cours → le patient lit ses modules, audios, affirmations,
--                    journal et mots, et coche un module
--   suivi clos     → il ne lit plus rien, aucun de ses gestes ne passe, et
--                    le rappel programmé ne part pas
--   suivi rouvert  → tout lui revient, et le rappel part
--   un audio       → ne s'envoie ni ne se vend hors de son cabinet
--   le lundi       → la base ne réveille le serveur que s'il reste une fiche
--
-- Un seul bloc DO qui se termine par RAISE EXCEPTION 'REUSSITE …' : rien
-- ne persiste — pas même l'appel au serveur, que pg_net n'envoie qu'une fois
-- la transaction validée. Une FUITE ou un ECHEC lève avant, avec la raison.
--
--   psql "$DATABASE_URL" -f supabase/tests/droits_fiche_close.sql
-- ============================================================================

do $$
declare
  v_praticienne uuid := 'bbbb0000-0000-4000-8000-0000000044a1';
  v_compte      uuid := 'cccc0000-0000-4000-8000-0000000044c1';
  v_plan text; v_org uuid; v_cab uuid; v_voisin uuid;
  v_pat uuid; v_mod uuid; v_audio uuid; v_audio_voisin uuid; v_ecoute uuid; v_push uuid; v_produit uuid;
  v_secret boolean; v_file integer; v_autres integer;
  ctx jsonb; n integer; refuse boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
    (v_praticienne,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','test44-praticienne@exemple.fr','',now(),now(),now()),
    (v_compte,     '00000000-0000-0000-0000-000000000000','authenticated','authenticated','test44-patient@exemple.fr','',now(),now(),now());

  insert into public.resellers (name, slug) values ('Revendeur 0044', 'revendeur-0044') returning id into v_org;
  insert into public.cabinets (reseller_id, name, slug) values (v_org, 'Cabinet 0044', 'cabinet-0044') returning id into v_cab;
  insert into public.cabinets (reseller_id, name, slug) values (v_org, 'Cabinet voisin 0044', 'cabinet-voisin-0044') returning id into v_voisin;
  /* Depuis 0035, une fiche ne s'ouvre pas dans un cabinet sans contrat. */
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif'), (v_voisin, v_plan, 'actif');
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values (v_cab, v_praticienne, 'owner', 'Praticienne 0044');

  -- La fiche, et ce qu'elle porte.
  insert into public.patients (cabinet_id, auth_user_id, email, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, v_compte, 'test44-patient@exemple.fr', 'Test P.', 'TP', '', '', '', '', '')
  returning id into v_pat;
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position)
  values (v_cab, v_pat, 'Ancrage du matin', '', 'Exercice', 0) returning id into v_mod;
  insert into public.affirmations (cabinet_id, patient_id, text, position, published_at)
  values (v_cab, v_pat, 'Je respire à mon rythme.', 0, now());
  insert into public.journal_pages (cabinet_id, patient_id, title, body, shared)
  values (v_cab, v_pat, 'Lundi', 'Une page à moi.', false);
  insert into public.audio_library (cabinet_id, title, duration_seconds, storage_path)
  values (v_cab, 'Ancrage du soir', 600, v_cab || '/soir.mp3') returning id into v_audio;
  insert into public.audio_library (cabinet_id, title, duration_seconds, storage_path)
  values (v_voisin, 'Audio du voisin', 600, v_voisin || '/voisin.mp3') returning id into v_audio_voisin;
  insert into public.patient_audios (cabinet_id, patient_id, audio_id)
  values (v_cab, v_pat, v_audio) returning id into v_ecoute;
  insert into public.push_notifications (cabinet_id, title, body, scheduled_for, scheduled_at)
  values (v_cab, 'Ce soir', 'Votre exercice vous attend.', 'ce soir', now() - interval '1 minute') returning id into v_push;
  insert into public.push_recipients (push_id, patient_id, cabinet_id) values (v_push, v_pat, v_cab);

  ------------------------------------------------------- 1. suivi en cours
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_compte, 'role','authenticated')::text, true);

  select count(*) into n from public.patients;          if n <> 1 then raise exception 'ECHEC : le patient devrait lire sa fiche (%)', n; end if;
  select count(*) into n from public.patient_modules;   if n <> 1 then raise exception 'ECHEC : le patient devrait lire son module (%)', n; end if;
  select count(*) into n from public.patient_audios;    if n <> 1 then raise exception 'ECHEC : le patient devrait lire son audio (%)', n; end if;
  select count(*) into n from public.audio_library;     if n <> 1 then raise exception 'ECHEC : le patient devrait lire le titre de son audio (%)', n; end if;
  select count(*) into n from public.affirmations;      if n <> 1 then raise exception 'ECHEC : le patient devrait lire ses affirmations (%)', n; end if;
  select count(*) into n from public.journal_pages;     if n <> 1 then raise exception 'ECHEC : le patient devrait lire son journal (%)', n; end if;
  select count(*) into n from public.push_recipients;   if n <> 1 then raise exception 'ECHEC : le patient devrait lire son mot (%)', n; end if;
  perform public.patient_set_module_done(v_mod, true);

  ----------------------------------------------------------- 2. suivi clos
  perform set_config('role','none',true);
  update public.patients set archived_at = now() where id = v_pat;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_compte, 'role','authenticated')::text, true);

  ctx := public.my_context();
  if ctx->'patient' <> 'null'::jsonb then raise exception 'FUITE : my_context ouvre encore un suivi clos : %', ctx; end if;
  if public.is_patient_record(v_pat) then raise exception 'FUITE : is_patient_record reconnaît encore un suivi clos'; end if;

  select count(*) into n from public.patients;           if n <> 0 then raise exception 'FUITE : un suivi clos lit encore sa fiche'; end if;
  select count(*) into n from public.patient_modules;    if n <> 0 then raise exception 'FUITE : un suivi clos lit encore % module(s)', n; end if;
  select count(*) into n from public.patient_audios;     if n <> 0 then raise exception 'FUITE : un suivi clos lit encore % audio(s)', n; end if;
  select count(*) into n from public.audio_library;      if n <> 0 then raise exception 'FUITE : un suivi clos lit encore la bibliothèque (%)', n; end if;
  select count(*) into n from public.affirmations;       if n <> 0 then raise exception 'FUITE : un suivi clos lit encore % affirmation(s)', n; end if;
  select count(*) into n from public.journal_pages;      if n <> 0 then raise exception 'FUITE : un suivi clos lit encore % page(s) de journal', n; end if;
  select count(*) into n from public.push_recipients;    if n <> 0 then raise exception 'FUITE : un suivi clos lit encore % mot(s)', n; end if;
  select count(*) into n from public.push_notifications; if n <> 0 then raise exception 'FUITE : un suivi clos lit encore % notification(s)', n; end if;

  begin
    perform public.patient_set_module_done(v_mod, false); refuse := false;
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'FUITE : un suivi clos coche encore un module'; end if;

  begin
    perform public.patient_save_note(v_mod, 'Encore là ?'); refuse := false;
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'FUITE : un suivi clos annote encore un module'; end if;

  begin
    perform public.patient_count_listen(v_ecoute); refuse := false;
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'FUITE : un suivi clos compte encore ses écoutes'; end if;

  begin
    perform public.enregistrer_appareil(v_pat, 'https://fcm.googleapis.com/fcm/send/epreuve-0044', repeat('a', 87), repeat('b', 22));
    refuse := false;
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'FUITE : un suivi clos inscrit encore un téléphone'; end if;

  -- Ce geste-là ne lève pas : il ne doit simplement rien écrire.
  perform public.patient_marquer_lue(v_push);

  perform set_config('role','none',true);
  if (select done_at from public.patient_modules where id = v_mod) is null then
    raise exception 'FUITE : un suivi clos a décoché son module';
  end if;
  if (select read_at from public.push_recipients where push_id = v_push) is not null then
    raise exception 'FUITE : un suivi clos a marqué son mot comme lu';
  end if;

  -- Le rappel programmé avant la clôture n'est pas réclamé.
  if exists (select 1 from public.rappels_a_pousser(500) r where r.push_id = v_push) then
    raise exception 'FUITE : un rappel part encore vers un suivi clos';
  end if;

  ------------------------------------------------------- 3. suivi rouvert
  update public.patients set archived_at = null where id = v_pat;

  if not exists (select 1 from public.rappels_a_pousser(500) r where r.push_id = v_push) then
    raise exception 'ECHEC : le rappel d''un suivi rouvert ne part pas';
  end if;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_compte, 'role','authenticated')::text, true);
  select count(*) into n from public.patient_modules;
  if n <> 1 then raise exception 'ECHEC : un suivi rouvert devrait retrouver son module (%)', n; end if;
  perform public.patient_set_module_done(v_mod, false);

  ------------------------------------------ 4. un audio reste dans son cabinet
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_praticienne, 'role','authenticated')::text, true);

  /* La clé étrangère ne passe pas par la RLS : sans le déclencheur, cet
     envoi réussissait, et le patient lisait l'audio du voisin. */
  begin
    insert into public.patient_audios (cabinet_id, patient_id, audio_id) values (v_cab, v_pat, v_audio_voisin);
    refuse := false;
  exception when check_violation then refuse := true;
  end;
  if not refuse then raise exception 'FUITE : un audio d''un autre cabinet a été envoyé à un patient'; end if;

  begin
    insert into public.products (cabinet_id, title, price_cents, audio_id) values (v_cab, 'Audio du voisin', 900, v_audio_voisin);
    refuse := false;
  exception when check_violation then refuse := true;
  end;
  if not refuse then raise exception 'FUITE : un audio d''un autre cabinet a été mis en vente'; end if;

  -- Ce qui est du cabinet passe, et ne se détourne pas après coup.
  insert into public.products (cabinet_id, title, price_cents, audio_id)
  values (v_cab, 'Ancrage du soir', 900, v_audio) returning id into v_produit;
  begin
    update public.products set audio_id = v_audio_voisin where id = v_produit;
    refuse := false;
  exception when check_violation then refuse := true;
  end;
  if not refuse then raise exception 'FUITE : un produit a été détourné vers l''audio d''un autre cabinet'; end if;

  ----------------------------------------------------- 5. le lundi reprend
  perform set_config('role','none',true);

  select count(*) into n from cron.job where jobname = 'klaro-affirmations-reprises' and schedule = '0 8,10,12 * * 1';
  if n <> 1 then raise exception 'ECHEC : les reprises du lundi ne sont pas planifiées'; end if;
  if has_function_privilege('authenticated', 'public.declencher_affirmations()', 'execute') then
    raise exception 'FUITE : un compte connecté peut déclencher la tâche du lundi';
  end if;

  -- Une fiche à servir : réglage automatique, clé du cabinet, série vieille de huit jours.
  insert into public.patient_settings (patient_id, cabinet_id, affirmations_auto) values (v_pat, v_cab, true)
  on conflict (patient_id) do update set affirmations_auto = true;
  insert into public.cabinet_secrets (cabinet_id, anthropic_key_enc) values (v_cab, 'chiffre-d-epreuve')
  on conflict (cabinet_id) do update set anthropic_key_enc = excluded.anthropic_key_enc;
  update public.affirmations set published_at = now() - interval '8 days' where patient_id = v_pat;

  /* Sans le secret dans le coffre (une base de développement), rien ne part :
     c'est voulu, et l'épreuve l'attend. */
  v_secret := exists (select 1 from vault.secrets where name = 'klaro_cron_secret');
  select count(*) into v_file from net.http_request_queue;
  perform public.declencher_affirmations();
  select count(*) - v_file into n from net.http_request_queue;
  if n <> (case when v_secret then 1 else 0 end) then
    raise exception 'ECHEC : une fiche attend, la base devait appeler le serveur une fois (% appel(s), secret %)', n, v_secret;
  end if;

  /* Plus rien à servir de notre côté. On ne conclut au silence que si la base
     n'a pas, elle, de vraie fiche en attente. */
  update public.affirmations set published_at = now() where patient_id = v_pat;
  select count(*) into v_autres
    from public.patient_settings s
    join public.patients p        on p.id = s.patient_id
    join public.cabinet_secrets k on k.cabinet_id = p.cabinet_id
   where s.affirmations_auto and p.archived_at is null and k.anthropic_key_enc is not null
     and not exists (select 1 from public.affirmations a where a.patient_id = p.id and a.published_at >= now() - interval '4 days');
  if v_autres = 0 then
    select count(*) into v_file from net.http_request_queue;
    perform public.declencher_affirmations();
    select count(*) - v_file into n from net.http_request_queue;
    if n <> 0 then raise exception 'ECHEC : rien n''attend, et la base a réveillé le serveur'; end if;
  end if;

  raise exception 'REUSSITE : un suivi clos ne lit plus rien et aucun de ses gestes ne passe ; rouvert, tout lui revient et son rappel part ; un audio ne sort pas de son cabinet ; le lundi ne réveille le serveur que pour une fiche en attente. (Rien ne persiste.)';
end $$;
