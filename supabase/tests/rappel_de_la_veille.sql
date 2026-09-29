-- 0059 éprouvée contre la vraie base : la prochaine séance datée, et son
-- rappel la veille à 18 h.
--
-- Pas de doublon, déplacé avec la séance, annulé quand elle s'efface, rien
-- pour un suivi clos, rien quand la veille est déjà passée ; un mot parti
-- reste, un mot annulé par le cabinet ne revient pas ; et la mécanique ne se
-- lit par personne.
--
-- Le bloc fabrique deux cabinets, deux thérapeutes, trois fiches, puis
-- ANNULE tout par l'exception finale — rien ne subsiste, même en cas de
-- réussite. Aucun mot ne part d'ici : ceux qu'on écrit sont programmés pour
-- plus tard, et l'annulation les emporte.
do $$
declare
  v_rev uuid; v_cab uuid; v_cab2 uuid; v_plan text;
  v_ther uuid := gen_random_uuid(); v_ther2 uuid := gen_random_uuid();
  v_ua uuid := gen_random_uuid();
  -- Anna : suivie, avec son compte ; Bea : sans compte ; Dan : l'autre cabinet.
  v_fa uuid; v_fb uuid; v_fd uuid;
  v_s1 timestamptz; v_s2 timestamptz; v_proche timestamptz;
  v_push uuid; v_push_parti uuid; v_push_bea uuid;
  v_n int; v_t text; v_b text; v_pour text; v_at timestamptz; v_auteur uuid;
