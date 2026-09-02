-- ============================================================================
-- La vitrine d'un cabinet : ce qu'un visiteur non connecté peut en lire.
--
--   anonyme → le nom, le sur-titre et les couleurs, par cabinet_vitrine()
--           → rien d'autre : ni identifiant, ni revendeur, ni réglage
--           → rien du tout sur un identifiant qui n'existe pas
--           → toujours rien par une lecture directe de public.cabinets
--
-- Un seul bloc DO terminé par RAISE EXCEPTION 'REUSSITE …' : rien ne persiste.
--
--   psql "$DATABASE_URL" -f supabase/tests/vitrine.sql
-- ============================================================================

do $$
declare
  v_rev uuid; v_org uuid; v_cab uuid; v jsonb; n integer;
begin
  select m.user_id, m.reseller_id into v_rev, v_org from public.reseller_members m limit 1;
  if v_rev is null then raise exception 'Aucun compte revendeur.'; end if;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role','authenticated')::text, true);
  insert into public.cabinets (reseller_id, name, slug, tagline, branding)
  values (v_org, 'Cabinet Vitrine', 'cabinet-vitrine', 'Hypnothérapie',
          '{"accent":"#2F6F62","accentHover":"#275C51","accentDeep":"#1F4A41","dark":"#1B2A26","logo":"CV"}'::jsonb)
  returning id into v_cab;

  -- Un visiteur : pas de session, pas de jeton.
  perform set_config('role','none',true);
  perform set_config('role','anon',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);

  -- 1. La vitrine se lit, majuscules comprises.
  v := public.cabinet_vitrine('Cabinet-Vitrine');
  if v is null then raise exception 'ECHEC : la vitrine ne rend rien pour un identifiant qui existe'; end if;
  if v->>'name' is distinct from 'Cabinet Vitrine' then raise exception 'ECHEC : nom rendu = %', v->>'name'; end if;
  if v->'branding'->>'accent' is distinct from '#2F6F62' then raise exception 'ECHEC : couleurs non rendues'; end if;

  -- 2. Elle ne rend QUE ces trois clés.
  select count(*) into n from jsonb_object_keys(v) k where k not in ('name','tagline','branding');
  if n <> 0 then raise exception 'FUITE : la vitrine rend % clé(s) de trop', n; end if;

  -- 3. Un identifiant inconnu ne rend rien.
  if public.cabinet_vitrine('cabinet-qui-nexiste-pas') is not null then
    raise exception 'ECHEC : un identifiant inconnu rend quelque chose';
  end if;

  -- 4. La table, elle, reste fermée : la fonction est la seule porte. Le rôle
  -- anonyme n'a même pas le droit de lecture — l'erreur attendue est donc un
  -- refus de privilège, pas un résultat vide.
  begin
    select count(*) into n from public.cabinets;
    if n <> 0 then raise exception 'FUITE : un visiteur lit % ligne(s) de public.cabinets', n; end if;
  exception
    when insufficient_privilege then null;
  end;

  raise exception 'REUSSITE : la vitrine rend le nom, le sur-titre et les couleurs, rien d''autre, et seulement pour un identifiant qui existe.';
end $$;
