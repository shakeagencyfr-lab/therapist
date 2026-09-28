-- ============================================================================
-- 0054 éprouvée contre la vraie base : le mot lu, le mot répondu.
--
--   lu_le        posé par le cabinet seul — le patient ne l'écrit ni à la
--                création ni après, et ne peut pas appeler la fonction du
--                cabinet ; une page corrigée redevient non lue, un changement
--                de partage ou de rang ne touche pas à la lecture
--   compteur     les pages partagées non lues, par fiche, et elles seules
--   réponse      un mot rattaché à la page, adressé à son SEUL auteur :
--                personne d'autre ne le reçoit, ni par la fonction, ni en
--                écrivant les tables à la main ; le lien ne se pose qu'à la
--                naissance du mot
--   frontière    un autre cabinet ne lit rien, ne marque rien, ne répond à
--                rien ; un anonyme n'appelle aucune des fonctions
--   suivi clos   ne reçoit plus de réponse
--   effacement   la page effacée, la réponse reste — sans lien
--
-- Le bloc fabrique son revendeur, ses deux cabinets (abonnement actif), ses
-- comptes @exemple.test et leurs pages, puis ANNULE tout par l'exception
-- finale : rien ne subsiste, même en cas de réussite.
--
--   psql "$DATABASE_URL" -f supabase/tests/mot_lu_et_repondu.sql
-- ============================================================================

do $$
declare
  v_rev uuid; v_plan text; v_cab uuid; v_voisin uuid;
  v_ther uuid := gen_random_uuid();
  v_ther_voisin uuid := gen_random_uuid();
  v_uid_a uuid := gen_random_uuid();
  v_uid_b uuid := gen_random_uuid();
  v_a uuid; v_b uuid;
  v_mot uuid; v_privee uuid; v_mot_b uuid;
  v_rep uuid; v_coll uuid; v_faux uuid;
  v_lu timestamptz; v_lu2 timestamptz;
  n int; v_liste text;
