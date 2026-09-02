-- ============================================================================
-- La marque, réglée par la praticienne elle-même.
--
-- L'onglet « Marque » de l'espace cabinet écrit la même ligne que l'éditeur
-- du revendeur : public.cabinets. Ce test vérifie que la praticienne y a bien
-- droit sur SON cabinet, et seulement sur le sien — et qu'elle ne peut pas
-- s'en servir pour changer de revendeur.
--
--   praticienne → publie nom, sur-titre et couleurs de son cabinet
--               → ne touche pas au cabinet d'à côté
--               → ne peut pas transférer son cabinet à un autre revendeur
--
-- Un seul bloc DO terminé par RAISE EXCEPTION 'REUSSITE …' : rien ne persiste.
--
--   psql "$DATABASE_URL" -f supabase/tests/marque_du_cabinet.sql
-- ============================================================================

do $$
declare
  v_rev uuid; v_org uuid; v_cab uuid; v_autre uuid; v_nom text; n integer;
begin
  select m.user_id, m.reseller_id into v_rev, v_org from public.reseller_members m limit 1;
  if v_rev is null then raise exception 'Aucun compte revendeur.'; end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('bbbb0000-0000-4000-8000-00000000ba01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','test-marque@exemple.fr','',now(),now(),now());

  -- Le revendeur ouvre deux cabinets et invite la praticienne dans le premier.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role','authenticated')::text, true);
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_org, 'Cabinet Marque', 'cabinet-marque', 'Espace thérapie') returning id into v_cab;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_org, 'Cabinet Voisin', 'cabinet-voisin', 'Espace thérapie') returning id into v_autre;
  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at) values (v_cab, 'test-marque@exemple.fr', 'owner', now() + interval '1 day');

  -- La praticienne se connecte et devient propriétaire du premier.
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"bbbb0000-0000-4000-8000-00000000ba01","role":"authenticated"}',true);
  perform public.claim_access();

  -- 1. Elle publie sa marque.
  update public.cabinets
     set name = 'Cabinet Laetitia', tagline = 'Hypnothérapie',
         branding = '{"accent":"#2F6F62","accentHover":"#275C51","accentDeep":"#1F4A41","dark":"#1B2A26","logo":"CL"}'::jsonb
   where id = v_cab;
  if not found then raise exception 'ECHEC : la praticienne ne peut pas publier la marque de son cabinet'; end if;

  select name into v_nom from public.cabinets where id = v_cab;
  if v_nom is distinct from 'Cabinet Laetitia' then raise exception 'ECHEC : la marque publiée ne se relit pas (%)', v_nom; end if;

  -- 2. Le cabinet d'à côté ne bouge pas : la RLS ne rend aucune ligne à écrire.
  update public.cabinets set name = 'Détourné' where id = v_autre;
  select count(*) into n from public.cabinets where id = v_autre;
  if n <> 0 then raise exception 'FUITE : la praticienne voit le cabinet voisin'; end if;

  -- 3. Elle ne peut pas emmener son cabinet chez un autre revendeur.
  begin
    update public.cabinets set reseller_id = gen_random_uuid() where id = v_cab;
    raise exception 'FUITE : le transfert de cabinet a été accepté';
  exception
    when raise_exception then
      if sqlerrm like 'FUITE%' then raise; end if;
    when others then null;
  end;

  raise exception 'REUSSITE : la praticienne publie la marque de son cabinet, ne touche pas au voisin, et ne peut pas le transférer.';
end $$;
