-- ============================================================================
-- Ouvrir un cabinet depuis l'espace revendeur, sous les droits réels.
--
-- Rejoue exactement les écritures du bouton « Ouvrir un cabinet »
-- (src/reseller/useReseller.ts, ouvrirCabinet) : la fiche, son offre en
-- essai, l'invitation de la praticienne. Puis vérifie que le cabinet
-- apparaît au portefeuille, et que le revendeur n'en est PAS devenu membre
-- — c'est ce qui le tient à l'écart des patients.
--
-- Un seul bloc DO qui se termine par RAISE EXCEPTION 'REUSSITE …' : la
-- levée annule tout ce que le bloc a écrit. Rien ne persiste.
--
--   psql "$DATABASE_URL" -f supabase/tests/ouverture_cabinet.sql
-- ============================================================================

do $$
declare
  v_rev uuid; v_org uuid; v_offre text; v_cab uuid; n integer;
begin
  select m.user_id, m.reseller_id into v_rev, v_org from public.reseller_members m limit 1;
  if v_rev is null then raise exception 'Aucun compte revendeur.'; end if;
  select p.code into v_offre from public.plans p order by p.position limit 1;
  if v_offre is null then raise exception 'Aucune offre au catalogue.'; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rev, 'role', 'authenticated')::text, true);

  -- 1. La fiche du cabinet.
  insert into public.cabinets (reseller_id, name, slug, tagline, branding)
  values (v_org, 'Cabinet Test Ouverture', 'cabinet-test-ouverture', 'Espace thérapie',
          '{"accent":"#A17A45","accentHover":"#856239","accentDeep":"#6E5230","dark":"#33291C","logo":"CT"}'::jsonb)
  returning id into v_cab;

  -- 2. Son offre, en essai de quatorze jours.
  insert into public.subscriptions (cabinet_id, plan_code, status, trial_ends_at)
  values (v_cab, v_offre, 'essai', now() + interval '14 days');

  -- 3. L'invitation de la praticienne.
  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
  values (v_cab, 'test-ouverture@exemple.fr', 'owner', now() + interval '30 days');

  -- 4. Le cabinet ouvert apparaît au portefeuille de son revendeur.
  select count(*) into n from public.reseller_cabinet_overview() o where o.cabinet_id = v_cab;
  if n <> 1 then raise exception 'ECHEC : le cabinet ouvert n''apparaît pas au portefeuille (% ligne(s))', n; end if;

  -- 5. Le revendeur n'est membre de rien : il ouvre, il n'habite pas.
  select count(*) into n from public.cabinet_members m where m.cabinet_id = v_cab;
  if n <> 0 then raise exception 'FUITE : le revendeur est devenu membre du cabinet qu''il ouvre'; end if;

  raise exception 'REUSSITE : le revendeur ouvre un cabinet (fiche, offre en essai, invitation), le voit à son portefeuille, et n''en est pas membre.';
end $$;
