-- ============================================================================
-- 0001 — Socle multi-cabinet : revendeurs, cabinets, membres, marque blanche.
--
-- Trois niveaux, et une règle qui ne se négocie pas :
--   revendeur  → vend et administre des cabinets. NE LIT AUCUNE DONNÉE DE SANTÉ.
--   cabinet    → la thérapeute et son équipe. Voit ses patients, et eux seuls.
--   patient    → voit ses propres données, et rien du cabinet.
--
-- Le cloisonnement du revendeur n'est pas obtenu en masquant des colonnes :
-- aucune politique RLS des tables de santé (0002) ne mentionne l'appartenance
-- à un revendeur. Il n'a donc, par construction, aucun chemin de lecture.
-- Le test supabase/tests/isolation.sql vérifie cette propriété.
-- ============================================================================

create extension if not exists pgcrypto;

create type public.cabinet_role as enum ('owner', 'therapist', 'assistant');
create type public.reseller_role as enum ('owner', 'staff');

-- Le revendeur : une agence, un réseau, ou une thérapeute qui revend à des
-- consœurs. Ne contient aucune donnée de santé.
create table public.resellers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  support_email text,
  created_at  timestamptz not null default now()
);

-- Le cabinet : l'unité d'isolation. Toute donnée de santé porte son identifiant.
create table public.cabinets (
  id          uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers (id) on delete restrict,
  name        text not null,
  -- Sous-domaine : <slug>.entre-seances.fr
  slug        text not null unique,
  tagline     text not null default 'Espace thérapie',
  -- Marque blanche. Mêmes clés que CabinetTheme (src/theme/theme.ts) :
  -- accent, accentHover, accentDeep, dark, logo (initiales ou URL).
  branding    jsonb not null default
                '{"accent":"#A17A45","accentHover":"#856239","accentDeep":"#6E5230","dark":"#33291C","logo":null}'::jsonb,
  locale      text not null default 'fr-FR',
  created_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint cabinets_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$')
);

create index cabinets_reseller_idx on public.cabinets (reseller_id) where archived_at is null;