begin
  -- ── Ce qu'il faut pour éprouver ─────────────────────────────────────────
  insert into public.resellers (name, slug) values ('Revendeur 0054', 'revendeur-0054-t') returning id into v_rev;
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Cabinet 0054', 'cabinet-0054-t', 'x') returning id into v_cab;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif');
  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Voisin 0054', 'voisin-0054-t', 'x') returning id into v_voisin;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_voisin, v_plan, 'actif');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at) values
    (v_ther, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'therapeute-0054@exemple.test', '', now(), now(), now()),
    (v_ther_voisin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'voisine-0054@exemple.test', '', now(), now(), now()),
    (v_uid_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'patient-a-0054@exemple.test', '', now(), now(), now()),
    (v_uid_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'patient-b-0054@exemple.test', '', now(), now(), now());
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values
    (v_cab, v_ther, 'owner', 'Thérapeute 0054'),
    (v_voisin, v_ther_voisin, 'owner', 'Voisine 0054');

  insert into public.patients (cabinet_id, auth_user_id, email, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question)
  values (v_cab, v_uid_a, 'patient-a-0054@exemple.test', 'Camille', 'C', '', '', '', '', '')
  returning id into v_a;
  insert into public.patients (cabinet_id, auth_user_id, email, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question)
  values (v_cab, v_uid_b, 'patient-b-0054@exemple.test', 'Dominique', 'D', '', '', '', '', '')
  returning id into v_b;

  -- ── 0. Structure : la clé de la réponse a son index ─────────────────────
  select string_agg(c.conname, ', ') into v_liste
    from pg_constraint c
   where c.contype = 'f'
     and c.conrelid = 'public.push_notifications'::regclass
     and c.conkey = array[(select attnum from pg_attribute
                            where attrelid = 'public.push_notifications'::regclass
                              and attname = 'en_reponse_a')]
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (string_to_array(i.indkey::text, ' ')::int2[])[1] = c.conkey[1]
     );
  if v_liste is not null then raise exception 'ECHEC 0 : clé sans index : %', v_liste; end if;

  -- ── 1. Le patient écrit ; il ne pose pas la lecture ──────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_a, 'role', 'authenticated')::text, true);

  insert into public.journal_pages (patient_id, cabinet_id, title, body, shared)
  values (v_a, v_cab, 'Un mot', 'La nuit a été mauvaise.', true) returning id into v_mot;
  insert into public.journal_pages (patient_id, cabinet_id, title, body, shared)
  values (v_a, v_cab, 'Pour moi', 'Rien que pour moi.', false) returning id into v_privee;

  begin
    insert into public.journal_pages (patient_id, cabinet_id, title, body, shared, lu_le)
    values (v_a, v_cab, 'Faux', 'Déjà lu, dit-il.', true, now());
    raise exception 'ECHEC 1 : le patient crée une page déjà « lue »';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.journal_pages set lu_le = now() where id = v_mot;
    raise exception 'ECHEC 2 : le patient pose lu_le lui-même';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cabinet_marquer_page_lue(v_mot);
    raise exception 'ECHEC 3 : le patient appelle la fonction de lecture du cabinet';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cabinet_repondre_a_la_page(v_mot, 'Je me réponds.');
    raise exception 'ECHEC 4 : le patient se répond par la fonction du cabinet';
  exception when insufficient_privilege then null;
  end;
  -- Ce qu'il écrit toujours : le texte, le partage, le rang.
  update public.journal_pages set position = 0 where id = v_mot;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC 5 : le patient ne range plus ses pages'; end if;

  -- ── 2. Le cabinet compte, ouvre, et la lecture tient ─────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_ther, 'role', 'authenticated')::text, true);

  select coalesce(sum(non_lues), 0) into n from public.cabinet_pages_non_lues(v_cab) where patient_id = v_a;
  if n <> 1 then raise exception 'ECHEC 6 : % page(s) non lue(s) comptée(s) au lieu d''une — la privée compte-t-elle ?', n; end if;

  begin
    perform public.cabinet_marquer_page_lue(v_privee);
    raise exception 'FUITE 7 : le cabinet marque lue une page privée';
  exception when insufficient_privilege then null;
  end;

  v_lu := public.cabinet_marquer_page_lue(v_mot);
  if v_lu is null then raise exception 'ECHEC 8 : ouvrir la page ne la marque pas lue'; end if;
  v_lu2 := public.cabinet_marquer_page_lue(v_mot);
  if v_lu2 is distinct from v_lu then raise exception 'ECHEC 9 : la seconde ouverture réécrit la première'; end if;

  select count(*) into n from public.cabinet_pages_non_lues(v_cab);
  if n <> 0 then raise exception 'ECHEC 10 : la page ouverte reste comptée non lue'; end if;

  -- ── 3. Le patient voit la lecture ; la corriger l'efface ─────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_a, 'role', 'authenticated')::text, true);
  if (select lu_le from public.journal_pages where id = v_mot) is null then
    raise exception 'ECHEC 11 : le patient ne voit pas que son mot a été lu';
  end if;

  update public.journal_pages set shared = false where id = v_mot;
  update public.journal_pages set shared = true, position = 1 where id = v_mot;
  if (select lu_le from public.journal_pages where id = v_mot) is null then
    raise exception 'ECHEC 12 : changer le partage ou le rang efface la lecture';
  end if;

  update public.journal_pages set body = 'La nuit a été mauvaise, puis meilleure.' where id = v_mot;
  if (select lu_le from public.journal_pages where id = v_mot) is not null then
    raise exception 'ECHEC 13 : une page corrigée garde « lu » sur une version jamais lue';
  end if;

  -- ── 4. Un autre cabinet ne lit rien ─────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_ther_voisin, 'role', 'authenticated')::text, true);

  select count(*) into n from public.journal_pages where cabinet_id = v_cab;
  if n <> 0 then raise exception 'FUITE 14 : un autre cabinet lit % page(s)', n; end if;
  select count(*) into n from public.cabinet_pages_non_lues(v_cab);
  if n <> 0 then raise exception 'FUITE 15 : un autre cabinet compte les pages non lues de ce cabinet'; end if;
  begin
    perform public.cabinet_marquer_page_lue(v_mot);
    raise exception 'FUITE 16 : un autre cabinet marque la page lue';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cabinet_repondre_a_la_page(v_mot, 'Réponse d''ailleurs.');
    raise exception 'FUITE 17 : un autre cabinet répond à la page';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.push_notifications (cabinet_id, title, body, scheduled_for, en_reponse_a)
    values (v_voisin, 'x', 'Réponse glissée.', 'Maintenant', v_mot);
    raise exception 'FUITE 18 : un autre cabinet rattache un mot à la page';
  exception when check_violation then null;
  end;

  -- ── 5. La réponse, et elle seule ────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_ther, 'role', 'authenticated')::text, true);

  begin
    perform public.cabinet_repondre_a_la_page(v_mot, '   ');
    raise exception 'ECHEC 19 : une réponse vide part';
  exception when check_violation then null;
  end;
  begin
    perform public.cabinet_repondre_a_la_page(v_mot, repeat('x', 2001));
    raise exception 'ECHEC 20 : une réponse de plus de 2 000 signes part';
  exception when check_violation then null;
  end;

  v_rep := public.cabinet_repondre_a_la_page(v_mot, '  Merci de me l''avoir dit. On en parle jeudi.  ');
  if v_rep is null then raise exception 'ECHEC 21 : la réponse ne rend pas son mot'; end if;

  select count(*) into n from public.push_recipients where push_id = v_rep;
  if n <> 1 then raise exception 'FUITE 22 : la réponse a % destinataire(s)', n; end if;
  if not exists (select 1 from public.push_recipients where push_id = v_rep and patient_id = v_a) then
    raise exception 'FUITE 23 : la réponse ne va pas à l''auteur de la page';
  end if;
  if (select body from public.push_notifications where id = v_rep) <> 'Merci de me l''avoir dit. On en parle jeudi.' then
    raise exception 'ECHEC 24 : le texte de la réponse n''est pas rogné';
  end if;
  if (select lu_le from public.journal_pages where id = v_mot) is null then
    raise exception 'ECHEC 25 : répondre ne marque pas la page lue';
  end if;

  -- À la main, par les tables : personne d'autre ne s'ajoute.
  begin
    insert into public.push_recipients (push_id, patient_id, cabinet_id) values (v_rep, v_b, v_cab);
    raise exception 'FUITE 26 : un second destinataire s''ajoute à la réponse';
  exception when check_violation then null;
  end;
  begin
    update public.push_recipients set patient_id = v_b where push_id = v_rep and patient_id = v_a;
    raise exception 'FUITE 27 : la réponse change de destinataire';
  exception when check_violation then null;
  end;

  insert into public.push_notifications (cabinet_id, title, body, scheduled_for, en_reponse_a)
  values (v_cab, 'x', 'Réponse à la main.', 'Maintenant', v_mot) returning id into v_faux;
  begin
    insert into public.push_recipients (push_id, patient_id, cabinet_id) values (v_faux, v_b, v_cab);
    raise exception 'FUITE 28 : une réponse écrite à la main part chez un autre patient';
  exception when check_violation then null;
  end;

  -- Un mot collectif ne devient pas une réponse, et une réponse ne change pas de page.
  insert into public.push_notifications (cabinet_id, title, body, scheduled_for)
  values (v_cab, 'Tous', 'Un mot pour tout le monde.', 'Maintenant') returning id into v_coll;
  insert into public.push_recipients (push_id, patient_id, cabinet_id) values (v_coll, v_a, v_cab), (v_coll, v_b, v_cab);
  begin
    update public.push_notifications set en_reponse_a = v_mot where id = v_coll;
    raise exception 'FUITE 29 : un mot collectif se rattache après coup à la page d''une personne';
  exception when check_violation then null;
  end;

  -- ── 6. Le patient la reçoit ; l'autre patient ne la voit pas ─────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_a, 'role', 'authenticated')::text, true);
  if not exists (select 1 from public.patient_mots(v_a, 20) m where m.push_id = v_rep) then
    raise exception 'ECHEC 30 : la réponse n''arrive pas dans les mots du patient';
  end if;
  select count(*) into n from public.push_notifications where en_reponse_a = v_mot;
  if n <> 1 then raise exception 'ECHEC 31 : le patient lit % réponse(s) sous son mot au lieu d''une', n; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.push_notifications where id in (v_rep, v_faux);
  if n <> 0 then raise exception 'FUITE 32 : un autre patient lit la réponse'; end if;
  if exists (select 1 from public.patient_mots(v_b, 100) m where m.push_id = v_rep) then
    raise exception 'FUITE 33 : la réponse arrive dans les mots d''un autre patient';
  end if;
  select count(*) into n from public.journal_pages where id = v_mot;
  if n <> 0 then raise exception 'FUITE 34 : un autre patient lit la page'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ther_voisin, 'role', 'authenticated')::text, true);
  select count(*) into n from public.push_notifications where id = v_rep;
  if n <> 0 then raise exception 'FUITE 35 : un autre cabinet lit la réponse'; end if;

  -- ── 7. La réponse part comme un rappel ──────────────────────────────────
  perform set_config('role', 'postgres', true);
  if not exists (
    select 1 from public.push_recipients r
      join public.push_notifications n2 on n2.id = r.push_id
     where r.push_id = v_rep and r.push_status is null
       and coalesce(n2.scheduled_at, n2.created_at) <= now()
  ) then
    raise exception 'ECHEC 36 : la réponse n''est pas due au passage des rappels';
  end if;

  -- ── 8. Un anonyme n'appelle rien ────────────────────────────────────────
  perform set_config('role', 'anon', true);
  begin
    perform public.cabinet_marquer_page_lue(v_mot);
    raise exception 'FUITE 37 : un anonyme appelle la lecture';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cabinet_repondre_a_la_page(v_mot, 'x');
    raise exception 'FUITE 38 : un anonyme répond';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cabinet_pages_non_lues(v_cab);
    raise exception 'FUITE 39 : un anonyme compte les pages';
  exception when insufficient_privilege then null;
  end;

  -- ── 9. Un suivi clos ne reçoit plus de réponse ───────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_b, 'role', 'authenticated')::text, true);
  insert into public.journal_pages (patient_id, cabinet_id, title, body, shared)
  values (v_b, v_cab, 'Un mot', 'Je m''arrête là.', true) returning id into v_mot_b;

  perform set_config('role', 'postgres', true);
  update public.patients set archived_at = now() where id = v_b;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ther, 'role', 'authenticated')::text, true);
  begin
    perform public.cabinet_repondre_a_la_page(v_mot_b, 'Bonne route.');
    raise exception 'ECHEC 40 : une réponse part vers un suivi clos';
  exception when check_violation then null;
  end;

  -- ── 10. La page effacée, la réponse reste ────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_a, 'role', 'authenticated')::text, true);
  delete from public.journal_pages where id = v_mot;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC 41 : la page répondue ne s''efface plus'; end if;

  perform set_config('role', 'postgres', true);
  if not exists (select 1 from public.push_notifications where id = v_rep and en_reponse_a is null) then
    raise exception 'ECHEC 42 : la réponse disparaît avec la page, ou garde un lien mort';
  end if;
  if not exists (select 1 from public.push_recipients where push_id = v_rep and patient_id = v_a) then
    raise exception 'ECHEC 43 : la réponse n''est plus adressée après l''effacement de la page';
  end if;

  raise exception 'REUSSITE : lu_le posé par le cabinet seul, relu à la correction ; la réponse ne va qu''à l''auteur ; aucun autre cabinet ni patient ne lit rien';
end;
$$;
