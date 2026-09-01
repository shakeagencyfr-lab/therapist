-- ============================================================================
-- 0005 — Connexion : résoudre le rôle d'un compte, rattacher un patient à sa
-- fiche, transformer une invitation en appartenance.
--
-- L'accès se fait par lien magique : le compte est créé par Supabase à la
-- première connexion, avec un courriel déjà vérifié — c'est ce qui autorise
-- le rattachement par courriel ci-dessous. Aucun mot de passe n'est stocké.
-- ============================================================================

-- Le courriel sert de point de rendez-vous entre la fiche créée par la
-- thérapeute et le compte créé au premier lien magique.
alter table public.patients add column if not exists email text;
create unique index if not exists patients_cabinet_email_idx
  on public.patients (cabinet_id, lower(email)) where email is not null;

-- ---------------------------------------------------------------------------
-- Qui suis-je ?
--
-- Une seule requête au démarrage de l'application : elle dit quel espace
-- ouvrir. SECURITY DEFINER pour lire les tables d'appartenance sans buter sur
-- leur propre RLS ; ne renvoie rien d'autre que l'identité du demandeur.
-- ---------------------------------------------------------------------------
create or replace function public.my_context()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'email', (select u.email from auth.users u where u.id = auth.uid()),
    'reseller', (
      select jsonb_build_object('id', r.id, 'name', r.name, 'slug', r.slug, 'role', m.role)
      from public.reseller_members m
      join public.resellers r on r.id = m.reseller_id
      where m.user_id = auth.uid()
      limit 1
    ),
    'cabinet', (
      select jsonb_build_object(
        'id', c.id, 'name', c.name, 'slug', c.slug, 'tagline', c.tagline,
        'branding', c.branding, 'role', m.role, 'display_name', m.display_name
      )
      from public.cabinet_members m
      join public.cabinets c on c.id = m.cabinet_id
      where m.user_id = auth.uid()
      limit 1
    ),
    'patient', (
      select jsonb_build_object(
        'id', p.id, 'cabinet_id', p.cabinet_id, 'display_name', p.display_name,
        'cabinet_name', c.name, 'branding', c.branding
      )
      from public.patients p
      join public.cabinets c on c.id = p.cabinet_id
      where p.auth_user_id = auth.uid() and p.archived_at is null
      limit 1
    )
  );
$$;

revoke execute on function public.my_context() from public, anon;
grant execute on function public.my_context() to authenticated;

-- ---------------------------------------------------------------------------
-- Rattachement à la première connexion.
--
-- Appelée juste après le lien magique. Elle ne crée rien : elle relie un
-- compte à une fiche que la thérapeute a déjà créée, ou honore une invitation
-- déjà envoyée. Sans fiche ni invitation correspondante, elle ne fait rien —
-- se connecter ne donne aucun accès en soi.
--
-- Remplacée en 0006, qui ajoute le cas du revendeur.
-- ---------------------------------------------------------------------------
create or replace function public.claim_access()
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text;
  v_patient uuid;
  v_cabinet uuid;
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

  if v_patient is not null or v_cabinet is not null then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id)
    values (
      coalesce(v_cabinet, (select cabinet_id from public.patients where id = v_patient)),
      auth.uid(),
      case when v_patient is not null then 'patient.compte_rattache' else 'cabinet.invitation_acceptee' end,
      case when v_patient is not null then 'patients' else 'cabinet_members' end,
      coalesce(v_patient, v_cabinet)
    );
  end if;

  return jsonb_build_object('patient', v_patient, 'cabinet', v_cabinet);
end;
$$;

revoke execute on function public.claim_access() from public, anon;
grant execute on function public.claim_access() to authenticated;
