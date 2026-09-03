-- ============================================================================
-- Épreuve de la porte du cabinet.
--
-- L'écran du revendeur promet : « La praticienne devient propriétaire de ses
-- données : vous n'y entrez pas. » Cette épreuve vérifie que le schéma tient
-- la promesse, parce qu'une promesse tenue par la seule interface n'en est
-- pas une.
--
--   1. Cabinet sans membre : le revendeur invite. C'est l'amorçage.
--   2. Cabinet tenu par sa praticienne : le revendeur ne peut plus inviter —
--      donc plus se faire inviter lui-même, ce qui lui ouvrait tout le dossier.
--   3. La praticienne invite sa consœur : l'offre « plusieurs praticiennes »
--      n'est plus une promesse en l'air.
--   4. Et elle n'invite que chez elle.
--
--   psql "$DATABASE_URL" -f supabase/tests/invitations.sql
--
-- Se termine par une exception : tout est annulé, rien n'est écrit.
-- ============================================================================

do $$
declare
  v_rev      uuid;
  v_res      uuid;
  v_prat     uuid;
  v_cab_tenu uuid;
  v_cab_vide uuid;
  v_refus    boolean;
begin
  select r.user_id, r.reseller_id into v_rev, v_res from public.reseller_members r limit 1;
  select m.cabinet_id, m.user_id into v_cab_tenu, v_prat from public.cabinet_members m limit 1;
  if v_rev is null or v_prat is null then
    raise exception 'ECHEC : il faut un revendeur et un cabinet tenu par sa praticienne';
  end if;
  if v_rev = v_prat then
    raise exception 'ECHEC : le revendeur et la praticienne sont le même compte, l''épreuve ne prouverait rien';
  end if;

  insert into public.cabinets (reseller_id, name, slug, tagline, branding)
  values (v_res, 'Cabinet éprouve', 'cabinet-eprouve-' || substr(md5(random()::text), 1, 6),
          'Espace thérapie', '{}'::jsonb)
  returning id into v_cab_vide;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role', 'authenticated')::text, true);

  -- 1. L'amorçage.
  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
  values (v_cab_vide, 'premiere@exemple.fr', 'owner', now() + interval '30 days');

  -- 2. La porte, une fois le cabinet tenu.
  v_refus := false;
  begin
    insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
    values (v_cab_tenu, 'revendeur-malin@exemple.fr', 'owner', now() + interval '30 days');
  exception when others then v_refus := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_refus then
    raise exception 'ECHEC : le revendeur peut encore se faire inviter dans un cabinet qui a sa praticienne';
  end if;

  -- 3. La praticienne invite chez elle.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_prat, 'role', 'authenticated')::text, true);
  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
  values (v_cab_tenu, 'consoeur@exemple.fr', 'therapist', now() + interval '30 days');

  -- 4. Et nulle part ailleurs.
  v_refus := false;
  begin
    insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
    values (v_cab_vide, 'ailleurs@exemple.fr', 'owner', now() + interval '30 days');
  exception when others then v_refus := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_refus then
    raise exception 'ECHEC : une praticienne invite dans un cabinet qui n''est pas le sien';
  end if;

  raise exception 'REUSSITE : amorçage possible, porte fermée ensuite, praticienne autonome et bornée à son cabinet';
end $$;
