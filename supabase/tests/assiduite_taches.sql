-- ============================================================================
-- L'assiduité du portefeuille : les jours faits, sur les seules tâches (0046,
-- 0052).
--
--   un module « Audio » ou « Échelle »  → hors du calcul, fait ou non
--   un module retiré du parcours (0045) → hors du calcul
--   le parcours d'une fiche close       → hors du calcul
--   une tâche                           → ses jours faits sur ses jours
--                                         possibles de la semaine (0051)
--
-- Trois fiches actives (le seuil d'anonymat de 0035) :
--   A  confiée il y a 10 jours, faite hier et avant-hier      → 2 sur 7
--   B  confiée il y a 10 jours, jamais faite                  → 0 sur 7
--   C  confiée il y a 10 jours, faite les 7 derniers jours    → 7 sur 7
--      (aujourd'hui compris : la fenêtre finit aujourd'hui)
--   D  confiée aujourd'hui, pas encore faite                  → 0 sur 0
-- Soit 9 jours sur 21 : 42,9 %. L'ancien calcul (« fait au moins une fois »)
-- donnait 2 tâches sur 4, 50 %.
--
-- Un seul bloc DO qui se termine par RAISE EXCEPTION 'REUSSITE …' : rien
-- ne persiste. Un ECHEC lève avant, avec la raison.
-- ============================================================================

do $$
declare
  v_plan text;
  v_org uuid; v_rev uuid; v_cab uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_close uuid;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_audio uuid; v_retire uuid;
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_il_y_a_10 timestamptz := now() - interval '10 days';
  v_moyenne numeric;
  i int;
begin
  -- Un revendeur réel, et SON organisation : le cabinet doit être à lui.
  select m.user_id, m.reseller_id into v_rev, v_org from public.reseller_members m limit 1;
  if v_rev is null then raise exception 'Aucun compte revendeur.'; end if;

  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_org, 'Cabinet Test Assiduité', 'cabinet-test-assiduite', 'Espace thérapie') returning id into v_cab;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif');

  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'Un U.', 'UU', '', '', '', '', '') returning id into v_p1;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'Deux D.', 'DD', '', '', '', '', '') returning id into v_p2;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'Trois T.', 'TT', '', '', '', '', '') returning id into v_p3;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'Close C.', 'CC', '', '', '', '', '') returning id into v_close;

  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, done_at, created_at)
  values (v_cab, v_p1, 'Trois respirations', '', 'Exercice', 0, now() - interval '1 day', v_il_y_a_10)
  returning id into v_a;
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, done_at, created_at)
  values (v_cab, v_p1, 'Trois lignes', '', 'Écriture', 1, null, v_il_y_a_10)
  returning id into v_b;
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, done_at, created_at)
  values (v_cab, v_p1, 'Retour au calme', '', 'Audio', 2, now(), v_il_y_a_10)
  returning id into v_audio;
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, done_at, created_at)
  values (v_cab, v_p2, 'Ancrage', '', 'Exercice', 0, now(), v_il_y_a_10)
  returning id into v_c;
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, done_at, created_at)
  values (v_cab, v_p3, 'Journal du soir', '', 'Journal', 0, null, now())
  returning id into v_d;
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, done_at, created_at, archived_at)
  values (v_cab, v_p3, 'Ancien exercice', '', 'Exercice', 1, now(), v_il_y_a_10, now())
  returning id into v_retire;
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, done_at, created_at) values
    (v_cab, v_close, 'Premier pas', '', 'Exercice', 0, null, v_il_y_a_10),
    (v_cab, v_close, 'Deuxième pas', '', 'Exercice', 1, null, v_il_y_a_10);
  update public.patients set archived_at = now() where id = v_close;

  -- Les jours faits (posés comme la base les pose : un jour de Paris par ligne).
  insert into public.module_completions (module_id, patient_id, cabinet_id, jour) values
    (v_a, v_p1, v_cab, v_auj - 1),
    (v_a, v_p1, v_cab, v_auj - 2),
    (v_audio, v_p1, v_cab, v_auj),
    (v_retire, v_p3, v_cab, v_auj);
  for i in 0..6 loop
    insert into public.module_completions (module_id, patient_id, cabinet_id, jour)
    values (v_c, v_p2, v_cab, v_auj - i);
  end loop;

  -- ---- Le revendeur lit son portefeuille ---------------------------------
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role','authenticated')::text, true);

  select o.adherence_avg into v_moyenne
  from public.reseller_cabinet_overview() o where o.cabinet_id = v_cab;

  if v_moyenne is null then
    raise exception 'ECHEC : aucune assiduité rendue pour trois fiches actives.';
  end if;
  if v_moyenne = 50.0 then
    raise exception 'ECHEC : l''assiduité compte encore les tâches « faites une fois » (50,0 %%).';
  end if;
  if v_moyenne <> 42.9 then
    raise exception 'ECHEC : assiduité % %%, attendu 42,9 %% (9 jours faits sur 21 possibles).', v_moyenne;
  end if;

  perform set_config('role','none',true);
  raise exception 'REUSSITE : l''assiduité du portefeuille compte les jours faits des seules tâches en cours (9 sur 21, 42,9 %%).';
end
$$;
