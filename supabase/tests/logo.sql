-- ============================================================================
-- Le logo d'un cabinet : public à la lecture, fermé au dépôt.
--
--   le compartiment  est public, plafonné à 1 Mo, images seules
--   praticienne A    peut écrire dans le dossier de SON cabinet
--                    ne peut pas écrire dans celui du cabinet B
--
-- La deuxième partie éprouve le prédicat des politiques de storage.objects —
-- is_cabinet_member(cabinet_of_path(name)) — plutôt que d'insérer un vrai
-- fichier : c'est lui qui décide, et il se teste sans passer par l'API de
-- stockage.
--
-- Un seul bloc DO terminé par RAISE EXCEPTION 'REUSSITE …' : rien ne persiste.
--
--   psql "$DATABASE_URL" -f supabase/tests/logo.sql
-- ============================================================================

do $$
declare
  v_rev uuid; v_org uuid; v_a uuid; v_b uuid; v_public boolean; v_limite bigint; v_types text[];
begin
  select b.public, b.file_size_limit, b.allowed_mime_types
    into v_public, v_limite, v_types
    from storage.buckets b where b.id = 'logos';
  if v_public is null then raise exception 'ECHEC : le compartiment « logos » n''existe pas'; end if;
  if not v_public then raise exception 'ECHEC : le compartiment n''est pas public, la vitrine ne pourra pas l''afficher'; end if;
  if v_limite <> 1048576 then raise exception 'ECHEC : plafond de taille = %', v_limite; end if;
  if 'image/svg+xml' = any(v_types) then raise exception 'FUITE : le SVG est accepté, alors qu''il peut porter du script'; end if;

  select m.user_id, m.reseller_id into v_rev, v_org from public.reseller_members m limit 1;
  if v_rev is null then raise exception 'Aucun compte revendeur.'; end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('bbbb0000-0000-4000-8000-00000000b101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','test-logo@exemple.fr','',now(),now(),now());

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role','authenticated')::text, true);
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_org,'Cabinet Logo A','cabinet-logo-a','Espace thérapie') returning id into v_a;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_org,'Cabinet Logo B','cabinet-logo-b','Espace thérapie') returning id into v_b;
  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at) values (v_a,'test-logo@exemple.fr','owner', now() + interval '1 day');

  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"bbbb0000-0000-4000-8000-00000000b101","role":"authenticated"}',true);
  perform public.claim_access();

  if not public.is_cabinet_member(public.cabinet_of_path(v_a || '/logo.png')) then
    raise exception 'ECHEC : la praticienne ne peut pas déposer dans son propre dossier';
  end if;
  if public.is_cabinet_member(public.cabinet_of_path(v_b || '/logo.png')) then
    raise exception 'FUITE : la praticienne peut déposer dans le dossier du cabinet voisin';
  end if;
  if public.cabinet_of_path('pas-un-uuid/logo.png') is not null then
    raise exception 'ECHEC : un chemin malformé devrait ne désigner aucun cabinet';
  end if;

  raise exception 'REUSSITE : compartiment public, images seules, 1 Mo ; chaque cabinet n''écrit que dans son dossier.';
end $$;
