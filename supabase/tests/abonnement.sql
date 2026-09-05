-- 0035 éprouvée contre la vraie base : ce que le contrat décide.
--
-- Le bloc modifie l'abonnement du cabinet témoin puis ANNULE tout par
-- l'exception finale — rien ne subsiste, même en cas de réussite.
do $$
declare v_cab uuid; v_droits jsonb; v_ok boolean;
begin
  select id into v_cab from public.cabinets limit 1;
  if v_cab is null then raise exception 'RIEN À ÉPROUVER : aucun cabinet en base'; end if;

  -- 1. Un essai qui court est en règle.
  update public.subscriptions set status = 'essai', trial_ends_at = now() + interval '10 days'
   where cabinet_id = v_cab;
  if not public.abonnement_en_regle(v_cab) then
    raise exception 'ECHEC 1 : un essai courant est jugé hors contrat';
  end if;

  -- 2. Le même, la date passée, ne l'est plus. C'est tout le défaut : cette
  --    date était écrite à l'ouverture du cabinet et relue par personne.
  update public.subscriptions set trial_ends_at = now() - interval '1 day' where cabinet_id = v_cab;
  if public.abonnement_en_regle(v_cab) then
    raise exception 'ECHEC 2 : un essai expiré reste en règle';
  end if;

  -- 3. `cabinet_droits` ne répond toujours qu'à un membre ou au revendeur :
  --    ici, sous la clé de service, il n'y a pas d'auth.uid(), donc null.
  select public.cabinet_droits(v_cab) into v_droits;
  if v_droits is not null then
    raise exception 'ECHEC 3 : cabinet_droits répond à qui n''est ni membre ni revendeur (%)', v_droits;
  end if;

  -- 4. Un impayé est hors contrat, quelle que soit la date d'essai.
  update public.subscriptions set status = 'impaye', trial_ends_at = now() + interval '90 days'
   where cabinet_id = v_cab;
  if public.abonnement_en_regle(v_cab) then
    raise exception 'ECHEC 4 : un impayé reste en règle';
  end if;

  -- 5. Un contrat actif l'est, même sans aucune date.
  update public.subscriptions set status = 'actif', trial_ends_at = null, current_period_end = null
   where cabinet_id = v_cab;
  if not public.abonnement_en_regle(v_cab) then
    raise exception 'ECHEC 5 : un contrat actif est jugé hors contrat';
  end if;

  -- 6. Sans ligne d'abonnement : pas de contrat, donc pas de droits.
  select public.abonnement_en_regle(gen_random_uuid()) into v_ok;
  if v_ok then raise exception 'ECHEC 6 : un cabinet sans contrat est jugé en règle'; end if;

  raise exception 'REUSSITE : essai, expiration, impayé, actif et absence de contrat sont distingués';
end $$;