begin
  select id into v_rev from public.resellers order by created_at limit 1;
  if v_rev is null then raise exception 'RIEN À ÉPROUVER : aucun revendeur en base'; end if;
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;

  -- Dans trois jours à 14 h 30, dans cinq jours à 9 h (Paris) ; et dans une
  -- heure — sa veille à 18 h est forcément passée, quelle que soit l'heure
  -- à laquelle l'épreuve se joue.
  v_s1 := (((now() at time zone 'Europe/Paris')::date + 3) + time '14:30') at time zone 'Europe/Paris';
  v_s2 := (((now() at time zone 'Europe/Paris')::date + 5) + time '09:00') at time zone 'Europe/Paris';
  v_proche := date_trunc('minute', now()) + interval '1 hour';

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Cabinet agenda', 'cab-agenda-veille-t', 'x') returning id into v_cab;
  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Autre cabinet agenda', 'cab-agenda-veille2-t', 'x') returning id into v_cab2;
  insert into public.subscriptions (cabinet_id, plan_code, status)
  values (v_cab, v_plan, 'actif'), (v_cab2, v_plan, 'actif');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values
    (v_ther, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'therapeute-agenda-veille@exemple.test', '', now(), now(), now()),
    (v_ther2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'therapeute2-agenda-veille@exemple.test', '', now(), now(), now()),
    (v_ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'anna-agenda-veille@exemple.test', '', now(), now(), now());

  insert into public.cabinet_members (cabinet_id, user_id, display_name)
  values (v_cab, v_ther, 'Thérapeute'), (v_cab2, v_ther2, 'Autre thérapeute');

  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, v_ua, 'Anna', 'A', 'p', 's', 'w', 'l', 'q', 'anna-agenda-veille@exemple.test')
  returning id into v_fa;
  insert into public.patients (cabinet_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'Bea', 'B', 'p', 's', 'w', 'l', 'q')
  returning id into v_fb;
  insert into public.patients (cabinet_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question)
  values (v_cab2, 'Dan', 'D', 'p', 's', 'w', 'l', 'q')
  returning id into v_fd;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ther::text, 'role', 'authenticated')::text, true);

  -- ── 1. Fixer la date écrit un mot, un seul, la veille à 18 h ───────────
  update public.patients set next_session_at = v_s1 where id = v_fa;

  select count(*) into v_n
    from public.push_recipients r join public.push_notifications n on n.id = r.push_id
   where r.patient_id = v_fa;
  if v_n <> 1 then raise exception 'ECHEC 1 : % mots écrits pour la séance au lieu d''un', v_n; end if;

  select n.id, n.title, n.body, n.scheduled_for, n.scheduled_at, n.created_by
    into v_push, v_t, v_b, v_pour, v_at, v_auteur
    from public.push_recipients r join public.push_notifications n on n.id = r.push_id
   where r.patient_id = v_fa;
  if v_b <> 'Votre séance est demain à 14 h 30.' then
    raise exception 'ECHEC 1b : le rappel dit « % »', v_b;
  end if;
  if v_t <> 'À demain' or v_pour <> 'La veille de la séance, 18 h' then
    raise exception 'ECHEC 1c : titre ou libellé inattendu (« % », « % »)', v_t, v_pour;
  end if;
  if v_at <> ((((v_s1 at time zone 'Europe/Paris')::date - 1) + time '18:00') at time zone 'Europe/Paris') then
    raise exception 'ECHEC 1d : le rappel part à % au lieu de la veille, 18 h', v_at;
  end if;
  if v_auteur is not null then raise exception 'ECHEC 1e : le mot automatique porte un auteur'; end if;

  -- ── 2. Réenregistrer la fiche, date comprise, n'en écrit pas un second ─
  update public.patients set next_session_at = v_s1, scale_question = 'Votre sommeil ?' where id = v_fa;
  update public.patients set next_session_at = v_s1 where id = v_fa;
  select count(*) into v_n
    from public.push_recipients r where r.patient_id = v_fa;
  if v_n <> 1 then raise exception 'ECHEC 2 : la même séance resauvée a écrit % mots', v_n; end if;

  -- ── 3. Le patient ne le lit pas avant l'heure ──────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ua::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.push_notifications where id = v_push;
  if v_n <> 0 then raise exception 'ECHEC 3 : le patient lit son rappel avant la veille'; end if;
  select count(*) into v_n from public.patient_mots(v_fa, 20) m where m.push_id = v_push;
  if v_n <> 0 then raise exception 'ECHEC 3b : le rappel paraît dans ses mots avant l''heure'; end if;
  -- Il lit la date de sa séance avec sa fiche.
  select count(*) into v_n from public.patients where id = v_fa and next_session_at = v_s1;
  if v_n <> 1 then raise exception 'ECHEC 3c : le patient ne lit pas la date de sa séance'; end if;
  -- Et ne la change pas.
  update public.patients set next_session_at = v_s2 where id = v_fa;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ther::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.patients where id = v_fa and next_session_at = v_s1;
  if v_n <> 1 then raise exception 'ECHEC 3d : le patient a déplacé sa propre séance'; end if;

  -- ── 4. Déplacée : l'ancien mot s'annule, le nouveau suit la séance ─────
  update public.patients set next_session_at = v_s2 where id = v_fa;
  select count(*) into v_n from public.push_notifications where id = v_push;
  if v_n <> 0 then raise exception 'ECHEC 4 : le rappel de l''ancienne date attend toujours'; end if;
  select count(*), max(n.body) into v_n, v_b
    from public.push_recipients r join public.push_notifications n on n.id = r.push_id
   where r.patient_id = v_fa;
  if v_n <> 1 or v_b <> 'Votre séance est demain à 9 h.' then
    raise exception 'ECHEC 4b : après le déplacement, % mots (« % »)', v_n, v_b;
  end if;

  -- ── 5. Veille déjà passée : rien ne s'écrit, et l'ancien s'annule ──────
  update public.patients set next_session_at = v_proche where id = v_fa;
  select count(*) into v_n from public.push_recipients r where r.patient_id = v_fa;
  if v_n <> 0 then raise exception 'ECHEC 5 : % mots pour une séance dont la veille est passée', v_n; end if;

  -- ── 6. Effacer la date annule le rappel ────────────────────────────────
  update public.patients set next_session_at = v_s2 where id = v_fa;
  update public.patients set next_session_at = null where id = v_fa;
  select count(*) into v_n from public.push_recipients r where r.patient_id = v_fa;
  if v_n <> 0 then raise exception 'ECHEC 6 : la séance effacée garde son rappel'; end if;

  -- ── 7. Suivi clos : annulé, rien de neuf ; rouvert, il revient ─────────
  update public.patients set next_session_at = v_s1 where id = v_fa;
  update public.patients set archived_at = now() where id = v_fa;
  select count(*) into v_n from public.push_recipients r where r.patient_id = v_fa;
  if v_n <> 0 then raise exception 'ECHEC 7 : le suivi clos garde son rappel'; end if;
  update public.patients set next_session_at = v_s2 where id = v_fa;
  select count(*) into v_n from public.push_recipients r where r.patient_id = v_fa;
  if v_n <> 0 then raise exception 'ECHEC 7b : un rappel s''écrit pour un suivi clos'; end if;
  update public.patients set archived_at = null where id = v_fa;
  select count(*), max(n.body) into v_n, v_b
    from public.push_recipients r join public.push_notifications n on n.id = r.push_id
   where r.patient_id = v_fa;
  if v_n <> 1 or v_b <> 'Votre séance est demain à 9 h.' then
    raise exception 'ECHEC 7c : le suivi rouvert n''a pas retrouvé son rappel (% mots)', v_n;
  end if;

  -- ── 8. Annulé par le cabinet : il ne revient pas au prochain enregistrement
  select r.push_id into v_push from public.push_recipients r where r.patient_id = v_fa;
  delete from public.push_notifications where id = v_push;
  update public.patients set next_session_at = v_s2, scale_question = 'Et ce soir ?' where id = v_fa;
  select count(*) into v_n from public.push_recipients r where r.patient_id = v_fa;
  if v_n <> 0 then raise exception 'ECHEC 8 : le rappel annulé par le cabinet est revenu'; end if;

  -- ── 9. Parti, il reste ─────────────────────────────────────────────────
  update public.patients set next_session_at = v_s1 where id = v_fa;
  select r.push_id into v_push_parti from public.push_recipients r where r.patient_id = v_fa;
  -- Sa veille est arrivée : on l'avance, comme l'horloge l'aurait fait.
  set local role postgres;
  update public.push_notifications set scheduled_at = now() - interval '1 minute' where id = v_push_parti;
  set local role authenticated;
  update public.patients set next_session_at = v_s2 where id = v_fa;
  select count(*) into v_n from public.push_notifications where id = v_push_parti;
  if v_n <> 1 then raise exception 'ECHEC 9 : un rappel déjà dû a été retiré'; end if;
  select count(*) into v_n from public.push_recipients r where r.patient_id = v_fa;
  if v_n <> 2 then raise exception 'ECHEC 9b : % mots au lieu du parti et du nouveau', v_n; end if;

  -- ── 10. Une autre thérapeute ne déplace pas la séance d'Anna ───────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ther2::text, 'role', 'authenticated')::text, true);
  update public.patients set next_session_at = v_s1 where id = v_fa;
  select count(*) into v_n from public.push_notifications where cabinet_id = v_cab;
  if v_n <> 0 then raise exception 'ECHEC 10 : une autre thérapeute lit % mots du cabinet', v_n; end if;
  -- Sa propre fiche, elle, a son rappel — dans son cabinet.
  update public.patients set next_session_at = v_s1 where id = v_fd;
  select count(*) into v_n
    from public.push_recipients r join public.push_notifications n on n.id = r.push_id
   where r.patient_id = v_fd and n.cabinet_id = v_cab2 and r.cabinet_id = v_cab2;
  if v_n <> 1 then raise exception 'ECHEC 10b : le rappel de Dan n''est pas rangé dans son cabinet'; end if;

  set local role postgres;
  select count(*) into v_n from public.patients where id = v_fa and next_session_at = v_s2;
  if v_n <> 1 then raise exception 'ECHEC 10c : une autre thérapeute a déplacé la séance d''Anna'; end if;
  select count(*) into v_n from public.push_recipients r where r.patient_id = v_fa;
  if v_n <> 2 then raise exception 'ECHEC 10d : la tentative d''une autre thérapeute a touché aux rappels d''Anna'; end if;
  set local role authenticated;

  -- ── 11. La mécanique ne se lit par personne ────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ther::text, 'role', 'authenticated')::text, true);
  begin
    perform count(*) from public.rappels_de_seance;
    raise exception 'ECHEC 11 : le cabinet lit la table des rappels de séance';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.rappel_de_la_veille_a(now());
    raise exception 'ECHEC 11b : un outil du déclencheur s''appelle depuis le navigateur';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ua::text, 'role', 'authenticated')::text, true);
  begin
    perform count(*) from public.rappels_de_seance;
    raise exception 'ECHEC 11c : le patient lit la table des rappels de séance';
  exception when insufficient_privilege then null;
  end;

  -- ── 12. Une fiche sans compte a son rappel ; effacée, elle l'emporte ───
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ther::text, 'role', 'authenticated')::text, true);
  update public.patients set next_session_at = v_s1 where id = v_fb;
  select r.push_id into v_push_bea from public.push_recipients r where r.patient_id = v_fb;
  if v_push_bea is null then raise exception 'ECHEC 12 : une fiche sans compte n''a pas de rappel'; end if;
  delete from public.patients where id = v_fb;
  set local role postgres;
  select count(*) into v_n from public.push_notifications where id = v_push_bea;
  if v_n <> 0 then raise exception 'ECHEC 12b : le rappel d''une fiche effacée attend toujours'; end if;

  raise exception 'REUSSITE : la séance datée écrit un seul rappel la veille à 18 h, que le patient ne lit qu''à son heure ; il suit la séance déplacée, s''annule quand elle s''efface, quand la veille est passée ou le suivi clos, revient à la réouverture, ne revient pas une fois annulé par le cabinet, reste une fois parti ; une autre thérapeute n''y touche pas ; la mécanique ne se lit par personne. (Rien ne persiste.)';
end $$;
