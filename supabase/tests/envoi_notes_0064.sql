-- 0064 éprouvée contre la vraie base : une note d'honoraires part à
-- l'adresse de sa fiche, sous les droits de la praticienne, et sous plafonds.
--
--   praticienne   → prépare l'envoi d'une note vivante : l'adresse est celle
--                   de la fiche ; l'envoi est inscrit, au journal aussi
--   note annulée, fiche sans adresse → refusées, en français
--   plafonds      → trois envois par note et par jour ; un échec ne compte pas
--   autre cabinet, patient, anonyme → ni préparer, ni lire les envois
--   personne      → n'écrit les envois depuis le navigateur
--
-- Un bloc, ANNULÉ par l'exception finale : rien ne subsiste.
do $$
declare
  v_suf text := substr(md5(random()::text), 1, 8);
  v_ther uuid := gen_random_uuid(); v_voisine uuid := gen_random_uuid(); v_compte uuid := gen_random_uuid();
  v_res uuid; v_plan text; v_cab uuid; v_voisin uuid;
  v_fiche uuid; v_sans uuid;
  v_note public.notes_honoraires; v_note2 public.notes_honoraires; v_note3 public.notes_honoraires;
  v_prep jsonb; v_n int; v_hier date := ((now() at time zone 'Europe/Paris')::date - 1);
