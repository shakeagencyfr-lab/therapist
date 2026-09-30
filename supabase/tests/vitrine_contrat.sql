-- ============================================================================
-- La page publique et le domaine d'un cabinet suivent son contrat (0048).
--
--   contrat actif      → site_vitrine rend la page, avec l'agenda (l'adresse
--                         seule) et les mentions légales, jamais les avis
--                         retirés ; cabinet_par_domaine rend le cabinet
--   impayé             → la page et le domaine se taisent ; la porte par
--                         l'identifiant (cabinet_vitrine) reste ouverte
--   essai expiré       → pareil ; essai en cours → la page revient
--   offre sans le site → la page se tait, contrat ou pas
--   la marque          → une couleur hors #RRGGBB et un nom d'une lettre
--                         sont refusés par la base
--   le stockage        → un membre LIT le dossier de son cabinet (ce qu'exige
--                         la suppression par l'API), pas celui d'un autre
--
-- Un seul bloc DO terminé par RAISE EXCEPTION 'REUSSITE …' : rien ne persiste.
--
--   psql "$DATABASE_URL" -f supabase/tests/vitrine_contrat.sql
-- ============================================================================

do $$
declare
  v_rev uuid; v_org uuid; v_offre text; v_cab uuid; v_voisin uuid; v jsonb; n integer;
  v_membre uuid := 'bbbb0000-0000-4000-8000-000000048001';
begin
  select m.user_id, m.reseller_id into v_rev, v_org from public.reseller_members m limit 1;
  if v_rev is null then raise exception 'Aucun compte revendeur.'; end if;
  select p.code into v_offre from public.plans p where p.site and p.marque_blanche order by p.position limit 1;
  if v_offre is null then raise exception 'Aucune offre qui comprenne le site et la marque blanche.'; end if;

  -- Le revendeur ouvre deux cabinets, sous ses droits.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role','authenticated')::text, true);
  insert into public.cabinets (reseller_id, name, slug, tagline, branding)
  values (v_org, 'Cabinet Contrat', 'cabinet-contrat-0048', 'Hypnothérapie',
          '{"accent":"#2F6F62","accentHover":"#275C51","accentDeep":"#1F4A41","dark":"#1B2A26","logo":"CC"}'::jsonb)
  returning id into v_cab;
  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_org, 'Cabinet Voisin', 'cabinet-voisin-0048', 'Espace thérapie')
  returning id into v_voisin;

  -- Le reste se pose comme le serveur le poserait.
  perform set_config('role','none',true);
  insert into public.subscriptions (cabinet_id, plan_code, status)
  values (v_cab, v_offre, 'actif');
  insert into public.cabinet_sites (cabinet_id, publie, titre, adresse, avis, avis_retires, responsable, numero_pro)
  values (v_cab, true, 'Cabinet Contrat', '3 rue des Lilas, Nantes',
          '[{"auteur":"Marc","note":4,"texte":"Trois séances ont suffi.","date":""}]'::jsonb,
          '["claire|une écoute rare."]'::jsonb,
          'Hélène Marchal', 'SIRET 123 456 789 00012');
  insert into public.cabinet_settings (cabinet_id, booking_url, booking_mode)
  values (v_cab, 'https://agenda.exemple.fr/cabinet-contrat', 'bouton');
  insert into public.cabinet_domains (cabinet_id, domaine, verifie)
  values (v_cab, 'espace.epreuve-0048.fr', true);

  -- ---- Contrat actif ------------------------------------------------------
  perform set_config('role','anon',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);

  v := public.site_vitrine('Cabinet-Contrat-0048');
  if v is null then raise exception 'ECHEC : contrat actif, et la page ne se lit pas'; end if;
  if v->>'reservation' is distinct from 'https://agenda.exemple.fr/cabinet-contrat' then
    raise exception 'ECHEC : l''agenda n''est pas rendu (%)', v->>'reservation';
  end if;
  if v->>'responsable' is distinct from 'Hélène Marchal' or v->>'numero_pro' is distinct from 'SIRET 123 456 789 00012' then
    raise exception 'ECHEC : les mentions légales ne sont pas rendues';
  end if;
  if v ? 'avis_retires' then raise exception 'FUITE : la page publique rend les avis retirés'; end if;
  select count(*) into n from jsonb_object_keys(v) k
   where k not in ('slug','name','tagline','branding','modele','theme','titre','sous_titre','presentation',
                   'adresse','telephone','site_web','horaires','photos','services','avis','google_note',
                   'google_avis','reservation','responsable','numero_pro');
  if n <> 0 then raise exception 'FUITE : la page rend % clé(s) inattendue(s)', n; end if;

  if public.cabinet_par_domaine('Espace.Epreuve-0048.fr')->>'slug' is distinct from 'cabinet-contrat-0048' then
    raise exception 'ECHEC : contrat actif, et le domaine ne désigne pas le cabinet';
  end if;

  -- ---- Impayé -------------------------------------------------------------
  perform set_config('role','none',true);
  update public.subscriptions set status = 'impaye' where cabinet_id = v_cab;
  perform set_config('role','anon',true);

  if public.site_vitrine('cabinet-contrat-0048') is not null then
    raise exception 'ECHEC : impayé, et la page publique répond encore';
  end if;
  if public.cabinet_par_domaine('espace.epreuve-0048.fr') is not null then
    raise exception 'ECHEC : impayé, et le domaine désigne encore le cabinet';
  end if;
  if public.cabinet_vitrine('cabinet-contrat-0048') is null then
    raise exception 'ECHEC : la porte des patients s''est fermée — les dossiers ne se ferment pas sur un impayé';
  end if;

  -- ---- Essai expiré, puis en cours ---------------------------------------
  perform set_config('role','none',true);
  update public.subscriptions set status = 'essai', trial_ends_at = now() - interval '1 day' where cabinet_id = v_cab;
  perform set_config('role','anon',true);
  if public.site_vitrine('cabinet-contrat-0048') is not null then
    raise exception 'ECHEC : essai expiré, et la page publique répond encore';
  end if;

  perform set_config('role','none',true);
  update public.subscriptions set trial_ends_at = now() + interval '10 days' where cabinet_id = v_cab;
  perform set_config('role','anon',true);
  if public.site_vitrine('cabinet-contrat-0048') is null then
    raise exception 'ECHEC : essai en cours, et la page ne revient pas';
  end if;

  -- ---- Contrat en règle, offre sans le site -------------------------------
  perform set_config('role','none',true);
  update public.subscriptions set status = 'actif', trial_ends_at = null, site_override = false where cabinet_id = v_cab;
  perform set_config('role','anon',true);
  if public.site_vitrine('cabinet-contrat-0048') is not null then
    raise exception 'ECHEC : offre sans le site, et la page répond';
  end if;

  -- ---- La marque a une forme ---------------------------------------------
  perform set_config('role','none',true);
  begin
    update public.cabinets set branding = jsonb_set(branding, '{accent}', '"#A17A4"') where id = v_cab;
    raise exception 'ECHEC : un accent à cinq chiffres est accepté';
  exception when check_violation then null;
  end;
  begin
    update public.cabinets set branding = jsonb_set(branding, '{dark}', '"red; background:url(x)"') where id = v_cab;
    raise exception 'ECHEC : une valeur qui n''est pas une couleur est acceptée';
  exception when check_violation then null;
  end;
  begin
    update public.cabinets set name = ' X ' where id = v_cab;
    raise exception 'ECHEC : un nom d''une lettre est accepté';
  exception when check_violation then null;
  end;
  update public.cabinets set branding = jsonb_set(branding, '{accent}', '"#A17A45"') where id = v_cab;

  begin
    update public.cabinet_sites set avis_retires = '{"pas":"un tableau"}'::jsonb where cabinet_id = v_cab;
    raise exception 'ECHEC : des avis retirés qui ne sont pas un tableau sont acceptés';
  exception when check_violation then null;
  end;

  -- ---- Le stockage : chacun lit son dossier -------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (v_membre, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'test-0048@exemple.fr', '', now(), now(), now());
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name)
  values (v_cab, v_membre, 'owner', 'Praticienne 0048');
  insert into storage.objects (bucket_id, name) values
    ('sites', v_cab || '/site/epreuve.jpg'),
    ('logos', v_cab || '/epreuve.png'),
    ('sites', v_voisin || '/site/voisin.jpg');

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_membre, 'role','authenticated')::text, true);
  select count(*) into n from storage.objects
   where bucket_id in ('sites','logos') and name in (v_cab || '/site/epreuve.jpg', v_cab || '/epreuve.png');
  if n <> 2 then raise exception 'ECHEC : la praticienne ne lit pas son propre dossier (% sur 2) — elle ne pourra rien y effacer', n; end if;
  select count(*) into n from storage.objects where name = v_voisin || '/site/voisin.jpg';
  if n <> 0 then raise exception 'FUITE : la praticienne lit le dossier du cabinet voisin'; end if;

  raise exception 'REUSSITE : la page et le domaine suivent le contrat, rendent l''agenda et les mentions sans les avis retirés ; la marque a une forme ; chacun lit son seul dossier.';
end $$;
