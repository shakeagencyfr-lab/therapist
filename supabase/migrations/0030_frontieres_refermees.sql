-- Quatre frontières que la base ne tenait pas, et une porte qui pouvait
-- s'enfermer. Trouvées par une passe d'audit, chacune confirmée par trois
-- vérificateurs indépendants et rejouée en base avant correction.
--
-- LE FIL COMMUN. Plusieurs tables portent DEUX clés : celle du patient, et
-- celle du cabinet. Les politiques ne contraignaient que la première ; la
-- seconde arrivait du navigateur et n'était vérifiée nulle part. Or c'est la
-- seconde qui décide de qui LIT la ligne. Un compte authentifié pouvait donc
-- déposer des lignes dans la partition d'un cabinet qui ne le connaît pas.
--
-- L'invariant du produit dit « le cloisonnement est en base, jamais dans le
-- client ». Il était faux pour journal_pages, scale_entries,
-- module_quiz_answers et audit_log. Ces quatre-là étaient tenues, de fait, par
-- un filtre React — ce qui n'est pas un contrôle d'accès.

-- ============================================================================
-- 1. Le cabinet d'une ligne se déduit de la fiche, il ne se déclare plus
-- ============================================================================
--
-- Un déclencheur plutôt qu'un WITH CHECK plus fin : le WITH CHECK obligerait
-- le client à envoyer la BONNE valeur, et le laisserait échouer s'il se
-- trompe. Ici il n'a plus à l'envoyer du tout — ce qu'il met est écrasé. Une
-- valeur qu'on ne peut pas se tromper à fournir est meilleure qu'une valeur
-- qu'on vérifie.

create or replace function public.ranger_selon_la_fiche()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select p.cabinet_id into new.cabinet_id
    from public.patients p
   where p.id = new.patient_id;
  if new.cabinet_id is null then
    raise exception 'Fiche introuvable : impossible de ranger cette ligne.';
  end if;
  return new;
end;
$$;

comment on function public.ranger_selon_la_fiche() is
  'Écrase cabinet_id par celui de la fiche. La colonne décide de qui lit la ligne : elle ne peut pas venir du navigateur.';

drop trigger if exists journal_pages_rangement on public.journal_pages;
create trigger journal_pages_rangement
  before insert or update on public.journal_pages
  for each row execute function public.ranger_selon_la_fiche();

drop trigger if exists scale_entries_rangement on public.scale_entries;
create trigger scale_entries_rangement
  before insert or update on public.scale_entries
  for each row execute function public.ranger_selon_la_fiche();

-- Le quiz ne porte pas patient_id : il passe par son module.
create or replace function public.ranger_le_quiz()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select p.cabinet_id into new.cabinet_id
    from public.patient_modules m
    join public.patients p on p.id = m.patient_id
   where m.id = new.module_id;
  if new.cabinet_id is null then
    raise exception 'Exercice introuvable : impossible de ranger cette réponse.';
  end if;
  return new;
end;
$$;

drop trigger if exists module_quiz_answers_rangement on public.module_quiz_answers;
create trigger module_quiz_answers_rangement
  before insert or update on public.module_quiz_answers
  for each row execute function public.ranger_le_quiz();

-- ============================================================================
-- 2. L'auto-évaluation n'a plus qu'une porte
-- ============================================================================
--
-- 0024 a déplacé le geste vers patient_note_echelle(), qui corrige la ligne du
-- soir au lieu d'en empiler une, et l'écran passe bien par ce RPC. Mais la
-- politique d'INSERT directe est restée : la fonction n'était qu'un chemin
-- recommandé. Une patiente pouvait poser dix points le même soir et fausser la
-- courbe que sa thérapeute lit en séance.
--
-- Le nom exact est cherché plutôt qu'écrit : 0025 s'est déjà fait prendre par
-- un accent qui n'existait pas dans le nom réellement stocké.
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'scale_entries' and cmd = 'INSERT'
  loop
    execute format('drop policy %I on public.scale_entries', r.policyname);
  end loop;
end $$;

-- ============================================================================
-- 3. Marquer une notification lue ne permet plus d'en lire une autre
-- ============================================================================
--
-- La politique d'UPDATE ne contraignait que patient_id ; push_id restait
-- libre. Or la lecture de push_notifications fait confiance à cette ligne :
-- un patient repointait sa propre ligne de destinataire sur la notification
-- d'un autre cabinet, puis en lisait le titre et le corps.
--
-- Une politique ne sait pas dire « cette colonne ne change pas ». Une fonction
-- si — c'est déjà ce que 0007 avait fait pour patient_modules et
-- patient_audios ; push_recipients avait été oubliée.

