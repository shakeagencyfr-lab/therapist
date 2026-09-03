-- ============================================================================
-- La boutique du patient suit l'offre du cabinet
--
-- Deux conditions, et il en faut deux : que l'offre ouvre le levier, et que
-- la thérapeute allume sa boutique. Avant 0026, seule la seconde comptait —
-- un revendeur pouvait fermer le levier, l'onglet restait ouvert dans
-- l'application du patient, et l'achat échouait au dernier pas.
--
-- L'épreuve se termine par une exception : elle annule tout ce qu'elle a
-- écrit, y compris les réglages qu'elle a bougés le temps de mesurer.
-- ============================================================================

do $$
declare
  v_cab uuid; v_pat uuid; v_user uuid; v jsonb;
begin
  select id into v_cab from public.cabinets limit 1;
  select id, auth_user_id into v_pat, v_user
    from public.patients
   where cabinet_id = v_cab and auth_user_id is not null
   limit 1;
  if v_pat is null then
    raise exception 'IGNORE : aucun compte patient rattaché dans ce cabinet, rien à éprouver.';
  end if;

  update public.cabinet_settings set shop_enabled = true  where cabinet_id = v_cab;
  update public.subscriptions   set shop_override = false where cabinet_id = v_cab;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  select public.patient_cabinet_settings() into v;
  if (v->>'shop_enabled')::boolean then
    raise exception 'ECHEC : levier fermé, la boutique reste ouverte au patient';
  end if;

  perform set_config('role','postgres',true);
  perform set_config('request.jwt.claims','',true);
  update public.subscriptions set shop_override = true where cabinet_id = v_cab;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  select public.patient_cabinet_settings() into v;
  if not (v->>'shop_enabled')::boolean then
    raise exception 'ECHEC : levier ouvert et boutique allumée, elle reste fermée';
  end if;

  raise exception 'REUSSITE : la boutique du patient suit le levier de l''offre ET le réglage du cabinet.';
end $$;
