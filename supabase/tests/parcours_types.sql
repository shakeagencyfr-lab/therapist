-- 0059 éprouvée contre la vraie base : le parcours par défaut d'un
-- programme, et son cloisonnement.
--
-- Réglé par son cabinet seul, lu par son cabinet seul — ni par un autre, ni
-- par le patient, ni par le revendeur —, jamais écrit directement ; ajouté
-- au parcours d'un patient par choix, à la suite du sien, sans doublon, et
-- jamais à la fiche d'un autre cabinet ni à un suivi clos.
--
-- Le bloc fabrique deux cabinets, deux thérapeutes, un membre du revendeur,
-- trois fiches, puis ANNULE tout par l'exception finale — rien ne subsiste,
-- même en cas de réussite.
do $$
declare
  v_rev uuid; v_cab uuid; v_cab2 uuid; v_plan text;
  v_ther uuid := gen_random_uuid(); v_ther2 uuid := gen_random_uuid();
  v_ua uuid := gen_random_uuid(); v_rm uuid := gen_random_uuid();
  -- Anna : suivie ; Cleo : suivi clos ; Dan : l'autre cabinet.
  v_fa uuid; v_fc uuid; v_fd uuid;
  v_prog uuid; v_prog2 uuid; v_ancien uuid;
  v_e1 uuid; v_e2 uuid; v_e3 uuid; v_ailleurs uuid;
  v_n int; v_t text; v_c jsonb; v_pos int; v_src text;
  v_douze jsonb;