-- Qui travaille chez le revendeur.
create table public.reseller_members (
  reseller_id uuid not null references public.resellers (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.reseller_role not null default 'staff',
  created_at  timestamptz not null default now(),
  primary key (reseller_id, user_id)
);

-- Qui travaille dans le cabinet. Le nom d'une thérapeute n'est pas une donnée
-- de santé : le revendeur peut le voir, c'est son client.
create table public.cabinet_members (
  cabinet_id   uuid not null references public.cabinets (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         public.cabinet_role not null default 'therapist',
  display_name text not null,
  created_at   timestamptz not null default now(),
  primary key (cabinet_id, user_id)
);

create index cabinet_members_user_idx on public.cabinet_members (user_id);

-- Le revendeur crée le cabinet puis invite la thérapeute. Il ne devient jamais
-- membre du cabinet : c'est ce qui l'empêche d'atteindre les patients.
create table public.cabinet_invitations (
  id           uuid primary key default gen_random_uuid(),
  cabinet_id   uuid not null references public.cabinets (id) on delete cascade,
  email        text not null,
  role         public.cabinet_role not null default 'owner',
  -- Jamais le jeton en clair : seulement son empreinte.
  token_hash   text not null unique,
  invited_by   uuid references auth.users (id) on delete set null,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index cabinet_invitations_cabinet_idx on public.cabinet_invitations (cabinet_id);

-- ---------------------------------------------------------------------------
-- Fonctions d'appartenance.
--
-- SECURITY DEFINER pour lire les tables d'appartenance sans déclencher la RLS
-- de ces mêmes tables (récursion). search_path vidé : tout est qualifié.
-- ---------------------------------------------------------------------------

create or replace function public.is_cabinet_member(p_cabinet uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.cabinet_members m
    where m.cabinet_id = p_cabinet and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_reseller_member(p_reseller uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.reseller_members m
    where m.reseller_id = p_reseller and m.user_id = auth.uid()
  );
$$;

-- Le revendeur qui vend ce cabinet — utilisé par les politiques commerciales,
-- jamais par celles des tables de santé.
create or replace function public.is_reseller_of_cabinet(p_cabinet uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.cabinets c
    join public.reseller_members m on m.reseller_id = c.reseller_id
    where c.id = p_cabinet and m.user_id = auth.uid()
  );
$$;

create or replace function public.my_cabinet_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select cabinet_id from public.cabinet_members where user_id = auth.uid();
$$;

create or replace function public.my_reseller_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select reseller_id from public.reseller_members where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.resellers           enable row level security;
alter table public.cabinets            enable row level security;
alter table public.reseller_members    enable row level security;
alter table public.cabinet_members     enable row level security;
alter table public.cabinet_invitations enable row level security;

-- Personne n'accède à ces tables sans être authentifié.
revoke all on public.resellers, public.cabinets, public.reseller_members,
              public.cabinet_members, public.cabinet_invitations
  from anon;

create policy "revendeur lit son organisation"
  on public.resellers for select to authenticated
  using (public.is_reseller_member(id));

create policy "cabinet lit son revendeur"
  on public.resellers for select to authenticated
  using (exists (
    select 1 from public.cabinets c
    where c.reseller_id = resellers.id and public.is_cabinet_member(c.id)
  ));

create policy "revendeur lit ses cabinets"
  on public.cabinets for select to authenticated
  using (public.is_reseller_member(reseller_id));

create policy "membre lit son cabinet"
  on public.cabinets for select to authenticated
  using (public.is_cabinet_member(id));

create policy "revendeur crée un cabinet"
  on public.cabinets for insert to authenticated
  with check (public.is_reseller_member(reseller_id));

-- Le revendeur règle la marque et l'abonnement ; la thérapeute règle son propre
-- cabinet. Ni l'un ni l'autre ne peut déplacer un cabinet vers un autre
-- revendeur : le déclencheur ci-dessous le refuse.
create policy "revendeur modifie ses cabinets"
  on public.cabinets for update to authenticated
  using (public.is_reseller_member(reseller_id))
  with check (public.is_reseller_member(reseller_id));

create policy "cabinet modifie sa fiche"
  on public.cabinets for update to authenticated
  using (public.is_cabinet_member(id))
  with check (public.is_cabinet_member(id));

create or replace function public.forbid_cabinet_transfer()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.reseller_id is distinct from old.reseller_id then
    raise exception 'Un cabinet ne change pas de revendeur par une mise à jour.';
  end if;
  return new;
end;
$$;

create trigger cabinets_no_transfer
  before update on public.cabinets
  for each row execute function public.forbid_cabinet_transfer();

create policy "je vois mes appartenances revendeur"
  on public.reseller_members for select to authenticated
  using (user_id = auth.uid() or public.is_reseller_member(reseller_id));

create policy "membres du cabinet visibles par le cabinet"
  on public.cabinet_members for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

-- Le revendeur voit ses interlocuteurs (nom, rôle) — pas leurs patients.
create policy "membres du cabinet visibles par le revendeur"
  on public.cabinet_members for select to authenticated
  using (public.is_reseller_of_cabinet(cabinet_id));

create policy "le cabinet gère ses membres"
  on public.cabinet_members for all to authenticated
  using (public.is_cabinet_member(cabinet_id))
  with check (public.is_cabinet_member(cabinet_id));

create policy "le revendeur gère les invitations"
  on public.cabinet_invitations for all to authenticated
  using (public.is_reseller_of_cabinet(cabinet_id))
  with check (public.is_reseller_of_cabinet(cabinet_id));

create policy "le cabinet voit ses invitations"
  on public.cabinet_invitations for select to authenticated
  using (public.is_cabinet_member(cabinet_id));
