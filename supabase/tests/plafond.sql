-- Le plafond de fiches actives, éprouvé dans les deux sens.
--
-- Il ne jouait qu'à l'insertion : archiver puis rouvrir le contournait, et
-- l'écran de la thérapeute propose justement « Rouvrir le suivi ». Le contrôle
-- existait dans le navigateur, ce qui n'est pas un contrôle — la même ligne
-- s'écrit directement en PostgREST avec la clé publiable.
--
-- L'épreuve vérifie AUSSI l'autre moitié, celle qu'un correctif trop large
-- casserait : un cabinet plein doit continuer à renommer ses fiches et à en
-- archiver. Tout est annulé par l'exception finale.
do $$
declare
  v_rev uuid; v_cab uuid; v_a uuid; v_b uuid;
begin
  select id into v_rev from public.resellers limit 1;
  if v_rev is null then raise exception 'RIEN À ÉPROUVER : aucun revendeur'; end if;

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Plafond temoin', 'plafond-temoin-t', 'x') returning id into v_cab;

  insert into public.plans (code, label, price_cents, max_patients)
  values ('temoin-1', 'Témoin', 0, 1) on conflict (code) do nothing;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, 'temoin-1', 'actif');

  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'A', 'A', 'p', 's', 'w', 'l', 'q') returning id into v_a;

  -- Une deuxième fiche active : refusée, comme avant.
  begin
    insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
    values (v_cab, 'B', 'B', 'p', 's', 'w', 'l', 'q') returning id into v_b;
    raise exception 'ECHEC 1 : une deuxieme fiche active est acceptee malgre le plafond de 1';
  exception when check_violation then null;
  end;

  -- Le contournement : archiver A, créer B, rouvrir A.
  update public.patients set archived_at = now() where id = v_a;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'B', 'B', 'p', 's', 'w', 'l', 'q') returning id into v_b;

  begin
    update public.patients set archived_at = null where id = v_a;
    raise exception 'ECHEC 2 : la reouverture contourne toujours le plafond';
  exception when check_violation then null;
  end;

  -- L'autre moitié : un cabinet plein n'est pas figé.
  update public.patients set display_name = 'B renommee' where id = v_b;
  update public.patients set archived_at = now() where id = v_b;
  -- Et la place faite, la réouverture redevient possible.
  update public.patients set archived_at = null where id = v_a;

  raise exception 'REUSSITE : reouverture bloquee quand c est plein, libre quand la place existe ; modification et archivage jamais genes.';
end $$;
