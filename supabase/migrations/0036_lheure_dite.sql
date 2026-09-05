-- Une notification programmée arrive à l'heure dite, et pas avant.
--
-- `push_notifications.scheduled_at` était écrit à chaque envoi, indexé, et lu
-- par personne : l'espace patient lisait ses notifications sans regarder la
-- date. « Ce soir, 20 h » s'affichait donc à 14 h 12, au moment du clic. La
-- thérapeute qui programme un mot pour le soir d'une séance difficile le
-- faisait arriver pendant la séance.
--
-- Le filtre va dans la POLITIQUE DE LECTURE, pas dans l'écran. Un filtre côté
-- client n'est pas un délai : il suffit de lire la réponse du réseau pour voir
-- le message qui n'est pas encore dû — et c'est l'invariant du produit, le
-- cloisonnement est en base.
--
-- DEUX FONCTIONS PLUTÔT QUE DEUX SOUS-REQUÊTES. Les deux tables se lisent
-- l'une l'autre : la ligne d'adressage dit à qui, la notification dit quoi et
-- quand. Écrire chaque politique en interrogeant l'autre table fait entrer
-- PostgreSQL dans la politique de celle-ci, qui interroge la première : «
-- infinite recursion detected in policy ». Deux fonctions SECURITY DEFINER
-- coupent le cycle — elles lisent sans repasser par les politiques.

create or replace function public.notification_due(p_push uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select n.scheduled_at is null or n.scheduled_at <= now()
    from public.push_notifications n where n.id = p_push
  ), false);
$$;

comment on function public.notification_due(uuid) is
  'L''heure de cette notification est-elle venue ? Lue sans repasser par les politiques, pour ne pas boucler.';

create or replace function public.notification_pour_moi(p_push uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.push_recipients r
    where r.push_id = p_push and public.is_patient_record(r.patient_id)
  );
$$;

comment on function public.notification_pour_moi(uuid) is
  'Cette notification m''est-elle adressée ? Même raison : la lecture directe évite la récursion.';

drop policy if exists "le patient lit ses notifications" on public.push_recipients;
drop policy if exists "le patient lit ses notifications due" on public.push_recipients;
create policy "le patient lit ses notifications dues" on public.push_recipients
  for select using (
    public.is_patient_record(patient_id) and public.notification_due(push_id)
  );

drop policy if exists "la patiente lit les notifications qui lui sont adressées" on public.push_notifications;
drop policy if exists "le patient lit les notifications dues qui lui sont adressees" on public.push_notifications;
create policy "le patient lit les notifications dues qui lui sont adressees" on public.push_notifications
  for select using (
    (scheduled_at is null or scheduled_at <= now()) and public.notification_pour_moi(id)
  );

-- `patient_marquer_lue` marque la ligne comme lue : elle ne doit pas servir à
-- accuser réception d'un message pas encore dû.
create or replace function public.patient_marquer_lue(p_push uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.push_recipients r
     set read_at = now()
   where r.push_id = p_push
     and public.is_patient_record(r.patient_id)
     and r.read_at is null
     and public.notification_due(p_push);
end;
$$;

revoke execute on function public.patient_marquer_lue(uuid) from public, anon;
grant execute on function public.patient_marquer_lue(uuid) to authenticated;
revoke execute on function public.notification_due(uuid) from public, anon;
revoke execute on function public.notification_pour_moi(uuid) from public, anon;