begin
  select id into v_rev from public.resellers order by created_at limit 1;
  if v_rev is null then raise exception 'RIEN À ÉPROUVER : aucun revendeur en base'; end if;
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Cabinet programmes', 'cab-parcours-type-t', 'x') returning id into v_cab;
  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Autre cabinet programmes', 'cab-parcours-type2-t', 'x') returning id into v_cab2;
  insert into public.subscriptions (cabinet_id, plan_code, status)
  values (v_cab, v_plan, 'actif'), (v_cab2, v_plan, 'actif');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values
    (v_ther, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'therapeute-parcours-type@exemple.test', '', now(), now(), now()),
    (v_ther2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'therapeute2-parcours-type@exemple.test', '', now(), now(), now()),
    (v_ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'anna-parcours-type@exemple.test', '', now(), now(), now()),
    (v_rm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'revendeur-parcours-type@exemple.test', '', now(), now(), now());

  insert into public.cabinet_members (cabinet_id, user_id, display_name)
  values (v_cab, v_ther, 'Thérapeute'), (v_cab2, v_ther2, 'Autre thérapeute');
  insert into public.reseller_members (reseller_id, user_id, role) values (v_rev, v_rm, 'staff');

  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, v_ua, 'Anna', 'A', 'Sommeil', 's', 'w', 'l', 'q', 'anna-parcours-type@exemple.test')
  returning id into v_fa;
  insert into public.patients (cabinet_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, archived_at)
  values (v_cab, 'Cleo', 'C', 'Sommeil', 's', 'w', 'l', 'q', now() - interval '2 days')
  returning id into v_fc;
  insert into public.patients (cabinet_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question)
  values (v_cab2, 'Dan', 'D', 'Tabac', 's', 'w', 'l', 'q')
  returning id into v_fd;

  insert into public.cabinet_programs (cabinet_id, label) values (v_cab, 'Sommeil') returning id into v_prog;
  insert into public.cabinet_programs (cabinet_id, label) values (v_cab2, 'Tabac') returning id into v_prog2;
  insert into public.cabinet_programs (cabinet_id, label, archived_at)
  values (v_cab, 'Ancien', now()) returning id into v_ancien;

  -- Anna a déjà un exercice, en position 4 : le parcours s'ajoute à la suite.
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, source, position)
  values (v_cab, v_fa, 'Ancrage', 'Exercice', 'Exercice', 'seance', 4);

  -- L'autre cabinet a son propre parcours.
  insert into public.exercices_du_programme (programme_id, cabinet_id, rang, titre, type_module)
  values (v_prog2, v_cab2, 0, 'Retarder la cigarette', 'Exercice') returning id into v_ailleurs;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ther::text, 'role', 'authenticated')::text, true);

  -- ── 1. La thérapeute règle le parcours de son programme ────────────────
  v_n := public.cabinet_regler_parcours_type(v_prog, jsonb_build_array(
    jsonb_build_object('titre', '  Respiration carrée ', 'type', 'Exercice',
                       'consigne', E'Inspirez quatre temps.\r\nBloquez quatre temps.\n\n  Expirez quatre temps.'),
    jsonb_build_object('titre', 'Trois lignes du soir', 'type', 'Écriture', 'consigne', ''),
    jsonb_build_object('titre', 'Le lieu sûr', 'type', 'Visualisation')
  ));
  if v_n <> 3 then raise exception 'ECHEC 1 : % exercices réglés au lieu de 3', v_n; end if;
  select count(*) into v_n from public.exercices_du_programme where programme_id = v_prog and cabinet_id = v_cab;
  if v_n <> 3 then raise exception 'ECHEC 1b : % exercices rangés dans le cabinet au lieu de 3', v_n; end if;
  select titre into v_t from public.exercices_du_programme where programme_id = v_prog and rang = 0;
  if v_t <> 'Respiration carrée' then raise exception 'ECHEC 1c : le titre n''est pas relu (« % »)', v_t; end if;

  -- ── 2. Régler remplace la liste entière ────────────────────────────────
  perform public.cabinet_regler_parcours_type(v_prog, '[{"titre": "Seul", "type": "Journal"}]'::jsonb);
  select count(*) into v_n from public.exercices_du_programme where programme_id = v_prog;
  if v_n <> 1 then raise exception 'ECHEC 2 : le réglage ajoute au lieu de remplacer (% exercices)', v_n; end if;
  perform public.cabinet_regler_parcours_type(v_prog, jsonb_build_array(
    jsonb_build_object('titre', 'Respiration carrée', 'type', 'Exercice',
                       'consigne', E'Inspirez quatre temps.\r\nBloquez quatre temps.\n\n  Expirez quatre temps.'),
    jsonb_build_object('titre', 'Trois lignes du soir', 'type', 'Écriture', 'consigne', ''),
    jsonb_build_object('titre', 'Le lieu sûr', 'type', 'Visualisation')
  ));
  select id into v_e1 from public.exercices_du_programme where programme_id = v_prog and rang = 0;
  select id into v_e2 from public.exercices_du_programme where programme_id = v_prog and rang = 1;
  select id into v_e3 from public.exercices_du_programme where programme_id = v_prog and rang = 2;

  -- ── 3. Les refus, dits ─────────────────────────────────────────────────
  begin
    perform public.cabinet_regler_parcours_type(v_prog, '[{"titre": "Écouter", "type": "Audio"}]'::jsonb);
    raise exception 'ECHEC 3 : un audio entre au parcours par défaut';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cabinet_regler_parcours_type(v_prog, '[{"titre": "   ", "type": "Exercice"}]'::jsonb);
    raise exception 'ECHEC 3b : un exercice sans titre passe';
  exception when invalid_parameter_value then null;
  end;
  select jsonb_agg(jsonb_build_object('titre', 'E' || g, 'type', 'Exercice')) into v_douze
    from generate_series(1, 13) g;
  begin
    perform public.cabinet_regler_parcours_type(v_prog, v_douze);
    raise exception 'ECHEC 3c : treize exercices passent';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cabinet_regler_parcours_type(v_prog,
      jsonb_build_array(jsonb_build_object('titre', 'Long', 'type', 'Exercice', 'consigne', repeat('x', 601))));
    raise exception 'ECHEC 3d : une consigne de 601 caractères passe';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cabinet_regler_parcours_type(v_ancien, '[]'::jsonb);
    raise exception 'ECHEC 3e : le parcours d''un programme retiré se modifie';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cabinet_regler_parcours_type(v_prog, '{"titre": "pas une liste"}'::jsonb);
    raise exception 'ECHEC 3f : un parcours qui n''est pas une liste passe';
  exception when invalid_parameter_value then null;
  end;
  -- Un refus n'a rien effacé.
  select count(*) into v_n from public.exercices_du_programme where programme_id = v_prog;
  if v_n <> 3 then raise exception 'ECHEC 3g : un réglage refusé a touché au parcours (% exercices)', v_n; end if;

  -- ── 4. La table ne s'écrit pas directement ─────────────────────────────
  begin
    insert into public.exercices_du_programme (programme_id, cabinet_id, rang, titre, type_module)
    values (v_prog, v_cab, 5, 'Direct', 'Exercice');
    raise exception 'ECHEC 4 : la table s''écrit sans passer par la fonction';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.exercices_du_programme set titre = 'Réécrit' where id = v_e1;
    raise exception 'ECHEC 4b : un exercice se réécrit directement';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.exercices_du_programme where id = v_e1;
    raise exception 'ECHEC 4c : un exercice s''efface directement';
  exception when insufficient_privilege then null;
  end;

  -- ── 5. Ajouter au parcours d'Anna ce qu'on a choisi, à la suite ────────
  v_n := public.cabinet_appliquer_parcours_type(v_prog, v_fa, array[v_e1, v_e2]);
  if v_n <> 2 then raise exception 'ECHEC 5 : % exercices ajoutés au lieu de 2', v_n; end if;
  select position, source::text, consigne into v_pos, v_src, v_c
    from public.patient_modules where patient_id = v_fa and title = 'Respiration carrée';
  if v_pos <> 5 or v_src <> 'programme' then
    raise exception 'ECHEC 5b : position % et source % au lieu de 5 et programme', v_pos, v_src;
  end if;
  if v_c -> 'steps' <> '["Inspirez quatre temps.", "Bloquez quatre temps.", "Expirez quatre temps."]'::jsonb then
    raise exception 'ECHEC 5c : la consigne devient %', v_c;
  end if;
  select position, consigne into v_pos, v_c from public.patient_modules where patient_id = v_fa and title = 'Trois lignes du soir';
  if v_pos <> 6 or v_c is not null then
    raise exception 'ECHEC 5d : sans consigne, position % et consigne %', v_pos, v_c;
  end if;
  select count(*) into v_n from public.patient_modules where patient_id = v_fa and title = 'Le lieu sûr';
  if v_n <> 0 then raise exception 'ECHEC 5e : un exercice non choisi a été ajouté'; end if;

  -- ── 6. Rejouer n'empile rien ───────────────────────────────────────────
  v_n := public.cabinet_appliquer_parcours_type(v_prog, v_fa, array[v_e1, v_e2]);
  if v_n <> 0 then raise exception 'ECHEC 6 : le parcours rejoué a doublé % exercices', v_n; end if;
  v_n := public.cabinet_appliquer_parcours_type(v_prog, v_fa, array[v_e1, v_e3]);
  if v_n <> 1 then raise exception 'ECHEC 6b : % ajouts au lieu du seul nouveau', v_n; end if;

  -- ── 7. Les refus de l'ajout ────────────────────────────────────────────
  begin
    perform public.cabinet_appliquer_parcours_type(v_prog, v_fc, array[v_e1]);
    raise exception 'ECHEC 7 : un parcours s''ajoute à un suivi clos';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cabinet_appliquer_parcours_type(v_prog, v_fd, array[v_e1]);
    raise exception 'ECHEC 7b : un parcours s''ajoute à la fiche d''un autre cabinet';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cabinet_appliquer_parcours_type(v_prog, v_fa, array[v_ailleurs]);
    raise exception 'ECHEC 7c : l''exercice d''un autre programme s''ajoute';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cabinet_appliquer_parcours_type(v_prog, v_fa, '{}'::uuid[]);
    raise exception 'ECHEC 7d : un ajout sans choix passe';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cabinet_appliquer_parcours_type(v_prog2, v_fa, array[v_ailleurs]);
    raise exception 'ECHEC 7e : le programme d''un autre cabinet s''applique';
  exception when insufficient_privilege then null;
  end;

  -- ── 8. L'autre thérapeute : rien à lire, rien à régler, rien à appliquer
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ther2::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.exercices_du_programme where programme_id = v_prog;
  if v_n <> 0 then raise exception 'ECHEC 8 : une autre thérapeute lit % exercices du programme', v_n; end if;
  select count(*) into v_n from public.exercices_du_programme where programme_id = v_prog2;
  if v_n <> 1 then raise exception 'ECHEC 8b : une thérapeute ne lit pas le parcours de son propre programme'; end if;
  begin
    perform public.cabinet_regler_parcours_type(v_prog, '[]'::jsonb);
    raise exception 'ECHEC 8c : une autre thérapeute efface le parcours';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cabinet_appliquer_parcours_type(v_prog, v_fd, array[v_e1]);
    raise exception 'ECHEC 8d : une autre thérapeute applique le programme d''un autre cabinet';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cabinet_appliquer_parcours_type(v_prog2, v_fa, array[v_ailleurs]);
    raise exception 'ECHEC 8e : une thérapeute ajoute son parcours à la fiche d''un autre cabinet';
  exception when invalid_parameter_value then null;
  end;

  -- ── 9. Le patient reçoit des exercices, pas leur modèle ────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ua::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.exercices_du_programme;
  if v_n <> 0 then raise exception 'ECHEC 9 : le patient lit % exercices de programme', v_n; end if;
  select count(*) into v_n from public.patient_modules where patient_id = v_fa and source = 'programme';
  if v_n <> 3 then raise exception 'ECHEC 9b : le patient voit % exercices ajoutés au lieu de 3', v_n; end if;
  begin
    perform public.cabinet_regler_parcours_type(v_prog, '[]'::jsonb);
    raise exception 'ECHEC 9c : un patient règle le parcours du programme';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cabinet_appliquer_parcours_type(v_prog, v_fa, array[v_e1]);
    raise exception 'ECHEC 9d : un patient s''ajoute des exercices';
  exception when insufficient_privilege then null;
  end;

  -- ── 10. Le revendeur ne lit rien ───────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rm::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.exercices_du_programme;
  if v_n <> 0 then raise exception 'ECHEC 10 : le revendeur lit % exercices de programme', v_n; end if;

  -- ── 11. Rien pour le rôle anonyme ──────────────────────────────────────
  set local role anon;
  begin
    perform count(*) from public.exercices_du_programme;
    raise exception 'ECHEC 11 : le rôle anonyme lit les parcours';
  exception when insufficient_privilege then null;
  end;

  -- ── 12. Le programme effacé emporte son parcours ───────────────────────
  set local role postgres;
  delete from public.cabinet_programs where id = v_prog;
  select count(*) into v_n from public.exercices_du_programme where programme_id = v_prog;
  if v_n <> 0 then raise exception 'ECHEC 12 : le parcours survit à son programme'; end if;
  select count(*) into v_n from public.patient_modules where patient_id = v_fa and source = 'programme';
  if v_n <> 3 then raise exception 'ECHEC 12b : effacer le programme a retiré des exercices au patient'; end if;

  raise exception 'REUSSITE : le parcours d''un programme se règle en entier par son cabinet seul, avec des refus dits ; il ne s''écrit pas directement ; il s''ajoute par choix au parcours d''un suivi en cours, à la suite, consigne en étapes, sans doublon ; ni une autre thérapeute, ni le patient, ni le revendeur, ni l''anonyme ne le lisent ou ne s''en servent. (Rien ne persiste.)';
end $$;
