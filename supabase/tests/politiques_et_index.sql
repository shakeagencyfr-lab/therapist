-- 0050 éprouvée contre la vraie base : auth.uid() une fois par requête, et un
-- index sous chaque clé étrangère.
--
-- Deux gardes de structure, qui valent pour toute migration future :
--   - aucune politique du schéma public n'appelle auth.uid(), auth.jwt(),
--     auth.role() ni current_setting() hors d'un `(select …)` ;
--   - aucune clé étrangère du schéma public n'est sans index qui la couvre.
-- Puis la preuve que les quatre politiques réécrites disent la même chose
-- qu'avant : chacun voit ses lignes, et seulement les siennes.
--
-- Le bloc fabrique ce dont il a besoin et ANNULE tout par l'exception finale.
do $$
declare
  v_rev uuid; v_rev2 uuid; v_cab uuid; v_plan text;
  v_ua uuid := gen_random_uuid(); v_ub uuid := gen_random_uuid();
  v_rm uuid := gen_random_uuid(); v_rx uuid := gen_random_uuid();
  v_fa uuid; v_fb uuid;
  v_n int; v_liste text;
  v_p256 text := repeat('B', 87);
  v_auth text := repeat('a', 22);
begin
  -- ── 1. Les politiques : auth.uid() jamais nu ────────────────────────────
  --
  -- pg_policies rend `(select auth.uid())` sous la forme
  -- `( SELECT auth.uid() AS uid)`. On retire ces enveloppes ; ce qui reste
  -- d'appel est évalué ligne par ligne.
  select string_agg(format('%s.%s « %s »', schemaname, tablename, policyname), ', ')
    into v_liste
    from pg_policies
   where schemaname = 'public'
     and regexp_replace(
           coalesce(qual, '') || ' ' || coalesce(with_check, ''),
           '\( SELECT (auth\.(uid|jwt|role)\(\)|current_setting\([^)]*\)(::[a-z]+)?) AS [a-z_]+\)',
           '', 'g'
         ) ~ '(auth\.(uid|jwt|role)\(\)|current_setting\()';
  if v_liste is not null then
    raise exception 'ECHEC 1 : politiques qui réévaluent l''appelant à chaque ligne : %', v_liste;
  end if;

  -- ── 2. Les clés étrangères : chacune a son index ───────────────────────
  --
  -- Un index couvre une clé quand ses premières colonnes sont celles de la
  -- clé, dans n'importe quel ordre.
  select string_agg(format('%s (%s)', c.conrelid::regclass, c.conname), ', ')
    into v_liste
    from pg_constraint c
   where c.contype = 'f'
     and c.connamespace = 'public'::regnamespace
     and not exists (
       select 1
         from pg_index i
        where i.indrelid = c.conrelid
          and (
            select array_agg(k order by k)
              from unnest((string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)]) k
          ) = (select array_agg(k order by k) from unnest(c.conkey) k)
     );
  if v_liste is not null then
    raise exception 'ECHEC 2 : clés étrangères sans index : %', v_liste;
  end if;

  -- ── Les données de l'épreuve ────────────────────────────────────────────
  select id into v_rev from public.resellers order by created_at limit 1;
  if v_rev is null then raise exception 'RIEN À ÉPROUVER : aucun revendeur en base'; end if;
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Cabinet charge', 'cab-charge-t', 'x') returning id into v_cab;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values
    (v_ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'patiente-a-charge@exemple.test', '', now(), now(), now()),
    (v_ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'patiente-b-charge@exemple.test', '', now(), now(), now()),
    (v_rm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'revendeur-charge@exemple.test', '', now(), now(), now()),
    (v_rx, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'autre-revendeur-charge@exemple.test', '', now(), now(), now());

  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, v_ua, 'Anna', 'A', 'p', 's', 'w', 'l', 'q', 'patiente-a-charge@exemple.test')
  returning id into v_fa;
  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, v_ub, 'Bea', 'B', 'p', 's', 'w', 'l', 'q', 'patiente-b-charge@exemple.test')
  returning id into v_fb;

  insert into public.push_subscriptions (patient_id, cabinet_id, user_id, endpoint, p256dh, auth)
  values (v_fa, v_cab, v_ua, 'https://fcm.googleapis.com/fcm/send/epreuve-charge-a', v_p256, v_auth),
         (v_fb, v_cab, v_ub, 'https://fcm.googleapis.com/fcm/send/epreuve-charge-b', v_p256, v_auth);

  insert into public.resellers (name, slug) values ('Autre enseigne', 'autre-enseigne-charge-t')
  returning id into v_rev2;
  insert into public.reseller_members (reseller_id, user_id, role) values (v_rev, v_rm, 'staff');
  insert into public.reseller_members (reseller_id, user_id, role) values (v_rev2, v_rx, 'owner');

  -- ── 3. Anna : sa fiche, ses téléphones ─────────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ua::text, 'role', 'authenticated')::text, true);

  select count(*) into v_n from public.patients where id in (v_fa, v_fb);
  if v_n <> 1 then raise exception 'ECHEC 3 : Anna voit % fiches au lieu de la sienne', v_n; end if;
  select count(*) into v_n from public.patients where id = v_fa;
  if v_n <> 1 then raise exception 'ECHEC 3b : Anna ne voit plus sa propre fiche'; end if;

  select count(*) into v_n from public.push_subscriptions where cabinet_id = v_cab;
  if v_n <> 1 then raise exception 'ECHEC 4 : Anna voit % téléphones au lieu du sien', v_n; end if;

  -- 5. Elle ne retire pas le téléphone de Bea, elle retire le sien.
  delete from public.push_subscriptions where user_id = v_ub;
  delete from public.push_subscriptions where user_id = v_ua;

  set local role postgres;
  select count(*) into v_n from public.push_subscriptions where user_id = v_ub;
  if v_n <> 1 then raise exception 'ECHEC 5 : Anna a retiré le téléphone de Bea'; end if;
  select count(*) into v_n from public.push_subscriptions where user_id = v_ua;
  if v_n <> 0 then raise exception 'ECHEC 5b : Anna n''a pas pu retirer son propre téléphone'; end if;

  -- 6. Une fiche close ne s'ouvre plus à son patient.
  update public.patients set archived_at = now() where id = v_fa;
  set local role authenticated;
  select count(*) into v_n from public.patients where id = v_fa;
  if v_n <> 0 then raise exception 'ECHEC 6 : Anna lit encore une fiche close'; end if;

  -- ── 7. Les revendeurs : chacun ses appartenances ───────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rm::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.reseller_members where user_id = v_rm;
  if v_n <> 1 then raise exception 'ECHEC 7 : un membre ne voit pas sa propre appartenance'; end if;
  select count(*) into v_n from public.reseller_members where reseller_id = v_rev2;
  if v_n <> 0 then raise exception 'ECHEC 7b : un membre voit l''équipe d''une autre enseigne'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rx::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.reseller_members where reseller_id = v_rev;
  if v_n <> 0 then raise exception 'ECHEC 7c : une autre enseigne voit les membres de la première'; end if;

  -- 8. Une patiente n'a aucune appartenance à voir.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ub::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.reseller_members;
  if v_n <> 0 then raise exception 'ECHEC 8 : une patiente lit % appartenances de revendeur', v_n; end if;

  raise exception 'REUSSITE : aucune politique ne réévalue l''appelant à chaque ligne, chaque clé étrangère a son index, et les quatre politiques réécrites gardent chacun à ses lignes';
end $$;
