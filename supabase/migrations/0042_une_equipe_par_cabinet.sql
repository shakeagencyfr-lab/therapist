-- ============================================================================
-- 0042 — Une équipe par cabinet : inviter, rattacher, relancer, retirer
-- ============================================================================
--
-- L'offre « Réseau » vend « plusieurs praticiennes par cabinet ». Le schéma,
-- lui, ne savait en rattacher qu'une.
--
-- 0030 a borné la CONSOMMATION d'une invitation par la même règle que sa
-- création : un cabinet qui a déjà un membre n'en accepte plus. C'était la
-- bonne réponse à un vrai trou — un revendeur posait pendant l'amorçage une
-- seconde invitation pour une adresse à lui, la laissait dormir, et devenait
-- membre des mois plus tard, dossiers compris. Mais la règle ne distinguait
-- pas QUI avait posé l'invitation : celle qu'une titulaire adressait à sa
-- consœur tombait sous le même refus. La consœur se connectait et n'obtenait
-- rien, à chaque fois, sans un mot.
--
-- Ce qui se borne vraiment, c'est l'AUTEUR :
--
--   - l'amorçage reste ce qu'il était : une invitation « titulaire », posée
--     par le revendeur, dans un cabinet encore vide ;
--   - dans un cabinet qui a déjà sa titulaire, seule passe une invitation
--     « membre de l'équipe » posée par une titulaire EN PLACE au moment où
--     l'invitée se connecte.
--
-- Le revendeur, lui, ne peut toujours rien poser dans un cabinet tenu (0021),
-- et il ne peut plus poser qu'une invitation de titulaire : une invitation de
-- membre qu'il aurait glissée pendant l'amorçage n'a pas d'auteur valable, et
-- ne rattache personne. La porte de 0030 reste fermée.
--
-- Encore fallait-il que l'auteur soit vrai. `invited_by` était une colonne
-- comme une autre, écrite par le navigateur : n'importe qui pouvait y mettre
-- l'identifiant de la future titulaire — lisible par le revendeur dans ses
-- autres cabinets. Il est désormais posé par la base, à partir du jeton.
--
-- Même chose pour `created_at` : la borne de durée de 0030
-- (expires_at <= created_at + 60 jours) ne bornait rien tant que le
-- navigateur choisissait aussi la date de création.
--
-- Et l'équipe se gère enfin : la titulaire invite, relance, annule, retire.
-- Une consœur, elle, voit l'équipe mais ne la modifie pas — jusqu'ici, la
-- politique « le cabinet gère ses membres » permettait à N'IMPORTE QUEL
-- membre de s'inscrire titulaire, d'ajouter un compte de son choix, ou de
-- retirer la titulaire elle-même.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Le nom de la personne invitée
-- ----------------------------------------------------------------------------
--
-- Le revendeur saisit « Claire Fontaine » en ouvrant le cabinet ; claim_access
-- inscrivait « claire.fontaine », la partie gauche de l'adresse. Le nom
-- saisi était perdu dès l'écriture : il n'avait nulle part où aller.
alter table public.cabinet_invitations
  add column if not exists display_name text;

alter table public.cabinet_invitations
  drop constraint if exists cabinet_invitations_nom;
alter table public.cabinet_invitations
  add constraint cabinet_invitations_nom
  check (display_name is null or char_length(display_name) <= 120);

-- ----------------------------------------------------------------------------
-- 2. Qui est titulaire
-- ----------------------------------------------------------------------------
--
-- SECURITY DEFINER pour la même raison que is_cabinet_member : une politique
-- de cabinet_members qui lirait cabinet_members sous RLS tournerait en rond.
create or replace function public.est_titulaire_du_cabinet(p_cabinet uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.cabinet_members m
     where m.cabinet_id = p_cabinet
       and m.user_id = auth.uid()
       and m.role = 'owner'
  );
$$;

