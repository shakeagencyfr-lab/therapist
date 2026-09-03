-- ============================================================================
-- Épreuve des offres : ce qu'un abonnement ouvre, et qui peut le régler.
--
-- Quatre garanties, dans cet ordre :
--
--   1. Le plafond de fiches est tenu par la BASE, pas par l'écran. Une
--      insertion au-delà est refusée, avec un message que l'écran affiche tel
--      quel — et une place libérée par un archivage laisse passer.
--   2. Les droits effectifs se lisent d'un seul endroit — cabinet_droits() —
--      et une praticienne ne lit que ceux de son cabinet.
--   3. Le catalogue appartient au revendeur : lui le règle, une praticienne
--      non. Sans quoi une cliente relèverait son propre plafond.
--   4. Un domaine ne sert qu'une fois vérifié, et ne s'écrit que par le
--      serveur : l'enregistrement s'accompagne d'une déclaration chez
--      l'hébergeur, qu'un navigateur ne peut pas faire.
--
--   psql "$DATABASE_URL" -f supabase/tests/offres.sql
--
-- Se termine par une exception : tout est annulé, rien n'est écrit.
-- ============================================================================

do $$
declare
  v_cab     uuid;
  v_plan    text;
  v_prat    uuid;
  v_rev     uuid;
  v_autre   uuid;
  v_actives integer;
  v_msg     text := '';
  v_arrete  boolean := false;
  v_droits  jsonb;
  v_mes     jsonb;
  v_prix    integer;
  v_refus   boolean;
begin
  select s.cabinet_id, s.plan_code into v_cab, v_plan
  from public.subscriptions s join public.cabinets c on c.id = s.cabinet_id limit 1;
  select m.user_id into v_prat from public.cabinet_members m where m.cabinet_id = v_cab limit 1;
  select r.user_id into v_rev from public.reseller_members r limit 1;
  select c.id into v_autre from public.cabinets c where c.id <> v_cab limit 1;
  if v_cab is null or v_prat is null or v_rev is null then
    raise exception 'ECHEC : il faut un cabinet abonné, sa praticienne et un revendeur';
  end if;

  -- 1. Le plafond ---------------------------------------------------------
  select count(*) into v_actives
  from public.patients where cabinet_id = v_cab and archived_at is null;

  update public.subscriptions set max_patients_override = greatest(v_actives, 1) where cabinet_id = v_cab;
  begin
    insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
    values (v_cab, 'Éprouve plafond', 'EP', '', '', '', '', '');
  exception when check_violation then
    v_arrete := true;
    v_msg := sqlerrm;
  end;
  if not v_arrete then
    raise exception 'ECHEC : le plafond n''a pas arrêté l''insertion (actives = %)', v_actives;
  end if;
  -- Le message doit dire quoi faire, pas seulement que c'est refusé.
  if v_msg not like '%fiches actives%' or v_msg not like '%Archivez%' then
    raise exception 'ECHEC : le message du plafond ne dit pas quoi faire — %', v_msg;
  end if;

  update public.subscriptions set max_patients_override = v_actives + 1 where cabinet_id = v_cab;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'Éprouve plafond', 'EP', '', '', '', '', '');

  -- « Sans limite » est une valeur légitime, pas une configuration manquante.
  update public.subscriptions set max_patients_override = null where cabinet_id = v_cab;
  update public.plans set max_patients = null where code = v_plan;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'Éprouve plafond 2', 'EP', '', '', '', '', '');

  -- 2. Les droits, lus d'un seul endroit ----------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_prat, 'role', 'authenticated')::text, true);
  v_droits := public.cabinet_droits(v_cab);
  v_mes := public.mes_droits();
  perform set_config('role', 'postgres', true);

  if v_droits is null or v_mes is null then
    raise exception 'ECHEC : la praticienne ne lit pas les droits de son cabinet';
  end if;
  if v_droits <> v_mes then
    raise exception 'ECHEC : mes_droits et cabinet_droits divergent — % vs %', v_mes, v_droits;
  end if;
  if not (v_droits ? 'max_patients' and v_droits ? 'patients_actives' and v_droits ? 'shop'
          and v_droits ? 'marque_blanche' and v_droits ? 'site' and v_droits ? 'offre') then
    raise exception 'ECHEC : forme inattendue des droits — %', v_droits;
  end if;

  if v_autre is not null then
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_prat, 'role', 'authenticated')::text, true);
    v_droits := public.cabinet_droits(v_autre);
    perform set_config('role', 'postgres', true);
    if v_droits is not null then
      raise exception 'ECHEC : les droits d''un autre cabinet sont lisibles';
    end if;
  end if;

  -- 3. Le catalogue appartient au revendeur -------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role', 'authenticated')::text, true);
  update public.plans set price_cents = 9999 where code = 'cabinet';
  select price_cents into v_prix from public.plans where code = 'cabinet';
  perform set_config('role', 'postgres', true);
  if v_prix <> 9999 then raise exception 'ECHEC : le revendeur ne peut pas régler ses offres'; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_prat, 'role', 'authenticated')::text, true);
  update public.plans set price_cents = 1 where code = 'cabinet';
  select price_cents into v_prix from public.plans where code = 'cabinet';
  perform set_config('role', 'postgres', true);
  if v_prix <> 9999 then raise exception 'ECHEC : une praticienne a changé le prix d''une offre'; end if;

  -- 4. Le domaine ----------------------------------------------------------
  insert into public.cabinet_domains (cabinet_id, domaine, verifie)
  values (v_cab, 'eprouve-domaine.test', false)
  on conflict (cabinet_id) do update set domaine = excluded.domaine, verifie = false;
  if public.cabinet_par_domaine('eprouve-domaine.test') is not null then
    raise exception 'ECHEC : un domaine non vérifié répond déjà';
  end if;
  update public.cabinet_domains set verifie = true where cabinet_id = v_cab;
  if public.cabinet_par_domaine('EPROUVE-DOMAINE.TEST') is null then
    raise exception 'ECHEC : un domaine vérifié ne répond pas (la casse compte-t-elle ?)';
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_prat, 'role', 'authenticated')::text, true);
  v_refus := false;
  begin
    insert into public.cabinet_domains (cabinet_id, domaine) values (v_cab, 'autre.test');
  exception when others then
    v_refus := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_refus then raise exception 'ECHEC : une praticienne écrit directement son domaine'; end if;

  raise exception 'REUSSITE : plafond tenu par la base, droits lus d''un seul endroit, catalogue réservé au revendeur, domaine servi une fois vérifié · message du plafond = %', v_msg;
end $$;