begin
  select code, reseller_id into v_plan, v_res from public.plans where max_patients is null limit 1;
  if v_plan is null then select code, reseller_id into v_plan, v_res from public.plans order by position desc limit 1; end if;
  if v_plan is null then raise exception 'RIEN À ÉPROUVER : aucune offre au catalogue'; end if;
  if v_res is null then
    insert into public.resellers (name, slug) values ('Revendeur 0064', 'revendeur-0064-' || v_suf) returning id into v_res;
  end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), now(), now()
    from (values
      (v_ther, 'praticienne-0064-' || v_suf || '@exemple.test'),
      (v_voisine, 'voisine-0064-' || v_suf || '@exemple.test'),
      (v_compte, 'patient-0064-' || v_suf || '@exemple.test')
    ) as u(id, email);

  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Cabinet 0064', 'cab-0064-' || v_suf, 'x') returning id into v_cab;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Voisin 0064', 'cab-0064v-' || v_suf, 'x') returning id into v_voisin;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif'), (v_voisin, v_plan, 'actif');
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values
    (v_cab, v_ther, 'owner', 'Praticienne 0064'), (v_voisin, v_voisine, 'owner', 'Voisine 0064');
  insert into public.cabinet_facturation (cabinet_id, praticien, adresse, numero_pro)
  values (v_cab, 'Praticienne 0064', '1 rue des Essais', 'SIRET 0064');

  insert into public.patients (cabinet_id, auth_user_id, email, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, v_compte, 'patient-0064-' || v_suf || '@exemple.test', 'Anna 0064', 'A', '', '', '', '', '')
  returning id into v_fiche;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'Sans adresse 0064', 'S', '', '', '', '', '')
  returning id into v_sans;

  -- ══ La praticienne émet, puis prépare l'envoi ═══════════════════════════
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ther, 'role', 'authenticated', 'aal', 'aal1')::text, true);

  v_note := public.cabinet_emettre_note_honoraires(v_fiche, null, v_hier, 'Séance d''hypnose', 6000, 'art-293-b');
  v_note2 := public.cabinet_emettre_note_honoraires(v_sans, null, v_hier, 'Séance d''hypnose', 6000, 'art-293-b');
  v_note3 := public.cabinet_emettre_note_honoraires(v_fiche, null, v_hier, 'Séance d''hypnose', 6000, 'art-293-b');

  v_prep := public.cabinet_preparer_envoi_note_honoraires(v_note.id);
  if v_prep ->> 'destinataire' <> 'patient-0064-' || v_suf || '@exemple.test' then
    raise exception 'ECHEC 1 : l''envoi ne vise pas l''adresse de la fiche (%)', v_prep ->> 'destinataire';
  end if;
  if v_prep ->> 'repondre_a' <> 'praticienne-0064-' || v_suf || '@exemple.test' then
    raise exception 'ECHEC 1b : la réponse n''arrive pas chez la praticienne';
  end if;
  if (v_prep ->> 'numero')::int <> v_note.numero or v_prep ->> 'cabinet' <> 'Cabinet 0064' then
    raise exception 'ECHEC 1c : la préparation ne dit pas la note ou le cabinet';
  end if;
  select count(*) into v_n from public.notes_honoraires_envois where note_id = v_note.id and statut = 'en_cours';
  if v_n <> 1 then raise exception 'ECHEC 2 : l''envoi n''est pas inscrit'; end if;

  -- Elle relit ses envois ; elle ne les écrit pas.
  begin
    insert into public.notes_honoraires_envois (note_id, cabinet_id, destinataire) values (v_note.id, v_cab, 'x@exemple.test');
    raise exception 'ECHEC 3 : la praticienne écrit un envoi depuis le navigateur';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.notes_honoraires_envois set statut = 'parti' where note_id = v_note.id;
    raise exception 'ECHEC 3b : la praticienne réécrit un envoi';
  exception when insufficient_privilege then null;
  end;

  -- ══ Les refus ══════════════════════════════════════════════════════════
  begin
    perform public.cabinet_preparer_envoi_note_honoraires(v_note2.id);
    raise exception 'ECHEC 4 : une fiche sans adresse prépare un envoi';
  exception when check_violation then
    if sqlerrm !~ 'n''a pas d''adresse' then raise exception 'ECHEC 4b : refus mal dit (%)', sqlerrm; end if;
  end;

  perform public.cabinet_annuler_note_honoraires(v_note3.id);
  begin
    perform public.cabinet_preparer_envoi_note_honoraires(v_note3.id);
    raise exception 'ECHEC 5 : une note annulée part encore';
  exception when check_violation then null;
  end;

  -- ══ Les plafonds : trois par note et par jour, les échecs n'y comptent pas ═
  perform set_config('role', 'postgres', true);
  update public.notes_honoraires_envois set statut = 'echec' where note_id = v_note.id;
  perform set_config('role', 'authenticated', true);
  perform public.cabinet_preparer_envoi_note_honoraires(v_note.id);
  perform public.cabinet_preparer_envoi_note_honoraires(v_note.id);
  perform public.cabinet_preparer_envoi_note_honoraires(v_note.id);
  begin
    perform public.cabinet_preparer_envoi_note_honoraires(v_note.id);
    raise exception 'ECHEC 6 : une note part une quatrième fois dans la journée';
  exception when check_violation then null;
  end;

  -- ══ Les autres ═════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_voisine, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin
    perform public.cabinet_preparer_envoi_note_honoraires(v_note.id);
    raise exception 'ECHEC 7 : un autre cabinet envoie la note';
  exception when no_data_found then null;
  end;
  select count(*) into v_n from public.notes_honoraires_envois where note_id = v_note.id;
  if v_n <> 0 then raise exception 'ECHEC 7b : un autre cabinet lit les envois'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_compte, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin
    perform public.cabinet_preparer_envoi_note_honoraires(v_note.id);
    raise exception 'ECHEC 8 : le patient envoie sa note lui-même';
  exception when no_data_found then null;
  end;
  select count(*) into v_n from public.notes_honoraires_envois;
  if v_n <> 0 then raise exception 'ECHEC 8b : le patient lit les envois'; end if;

  perform set_config('role', 'postgres', true);
  if has_function_privilege('anon', 'public.cabinet_preparer_envoi_note_honoraires(uuid)', 'execute') then
    raise exception 'ECHEC 9 : un visiteur anonyme prépare un envoi';
  end if;
  if has_table_privilege('authenticated', 'public.notes_honoraires_envois', 'insert')
     or has_table_privilege('authenticated', 'public.notes_honoraires_envois', 'update')
     or has_table_privilege('authenticated', 'public.notes_honoraires_envois', 'delete')
     or has_table_privilege('anon', 'public.notes_honoraires_envois', 'select') then
    raise exception 'ECHEC 9b : un droit d''écriture ou de lecture anonyme reste sur les envois';
  end if;
  select count(*) into v_n from public.audit_log where action = 'honoraires.envoyee' and target_id = v_note.id;
  if v_n <> 4 then raise exception 'ECHEC 10 : % envoi(s) au journal au lieu de 4', v_n; end if;

  raise exception 'REUSSITE : la note part à l''adresse de sa fiche, réponse chez la praticienne ; fiche sans adresse et note annulée refusées ; trois envois par jour, échecs non comptés ; ni voisin, ni patient, ni anonyme ne prépare ou ne lit ; personne n''écrit les envois du navigateur ; chaque envoi au journal';
end $$;
