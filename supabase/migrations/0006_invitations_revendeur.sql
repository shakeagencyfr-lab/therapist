-- ============================================================================
-- 0006 — Invitations côté revendeur, symétriques de celles du cabinet.
-- Sans elles, l'espace revendeur serait inatteignable : personne ne peut
-- devenir membre d'un revendeur sans y être invité.
-- ============================================================================

create table public.reseller_invitations (
  id          uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers (id) on delete cascade,
  email       text not null,
  role        public.reseller_role not null default 'staff',
  invited_by  uuid references auth.users (id) on delete set null,
  expires_at  timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (reseller_id, email)
);

alter table public.reseller_invitations enable row level security;
revoke all on public.reseller_invitations from anon;

create policy "le revendeur gere ses invitations"
  on public.reseller_invitations for all to authenticated
  using (public.is_reseller_member(reseller_id))
  with check (public.is_reseller_member(reseller_id));

-- claim_access() honore désormais les trois formes d'accès : une fiche
-- patient qui attend son compte, une invitation de cabinet, une invitation
-- de revendeur.
create or replace function public.claim_access()
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text;
  v_patient uuid;
  v_cabinet uuid;
  v_reseller uuid;
begin
  select u.email into v_email from auth.users u where u.id = auth.uid();
  if v_email is null then
    raise exception 'Aucun compte connecté.';
  end if;

  update public.patients p
     set auth_user_id = auth.uid()
   where lower(p.email) = lower(v_email)
     and p.auth_user_id is null
     and p.archived_at is null
  returning p.id into v_patient;

  insert into public.cabinet_members (cabinet_id, user_id, role, display_name)
  select i.cabinet_id, auth.uid(), i.role, split_part(v_email, '@', 1)
    from public.cabinet_invitations i
   where lower(i.email) = lower(v_email)
     and i.accepted_at is null
     and i.expires_at > now()
   limit 1
  on conflict (cabinet_id, user_id) do nothing
  returning cabinet_id into v_cabinet;

  if v_cabinet is not null then
    update public.cabinet_invitations
       set accepted_at = now()
     where cabinet_id = v_cabinet and lower(email) = lower(v_email) and accepted_at is null;
  end if;

  insert into public.reseller_members (reseller_id, user_id, role)
  select i.reseller_id, auth.uid(), i.role
    from public.reseller_invitations i
   where lower(i.email) = lower(v_email)
     and i.accepted_at is null
     and i.expires_at > now()
   limit 1
  on conflict (reseller_id, user_id) do nothing
  returning reseller_id into v_reseller;

  if v_reseller is not null then
    update public.reseller_invitations
       set accepted_at = now()
     where reseller_id = v_reseller and lower(email) = lower(v_email) and accepted_at is null;
  end if;

  -- Trace technique : qui a rejoint quoi, jamais de contenu de dossier.
  if v_patient is not null or v_cabinet is not null or v_reseller is not null then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id)
    values (
      coalesce(v_cabinet, (select cabinet_id from public.patients where id = v_patient)),
      auth.uid(),
      case
        when v_patient is not null then 'patient.compte_rattache'
        when v_cabinet is not null then 'cabinet.invitation_acceptee'
        else 'revendeur.invitation_acceptee'
      end,
      case
        when v_patient is not null then 'patients'
        when v_cabinet is not null then 'cabinet_members'
        else 'reseller_members'
      end,
      coalesce(v_patient, v_cabinet, v_reseller)
    );
  end if;

  return jsonb_build_object('patient', v_patient, 'cabinet', v_cabinet, 'reseller', v_reseller);
end;
$$;

revoke execute on function public.claim_access() from public, anon;
grant execute on function public.claim_access() to authenticated;