revoke execute on function public.est_titulaire_du_cabinet(uuid) from public, anon;
grant execute on function public.est_titulaire_du_cabinet(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. L'auteur et la date d'une invitation sont posés par la base
-- ----------------------------------------------------------------------------
--
-- À la création, et à chaque RELANCE — nouvelle adresse, nouvelle échéance,
-- nouveau rôle : c'est une invitation reposée, et c'est celle ou celui qui la
-- repose qui en répond. Tout le reste (l'acceptation par claim_access, en
-- particulier) laisse l'auteur et la date tels quels : sans cela, la personne
-- qui accepte deviendrait l'autrice de sa propre invitation.
--
-- Sans jeton — la clé de service, une épreuve jouée en superutilisateur —
-- l'auteur fourni est gardé : c'est le serveur qui parle.
create or replace function public.cabinet_invitations_auteur()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.cabinet_id is distinct from old.cabinet_id then
    raise exception 'Une invitation ne change pas de cabinet.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT'
     or new.email      is distinct from old.email
     or new.expires_at is distinct from old.expires_at
     or new.role       is distinct from old.role then
    new.created_at := now();
    if auth.uid() is not null then
      new.invited_by := auth.uid();
    end if;
  else
    new.created_at := old.created_at;
    new.invited_by := old.invited_by;
  end if;
  return new;
end;
$$;

revoke execute on function public.cabinet_invitations_auteur() from public, anon, authenticated;

drop trigger if exists cabinet_invitations_auteur on public.cabinet_invitations;
create trigger cabinet_invitations_auteur
  before insert or update on public.cabinet_invitations
  for each row execute function public.cabinet_invitations_auteur();

-- ----------------------------------------------------------------------------
-- 4. Les invitations : la titulaire pour son équipe, le revendeur pour l'amorçage
-- ----------------------------------------------------------------------------

-- « Le cabinet invite ses praticiennes » ouvrait tout, à tout membre : créer,
-- modifier, supprimer, avec le rôle de son choix — titulaire compris.
drop policy if exists "le cabinet invite ses praticiennes" on public.cabinet_invitations;

-- La titulaire invite un membre d'équipe. Jamais une autre titulaire : ce
-- rôle-là ne s'obtient que par l'amorçage.
create policy "la titulaire invite son equipe"
  on public.cabinet_invitations for insert to authenticated
  with check (
    public.est_titulaire_du_cabinet(cabinet_id)
    and role = 'therapist'
  );

-- Relancer (nouvelle échéance) ou corriger l'adresse d'une invitation en
-- attente. Relancer l'invitation d'ouverture restée sans suite en fait une
-- invitation de membre : la titulaire est déjà là.
create policy "la titulaire relance une invitation"
  on public.cabinet_invitations for update to authenticated
  using (public.est_titulaire_du_cabinet(cabinet_id) and accepted_at is null)
  with check (
    public.est_titulaire_du_cabinet(cabinet_id)
    and role = 'therapist'
    and accepted_at is null
  );

create policy "la titulaire annule une invitation"
  on public.cabinet_invitations for delete to authenticated
  using (public.est_titulaire_du_cabinet(cabinet_id) and accepted_at is null);

-- Le revendeur : l'amorçage seulement, donc une invitation de titulaire. Une
-- invitation de membre posée par lui ne rattacherait de toute façon personne
-- (claim_access, plus bas) ; autant la refuser à l'écriture, où l'écran peut
-- le dire.
drop policy if exists "le revendeur ouvre un cabinet vide" on public.cabinet_invitations;
create policy "le revendeur ouvre un cabinet vide"
  on public.cabinet_invitations for insert to authenticated
  with check (
    public.is_reseller_of_cabinet(cabinet_id)
    and not public.cabinet_a_un_membre(cabinet_id)
    and role = 'owner'
  );

drop policy if exists "le revendeur corrige une invitation en attente" on public.cabinet_invitations;
create policy "le revendeur corrige une invitation en attente"
  on public.cabinet_invitations for update to authenticated
  using (
    public.is_reseller_of_cabinet(cabinet_id)
    and not public.cabinet_a_un_membre(cabinet_id)
    and accepted_at is null
  )
  with check (
    public.is_reseller_of_cabinet(cabinet_id)
    and not public.cabinet_a_un_membre(cabinet_id)
    and role = 'owner'
    and accepted_at is null
  );

-- ----------------------------------------------------------------------------
-- 5. Les membres : lus par l'équipe, jamais écrits par le navigateur
-- ----------------------------------------------------------------------------
--
-- L'entrée passe par claim_access, la sortie par retirer_du_cabinet : deux
-- fonctions qui savent qui a le droit. La politique d'origine existe en deux
-- orthographes selon les bases (0021 le rappelait déjà pour les invitations).
drop policy if exists "le cabinet gère ses membres" on public.cabinet_members;
drop policy if exists "le cabinet gere ses membres" on public.cabinet_members;

revoke insert, update, delete on public.cabinet_members from authenticated;

-- ----------------------------------------------------------------------------
-- 6. L'équipe, telle que l'écran « Équipe » la montre
-- ----------------------------------------------------------------------------
--
-- L'adresse de chacun vit dans auth.users, que le navigateur ne lit pas. On
-- la rend aux seuls membres du cabinet : ce sont des collègues, et c'est à
-- cette adresse qu'on relance ou qu'on reconnaît quelqu'un. Le revendeur n'en
-- a pas besoin — il voit déjà les noms, et c'est tout ce que son portefeuille
-- affiche.
create or replace function public.equipe_du_cabinet(p_cabinet uuid)
returns table (
  user_id      uuid,
  display_name text,
  email        text,
  role         public.cabinet_role,
  created_at   timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, m.display_name, u.email::text, m.role, m.created_at
    from public.cabinet_members m
    join auth.users u on u.id = m.user_id
   where m.cabinet_id = p_cabinet
     and public.is_cabinet_member(p_cabinet)
   order by (m.role = 'owner') desc, m.created_at;
$$;

revoke execute on function public.equipe_du_cabinet(uuid) from public, anon;
grant execute on function public.equipe_du_cabinet(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Retirer quelqu'un de l'équipe
-- ----------------------------------------------------------------------------
--
-- Rend un mot, jamais une exception : l'écran traduit, et un refus n'est pas
-- une panne.
--   'ok'                 retiré ;
--   'pas_titulaire'      l'appelant n'est pas titulaire de ce cabinet ;
--   'soi_meme'           on ne se retire pas soi-même : un cabinet sans
--                        titulaire ne se gère plus, et plus personne ne
--                        pourrait y inviter qui que ce soit ;
--   'derniere_titulaire' la dernière titulaire reste ;
--   'inconnue'           cette personne n'est pas (ou plus) dans l'équipe.
--
-- Les invitations en attente qu'elle avait posées partent avec elle :
-- claim_access ne les honorerait plus (leur autrice n'est plus titulaire), et
-- elles resteraient affichées comme si elles pouvaient encore aboutir.
create or replace function public.retirer_du_cabinet(p_cabinet uuid, p_user uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.cabinet_role;
  v_titulaires integer;
begin
  if auth.uid() is null or not public.est_titulaire_du_cabinet(p_cabinet) then
    return 'pas_titulaire';
  end if;
  if p_user = auth.uid() then
    return 'soi_meme';
  end if;

  -- Deux retraits croisés ne doivent pas laisser le cabinet sans titulaire.
  perform 1 from public.cabinet_members where cabinet_id = p_cabinet for update;

  select m.role into v_role
    from public.cabinet_members m
   where m.cabinet_id = p_cabinet and m.user_id = p_user;
  if v_role is null then
    return 'inconnue';
  end if;

  if v_role = 'owner' then
    select count(*) into v_titulaires
      from public.cabinet_members m
     where m.cabinet_id = p_cabinet and m.role = 'owner';
    if v_titulaires <= 1 then
      return 'derniere_titulaire';
    end if;
  end if;

  delete from public.cabinet_members
   where cabinet_id = p_cabinet and user_id = p_user;

  delete from public.cabinet_invitations
   where cabinet_id = p_cabinet and invited_by = p_user and accepted_at is null;

  -- Trace technique : qui a retiré qui, jamais de contenu de dossier.
  insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id)
  values (p_cabinet, auth.uid(), 'cabinet.membre_retire', 'cabinet_members', p_user);

  return 'ok';
end;
$$;

revoke execute on function public.retirer_du_cabinet(uuid, uuid) from public, anon;
grant execute on function public.retirer_du_cabinet(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. claim_access() : rattacher la consœur, garder la porte de 0030
-- ----------------------------------------------------------------------------
--
-- Repris de la définition en production (identique à 0030), trois
-- changements dans le bloc du cabinet :
--
--   a) la règle d'acceptation distingue l'amorçage de l'équipe (en tête de
--      fichier) ;
--   b) le nom saisi à l'invitation est repris ; l'adresse ne sert plus que de
--      repli ;
--   c) une invitation pour un cabinet dont la personne est DÉJÀ membre est
--      close au passage — sinon l'écran « Équipe » la montrerait en attente
--      pour toujours, et l'index unique interdirait d'en poser une autre.
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

  -- Une invitation de cabinet encore valable, et recevable :
  --   - titulaire : seulement dans un cabinet encore vide (l'amorçage) ;
  --   - membre d'équipe : seulement si son autrice est titulaire de ce
  --     cabinet AUJOURD'HUI. Une invitation glissée par le revendeur pendant
  --     l'amorçage n'a pas cette autrice, et ne rattache personne.
  begin
    insert into public.cabinet_members (cabinet_id, user_id, role, display_name)
    select i.cabinet_id, auth.uid(), i.role,
           coalesce(nullif(btrim(i.display_name), ''), split_part(v_email, '@', 1))
      from public.cabinet_invitations i
     where lower(i.email) = lower(v_email)
       and i.accepted_at is null
       and i.expires_at > now()
       -- Un cabinet déjà rejoint ne doit pas masquer l'invitation d'un autre.
       and not exists (
         select 1 from public.cabinet_members d
          where d.cabinet_id = i.cabinet_id and d.user_id = auth.uid()
       )
       and (
         (i.role = 'owner' and not public.cabinet_a_un_membre(i.cabinet_id))
         or (
           i.role = 'therapist'
           and exists (
             select 1 from public.cabinet_members t
              where t.cabinet_id = i.cabinet_id
                and t.user_id = i.invited_by
                and t.role = 'owner'
           )
         )
       )
     order by i.created_at
     limit 1
    on conflict (cabinet_id, user_id) do nothing
    returning cabinet_id into v_cabinet;
  exception when others then
    v_cabinet := null;
  end;

  -- Close toute invitation vers un cabinet dont le compte est membre : celle
  -- qu'on vient d'accepter, et celles devenues sans objet.
  update public.cabinet_invitations i
     set accepted_at = now()
   where lower(i.email) = lower(v_email)
     and i.accepted_at is null
     and exists (
       select 1 from public.cabinet_members m
        where m.cabinet_id = i.cabinet_id and m.user_id = auth.uid()
     );

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