create or replace function public.patient_marquer_lue(p_push uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.push_recipients
     set read_at = now()
   where push_id = p_push
     and public.is_patient_record(patient_id)
     and read_at is null;
end;
$$;

revoke execute on function public.patient_marquer_lue(uuid) from public, anon;
grant execute on function public.patient_marquer_lue(uuid) to authenticated;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'push_recipients' and cmd = 'UPDATE'
       and policyname <> 'cabinet'
  loop
    execute format('drop policy %I on public.push_recipients', r.policyname);
  end loop;
end $$;

-- ============================================================================
-- 4. Le journal d'accès n'accepte plus de lignes forgées
-- ============================================================================
--
-- La politique d'INSERT ne vérifiait que l'auteur ; cabinet_id était libre.
-- N'importe quel compte de la plateforme pouvait écrire dans la piste d'audit
-- d'un cabinet tiers des consultations de dossiers qui n'ont jamais eu lieu —
-- et ce cabinet ne peut pas les effacer.
--
-- Les six écritures réelles viennent toutes du serveur, sous la clé de
-- service, plus claim_access() qui est SECURITY DEFINER : aucune ne passe par
-- le rôle authenticated. On le lui retire, plutôt que de resserrer un prédicat
-- qu'il faudrait maintenir.
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'audit_log' and cmd = 'INSERT'
  loop
    execute format('drop policy %I on public.audit_log', r.policyname);
  end loop;
end $$;

revoke insert on public.audit_log from authenticated;

-- ============================================================================
-- 5. claim_access() : ne plus s'enfermer, ni laisser entrer trop tard
-- ============================================================================
--
-- DEUX DÉFAUTS DISTINCTS DANS LA MÊME FONCTION.
--
-- a) patients.auth_user_id porte un UNIQUE global, mais l'unicité de l'adresse
--    n'est que par cabinet : deux cabinets peuvent porter une fiche à la même
--    adresse. L'UPDATE visait TOUTES les fiches correspondantes ; à la
--    deuxième il violait l'unicité, l'exception annulait la fonction ENTIÈRE,
--    et le compte n'obtenait plus rien — ni fiche, ni invitation de cabinet,
--    ni invitation de revendeur. Définitivement : la même exception se
--    reproduit à chaque connexion. Il suffisait qu'un cabinet crée une fiche à
--    l'adresse d'un patient d'un concurrent pour le verrouiller dehors.
--    Désormais : une seule fiche, choisie de façon déterministe, et chacun des
--    trois rattachements dans son propre bloc — un échec n'emporte plus les
--    deux autres.
--
-- b) 0021 borne le moment où une invitation de cabinet est CRÉÉE (le cabinet
--    doit être vide) mais jamais le moment où elle est CONSOMMÉE. Un revendeur
--    pouvait, pendant l'amorçage, poser une seconde invitation pour une
--    adresse à lui, la laisser dormir, et devenir membre six mois plus tard —
--    quand le cabinet est plein de dossiers. La thérapeute n'a aucun écran où
--    le voir venir. La consommation est donc bornée par la même règle que la
--    création : un cabinet qui a déjà un membre n'accepte plus d'invitation.

create or replace function public.claim_access()
returns jsonb
language plpgsql security definer set search_path = ''
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

  -- Une fiche patient qui attend son compte. UNE SEULE, et la plus ancienne :
  -- deux fiches à la même adresse ne doivent pas s'annuler l'une l'autre.
  begin
    update public.patients p
       set auth_user_id = auth.uid()
     where p.id = (
       select p2.id from public.patients p2
        where lower(p2.email) = lower(v_email)
          and p2.auth_user_id is null
          and p2.archived_at is null
        order by p2.created_at
        limit 1
     )
    returning p.id into v_patient;
  exception when unique_violation then
    -- Le compte tient déjà une fiche ailleurs : ce n'est pas une panne, et
    -- surtout cela ne doit pas emporter les invitations ci-dessous.
    v_patient := null;
  end;

  -- Une invitation de cabinet encore valable, ET un cabinet encore vide.
  begin
    insert into public.cabinet_members (cabinet_id, user_id, role, display_name)
    select i.cabinet_id, auth.uid(), i.role, split_part(v_email, '@', 1)
      from public.cabinet_invitations i
     where lower(i.email) = lower(v_email)
       and i.accepted_at is null
       and i.expires_at > now()
       and not public.cabinet_a_un_membre(i.cabinet_id)
     limit 1
    on conflict (cabinet_id, user_id) do nothing
    returning cabinet_id into v_cabinet;
  exception when others then
    v_cabinet := null;
  end;

  if v_cabinet is not null then
    update public.cabinet_invitations
       set accepted_at = now()
     where cabinet_id = v_cabinet and lower(email) = lower(v_email) and accepted_at is null;
  end if;

  -- Une invitation de revendeur encore valable.
  begin
    insert into public.reseller_members (reseller_id, user_id, role)
    select i.reseller_id, auth.uid(), i.role
      from public.reseller_invitations i
     where lower(i.email) = lower(v_email)
       and i.accepted_at is null
       and i.expires_at > now()
     limit 1
    on conflict (reseller_id, user_id) do nothing
    returning reseller_id into v_reseller;
  exception when others then
    v_reseller := null;
  end;

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

-- ============================================================================
-- 6. La durée de vie d'une invitation ne se choisit plus dans le navigateur
-- ============================================================================
--
-- cabinet_invitations.expires_at était NOT NULL, sans défaut et sans borne :
-- le revendeur écrit directement en PostgREST et posait la date qu'il voulait
-- — neuf cents ans, par exemple. Son homologue reseller_invitations avait bien
-- un défaut ; celle-ci avait été oubliée.
alter table public.cabinet_invitations
  alter column expires_at set default now() + interval '30 days';

alter table public.cabinet_invitations
  drop constraint if exists cabinet_invitations_duree;
alter table public.cabinet_invitations
  add constraint cabinet_invitations_duree
  check (expires_at <= created_at + interval '60 days');

alter table public.reseller_invitations
  drop constraint if exists reseller_invitations_duree;
alter table public.reseller_invitations
  add constraint reseller_invitations_duree
  check (expires_at <= created_at + interval '60 days');
