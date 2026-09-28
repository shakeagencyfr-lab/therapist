-- ============================================================================
-- L'assiduité du portefeuille ne compte que ce qui se fait (0046).
--
--   un module « Audio » ou « Échelle »  → hors du calcul, fait ou non
--   un module retiré du parcours (0045) → hors du calcul
--   le parcours d'une fiche close       → hors du calcul
--   le reste                            → compté, comme avant
--
-- Trois fiches actives (le seuil d'anonymat de 0035), et de quoi faire
-- échouer l'ancien calcul : 2 tâches faites sur 4, mais 2 lignes faites sur
-- 9 si l'on compte tout.
--
-- Un seul bloc DO qui se termine par RAISE EXCEPTION 'REUSSITE …' : rien
-- ne persiste. Un ECHEC lève avant, avec la raison.
--
--   psql "$DATABASE_URL" -f supabase/tests/assiduite_taches.sql
-- ============================================================================

do $$
declare
  v_plan text;
  v_org uuid; v_rev uuid; v_cab uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_close uuid;
  v_moyenne numeric; v_ancienne numeric;
begin
  -- Un revendeur réel, et SON organisation : le cabinet doit être à lui.
  select m.user_id, m.reseller_id into v_rev, v_org from public.reseller_members m limit 1;
  if v_rev is null then raise exception 'Aucun compte revendeur.'; end if;

  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;

  -- Les données se posent sous le rôle du propriétaire : l'épreuve porte sur
  -- le calcul, pas sur les politiques d'écriture (éprouvées ailleurs).
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

  -- Premier patient : une tâche faite, une non faite, un audio, une échelle.
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, done_at) values
    (v_cab, v_p1, 'Trois respirations', '', 'Exercice', 0, now()),
    (v_cab, v_p1, 'Trois lignes', '', 'Écriture', 1, null),
    (v_cab, v_p1, 'Retour au calme', '', 'Audio', 2, null),
    (v_cab, v_p1, 'Note du soir', '', 'Échelle', 3, null);
  -- Deuxième : une tâche faite.
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, done_at) values
    (v_cab, v_p2, 'Ancrage', '', 'Exercice', 0, now());
  -- Troisième : une tâche non faite, et une retirée du parcours.
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, done_at, archived_at) values
    (v_cab, v_p3, 'Journal du soir', '', 'Journal', 0, null, null),
    (v_cab, v_p3, 'Ancien exercice', '', 'Exercice', 1, null, now());
  -- La fiche close : deux tâches jamais faites, puis le suivi se termine.
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, done_at) values
    (v_cab, v_close, 'Premier pas', '', 'Exercice', 0, null),
    (v_cab, v_close, 'Deuxième pas', '', 'Exercice', 1, null);
  update public.patients set archived_at = now() where id = v_close;

  -- L'ancien calcul, pour s'assurer que l'épreuve le distingue du nouveau.
  select round(avg(case when done_at is not null then 1.0 else 0.0 end) * 100, 1)
    into v_ancienne from public.patient_modules where cabinet_id = v_cab;
  if v_ancienne = 50.0 then
    raise exception 'ECHEC : le jeu de données ne distingue pas les deux calculs (%).', v_ancienne;
  end if;

  -- ---- Le revendeur lit son portefeuille ---------------------------------
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role','authenticated')::text, true);

  select o.adherence_avg into v_moyenne
  from public.reseller_cabinet_overview() o where o.cabinet_id = v_cab;

  if v_moyenne is null then
    raise exception 'ECHEC : aucune assiduité rendue pour trois fiches actives.';
  end if;
  if v_moyenne <> 50.0 then
    raise exception 'ECHEC : assiduité % %%, attendu 50,0 %% (2 tâches faites sur 4 ; l''ancien calcul donnait %).',
      v_moyenne, v_ancienne;
  end if;

  perform set_config('role','none',true);
  raise exception 'REUSSITE : l''assiduité du portefeuille ne compte que les tâches en cours (50,0 %%, contre % %% avant).', v_ancienne;
end
$$;
