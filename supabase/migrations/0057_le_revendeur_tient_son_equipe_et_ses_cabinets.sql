-- ============================================================================
-- 0057 — Le revendeur tient son équipe, ses cabinets et sa porte de support
-- ============================================================================
--
-- Trois gestes évidents manquaient à l'espace revendeur, et chacun butait sur
-- la base avant de buter sur l'écran.
--
-- 1. FERMER UN CABINET NE FERMAIT RIEN. `cabinets.archived_at` existait
--    depuis 0001 ; seule la thérapeute se voyait refuser de le poser (0048).
--    Posé, il ne changeait rien : `my_context()` rendait toujours le cabinet
--    et ses patients, la vitrine répondait, la boutique vendait, les leviers
--    restaient ouverts, et l'espace de chaque patient s'ouvrait comme avant.
--    Désormais, un cabinet fermé :
--      - n'est plus « en règle » : `abonnement_en_regle()` rend faux, ce qui
--        ferme d'un seul coup tout ce qui en dépend déjà (boutique, marque
--        blanche et son domaine, site vitrine, analyse, ouverture et
--        réouverture de fiches) ;
--      - ferme la porte de ses patients, exactement comme un suivi clos
--        (0044) : `is_patient_record()` et la politique « le patient lit sa
--        fiche » exigent un cabinet ouvert, `my_context()` ne rend plus la
--        fiche, et les deux gestes patients qui lisaient la fiche eux-mêmes
--        suivent. Un patient ne doit pas continuer d'écrire à une thérapeute
--        qui ne le lira plus, dans un espace que plus rien ne suit ;
--      - n'a plus de page publique : `cabinet_vitrine()` ne le rend plus (la
--        porte, le widget /e/<slug>) ; `site_vitrine()` et
--        `cabinet_par_domaine()` suivent déjà le contrat ;
--      - n'accepte plus personne : `claim_access()` n'y rattache ni titulaire
--        ni consœur (les invitations attendent : elles reprennent vie à la
--        réouverture si elles courent encore).
--    Ce qui NE se ferme PAS, volontairement : la praticienne garde l'accès à
--    ses dossiers (`is_cabinet_member()` n'est pas touchée, 0056). Elle en est
--    responsable, elle doit pouvoir les relire, les exporter et répondre à
--    une demande d'accès d'un patient. Rien n'est effacé : rouvrir rend tout.
--    Fermer et rouvrir sont réservés au PROPRIÉTAIRE du revendeur, datés par
--    la base, et inscrits au journal des contrats.
--
-- 2. L'ÉQUIPE DU REVENDEUR N'AVAIT PAS DE PORTE. `reseller_invitations`
--    existe depuis 0006, sous une politique unique qui ouvrait TOUT à TOUT
--    membre : un membre de l'équipe pouvait s'inviter propriétaire sous une
--    autre adresse, et une invitation posée par une personne retirée depuis
--    rattachait encore. On reprend ce que 0042 a fait pour l'équipe d'un
--    cabinet : l'autrice et la date sont posées par la base, seul un
--    propriétaire invite, relance, annule et retire — jamais lui-même, jamais
--    le dernier propriétaire —, et `claim_access()` n'honore qu'une
--    invitation dont l'autrice est propriétaire au moment où l'invitée se
--    connecte (ou que la plateforme a posée, sans autrice).
--
-- 3. LES COORDONNÉES DE SUPPORT NE SE RÉGLAIENT PAS. Le bandeau de contrat de
--    la thérapeute nomme son revendeur et son adresse (0049) — mais rien ne
--    permettait au revendeur de les écrire. Le propriétaire les règle
--    désormais, ces deux colonnes seulement.
--
-- Données de santé : rien de ce qui suit ne lit ni n'écrit un contenu de
-- dossier. Le journal ne garde que des faits (qui a fermé quel cabinet, qui a
-- retiré qui), jamais un texte de patient.
-- ============================================================================


-- ============================================================================
-- 1. Un cabinet ouvert
-- ============================================================================
--
-- Une seule définition, lue par la politique des fiches et par les fonctions
-- du côté patient. SECURITY DEFINER : un patient ne lit pas `cabinets`
-- (aucune politique ne le lui ouvre), et il faut pourtant savoir si le sien
-- est ouvert.
create or replace function public.cabinet_ouvert(p_cabinet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cabinets c
     where c.id = p_cabinet
       and c.archived_at is null
  );
$$;

comment on function public.cabinet_ouvert(uuid) is
  'Le cabinet existe-t-il et n''est-il pas fermé par son revendeur (0057) ?';

revoke execute on function public.cabinet_ouvert(uuid) from public, anon;
grant execute on function public.cabinet_ouvert(uuid) to authenticated, service_role;


-- ============================================================================
-- 2. Un cabinet fermé n'est plus en règle
-- ============================================================================
--
-- Définition de production (0035) ; la jointure sur le cabinet est nouvelle.
-- C'est la seule règle que lisent la boutique, la marque blanche, le site,
-- l'analyse (server/ai.ts) et le plafond de fiches : la fermer ici les ferme
-- tous, sans réécrire aucun d'eux.
create or replace function public.abonnement_en_regle(p_cabinet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case s.status
      when 'actif' then true
      when 'essai' then coalesce(s.trial_ends_at, 'infinity'::timestamptz) > now()
      else false
    end
    from public.subscriptions s
    join public.cabinets c on c.id = s.cabinet_id
    where s.cabinet_id = p_cabinet
      and c.archived_at is null
  ), false);
$$;


-- ============================================================================
-- 3. La porte des patients d'un cabinet fermé
-- ============================================================================
--
-- Définition de production (0044) ; la condition sur le cabinet est nouvelle.
-- Toutes les politiques du côté patient passent par elle — modules, audios
-- et leur stockage, journal, affirmations, commandes, échelle, notifications,
-- quiz —, et celles que 0054 et 0055 ajoutent aussi : elles suivent sans être
-- réécrites.
create or replace function public.is_patient_record(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.patients p
      join public.cabinets c on c.id = p.cabinet_id
     where p.id = p_patient
       and p.auth_user_id = auth.uid()
       and p.archived_at is null
       and c.archived_at is null
  );
$$;

comment on function public.is_patient_record(uuid) is
  'Cette fiche est-elle celle du compte connecté, son suivi en cours, et son cabinet ouvert ? Un suivi clos ou un cabinet fermé ne rouvre rien à son patient.';

-- La fiche elle-même a sa politique propre (0044, réécrite en 0050).
drop policy if exists "le patient lit sa fiche" on public.patients;
create policy "le patient lit sa fiche" on public.patients
  for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    and archived_at is null
    and public.cabinet_ouvert(cabinet_id)
  );

-- Définition de production ; la seule différence est la condition sur le
-- cabinet. Les deux fonctions lisaient la fiche sans passer par
-- is_patient_record() : sans elle, une note d'échelle s'écrivait encore dans
-- un cabinet fermé, par un appel direct.
create or replace function public.patient_cabinet_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'booking_url', s.booking_url,
    'booking_mode', coalesce(s.booking_mode, 'bouton'),
    'booking_widget_url', s.booking_widget_url,
    -- Contrat, offre, réglage du cabinet : la même règle que la vitrine.
    'shop_enabled', public.boutique_ouverte_pour_moi(p.cabinet_id)
  )
  from public.patients p
  left join public.cabinet_settings s on s.cabinet_id = p.cabinet_id
  where p.auth_user_id = auth.uid()
    and p.archived_at is null
    and public.cabinet_ouvert(p.cabinet_id)
  limit 1;
$$;

create or replace function public.patient_note_echelle(p_value integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid;
  v_cabinet uuid;
  v_ligne   uuid;
begin
  select p.id, p.cabinet_id into v_patient, v_cabinet
  from public.patients p
  where p.auth_user_id = auth.uid()
    and p.archived_at is null
    and public.cabinet_ouvert(p.cabinet_id)
  limit 1;

  if v_patient is null then
    raise exception 'Aucune fiche active pour ce compte.';
  end if;
  if p_value is null or p_value < 0 or p_value > 10 then
    raise exception 'Cette valeur est hors de l''échelle.';
  end if;

  select e.id into v_ligne
  from public.scale_entries e
  where e.patient_id = v_patient
    and (e.recorded_at at time zone 'Europe/Paris')::date
        = (now() at time zone 'Europe/Paris')::date
  order by e.recorded_at desc
  limit 1;

  if v_ligne is null then
    insert into public.scale_entries (patient_id, cabinet_id, value)
    values (v_patient, v_cabinet, p_value);
  else
    update public.scale_entries
       set value = p_value, recorded_at = now()
     where id = v_ligne;
  end if;
end;
$$;


-- ============================================================================
-- 4. my_context() : la fiche d'un cabinet fermé ne s'ouvre plus
-- ============================================================================
--
-- Définition de production ; deux changements.
--   - 'patient' : seulement dans un cabinet ouvert. L'espace patient affiche
--     alors « Aucun suivi en cours », comme pour un suivi clos, avec la
--     suppression du compte toujours possible (server/compte.ts).
--   - 'cabinet' : un compte membre de deux cabinets reçoit d'abord celui qui
--     est ouvert. Sans ordre, `limit 1` pouvait rendre le cabinet fermé et
--     cacher l'autre.
-- Le cabinet fermé reste rendu à sa praticienne : ses dossiers sont à elle.
create or replace function public.my_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
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
      order by (c.archived_at is null) desc, m.created_at
      limit 1
    ),
    'patient', (
      select jsonb_build_object(
        'id', p.id, 'cabinet_id', p.cabinet_id, 'display_name', p.display_name,
        'cabinet_name', c.name, 'branding', c.branding
      )
      from public.patients p
      join public.cabinets c on c.id = p.cabinet_id
      where p.auth_user_id = auth.uid()
        and p.archived_at is null
        and c.archived_at is null
      limit 1
    )
  );
$$;


-- ============================================================================
-- 5. La page publique d'un cabinet fermé ne répond plus
-- ============================================================================
--
-- Définition de production (0049) ; la condition est nouvelle. C'est elle qui
-- habille la porte /<identifiant>, l'espace /<identifiant>/mon et le widget
-- /e/<identifiant> : sans elle, un cabinet fermé gardait sa marque sur une
-- porte qui n'ouvrait plus rien. La porte retombe sur celle du produit, où la
-- praticienne se connecte toujours.
create or replace function public.cabinet_vitrine(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', c.slug,
    'name', c.name,
    'tagline', c.tagline,
    'branding', c.branding
  )
  from public.cabinets c
  where c.id = public.cabinet_du_slug(p_slug)
    and c.archived_at is null
  limit 1;
$$;


-- ============================================================================
-- 6. Les droits disent la fermeture
-- ============================================================================
--
-- Définition de production (0049) ; `ferme` et `ferme_le` sont nouveaux. Le
-- bandeau de la thérapeute disait « Votre abonnement a pris fin » à un
-- cabinet fermé dont le contrat courait encore : faux, et sans le vrai motif.
create or replace function public.cabinet_droits(p_cabinet uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_cabinet_member(p_cabinet) or public.is_reseller_of_cabinet(p_cabinet)
    then (
      select jsonb_build_object(
        'max_patients',       case when r.ok then coalesce(s.max_patients_override, p.max_patients)
                                   else n.actives end,
        'patients_actives',   n.actives,
        'shop',               r.ok and coalesce(s.shop_override,           p.shop,           false),
        'marque_blanche',     r.ok and coalesce(s.marque_blanche_override, p.marque_blanche, false),
        'site',               r.ok and coalesce(s.site_override,           p.site,           false),
        'offre',              p.label,
        'offre_code',         p.code,
        'en_regle',           r.ok,
        'statut',             s.status::text,
        'echeance',           coalesce(s.current_period_end, s.trial_ends_at),
        'fin_essai',          case when s.status = 'essai' then s.trial_ends_at end,
        'revendeur',          rv.name,
        'revendeur_courriel', rv.support_email,
        'ferme',              c.archived_at is not null,
        'ferme_le',           c.archived_at
      )
      from (select public.abonnement_en_regle(p_cabinet) as ok) r,
           (select count(*)::int as actives from public.patients pa
             where pa.cabinet_id = p_cabinet and pa.archived_at is null) n
    )
  end
  from public.cabinets c
  left join public.subscriptions s on s.cabinet_id = c.id
  left join public.plans p on p.code = s.plan_code
  left join public.resellers rv on rv.id = c.reseller_id
  where c.id = p_cabinet;
$$;


-- ============================================================================
-- 7. Fermer et rouvrir : le propriétaire, la date de la base, le journal
-- ============================================================================
--
-- La politique « revendeur modifie ses cabinets » ouvre la mise à jour à tout
-- membre du revendeur : un membre de l'équipe aurait fermé d'un clic l'espace
-- de centaines de patients. Le déclencheur réserve le geste au propriétaire,
-- quel que soit le chemin — la fonction ci-dessous, ou une écriture directe.
-- La thérapeute, elle, est déjà arrêtée plus tôt (garder_ce_qui_revient_au_
-- revendeur, 0048), avec son propre message.
--
-- La date est celle de la base : une fermeture « le mois dernier » posée par
-- le navigateur réécrirait l'histoire du contrat. Refermer un cabinet déjà
-- fermé garde la date de la première fermeture.
create or replace function public.garder_la_fermeture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is not distinct from old.archived_at then
    return new;
  end if;
  if auth.uid() is not null and not public.is_reseller_owner(old.reseller_id) then
    raise exception 'Seul un propriétaire du compte revendeur ferme ou rouvre un cabinet.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.archived_at is not null then
    new.archived_at := coalesce(old.archived_at, now());
  end if;
  return new;
end;
$$;

revoke execute on function public.garder_la_fermeture() from public, anon, authenticated;

drop trigger if exists cabinets_fermeture on public.cabinets;
create trigger cabinets_fermeture
  before update of archived_at on public.cabinets
  for each row execute function public.garder_la_fermeture();

-- Le journal : un fait, daté, et son auteur. Rien d'autre.
create or replace function public.journaliser_la_fermeture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is not distinct from old.archived_at then
    return null;
  end if;
  insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
  values (
    new.id,
    auth.uid(),
    case when new.archived_at is null then 'cabinet.rouvert' else 'cabinet.ferme' end,
    'cabinets',
    new.id,
    jsonb_build_object('reseller_id', new.reseller_id)
  );
  return null;
end;
$$;

revoke execute on function public.journaliser_la_fermeture() from public, anon, authenticated;

drop trigger if exists cabinets_journal_fermeture on public.cabinets;
create trigger cabinets_journal_fermeture
  after update of archived_at on public.cabinets
  for each row execute function public.journaliser_la_fermeture();

-- Le geste de l'écran. Rend un mot, jamais une exception : un refus n'est pas
-- une panne, et l'écran le traduit (src/lib/revendeur.ts).
--   'ok'                le cabinet est fermé (ou rouvert) ;
--   'pas_proprietaire'  l'appelant n'est pas propriétaire de ce revendeur ;
--   'inconnu'           ce cabinet n'est pas le sien, ou n'existe pas ;
--   'deja_ferme'        fermé entre-temps (un autre onglet, un collègue) ;
--   'deja_ouvert'       rouvert entre-temps.
create or replace function public.revendeur_fermer_cabinet(p_cabinet uuid, p_fermer boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revendeur uuid;
  v_ferme_le  timestamptz;
begin
  if auth.uid() is null or p_fermer is null then
    return 'inconnu';
  end if;

  select c.reseller_id, c.archived_at into v_revendeur, v_ferme_le
    from public.cabinets c
   where c.id = p_cabinet
   for update;
  if v_revendeur is null or not public.is_reseller_member(v_revendeur) then
    return 'inconnu';
  end if;
  if not public.is_reseller_owner(v_revendeur) then
    return 'pas_proprietaire';
  end if;
  if p_fermer and v_ferme_le is not null then
    return 'deja_ferme';
  end if;
  if not p_fermer and v_ferme_le is null then
    return 'deja_ouvert';
  end if;

  update public.cabinets
     set archived_at = case when p_fermer then now() end
   where id = p_cabinet;
  return 'ok';
end;
$$;

revoke execute on function public.revendeur_fermer_cabinet(uuid, boolean) from public, anon;
grant execute on function public.revendeur_fermer_cabinet(uuid, boolean) to authenticated;


-- ============================================================================
-- 8. Le journal des contrats dit aussi la fermeture ; la fiche a le sien
-- ============================================================================
--
-- Définition de production (0049) ; la troisième branche est nouvelle.
create or replace function public.journal_des_contrats(p_limite integer default 50)
returns table (quand timestamptz, action text, cabinet_id uuid, cabinet text, meta jsonb, auteur text)
language sql
stable
security definer
set search_path = ''
as $$
  with mes_revendeurs as (
    select m.reseller_id from public.reseller_members m where m.user_id = auth.uid()
  )
  select l.created_at,
         l.action,
         l.cabinet_id,
         c.name,
         l.meta - 'reseller_id',
         case
           when l.actor_user_id is null then 'plateforme'
           when l.actor_user_id = auth.uid() then 'vous'
           else 'equipe'
         end
    from public.audit_log l
    left join public.cabinets c on c.id = l.cabinet_id
   where (l.target_table = 'subscriptions' and l.action like 'contrat.%'
          and c.reseller_id in (select reseller_id from mes_revendeurs))
      or (l.target_table = 'plans' and l.action like 'offre.%'
          and l.meta->>'reseller_id' in (select reseller_id::text from mes_revendeurs))
      or (l.target_table = 'cabinets' and l.action in ('cabinet.ferme', 'cabinet.rouvert')
          and c.reseller_id in (select reseller_id from mes_revendeurs))
   order by l.created_at desc, l.id desc
   limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;

-- L'historique d'UN cabinet, pour sa fiche. Le journal général n'en garde que
-- les cinquante derniers gestes, tous cabinets confondus : l'histoire d'un
-- contrat vieux d'un an s'y perdait.
create or replace function public.journal_du_cabinet(p_cabinet uuid, p_limite integer default 100)
returns table (quand timestamptz, action text, cabinet_id uuid, cabinet text, meta jsonb, auteur text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.created_at,
         l.action,
         l.cabinet_id,
         c.name,
         l.meta - 'reseller_id',
         case
           when l.actor_user_id is null then 'plateforme'
           when l.actor_user_id = auth.uid() then 'vous'
           else 'equipe'
         end
    from public.audit_log l
    join public.cabinets c on c.id = l.cabinet_id
   where l.cabinet_id = p_cabinet
     and public.is_reseller_of_cabinet(p_cabinet)
     and (
       (l.target_table = 'subscriptions' and l.action like 'contrat.%')
       or (l.target_table = 'cabinets' and l.action in ('cabinet.ferme', 'cabinet.rouvert'))
     )
   order by l.created_at desc, l.id desc
   limit least(greatest(coalesce(p_limite, 100), 1), 500);
$$;

revoke execute on function public.journal_du_cabinet(uuid, integer) from public, anon;
grant execute on function public.journal_du_cabinet(uuid, integer) to authenticated;


-- ============================================================================
-- 9. L'équipe du revendeur : qui invite, qui signe, qui retire
-- ============================================================================

-- 9a. Une invitation EN ATTENTE par adresse, et non une pour toujours.
--
-- La contrainte d'origine portait sur (revendeur, adresse), invitations
-- acceptées comprises : une personne retirée de l'équipe ne pouvait plus
-- jamais y être réinvitée, et l'adresse en majuscules passait à côté. Même
-- règle que les invitations de cabinet.
alter table public.reseller_invitations
  drop constraint if exists reseller_invitations_reseller_id_email_key;

create unique index if not exists reseller_invitations_attente_idx
  on public.reseller_invitations (reseller_id, lower(email))
  where accepted_at is null;

-- La clé étrangère garde un index entier : l'index unique ci-dessus ne couvre
-- que les invitations en attente.
create index if not exists reseller_invitations_reseller_idx
  on public.reseller_invitations (reseller_id);

-- 9b. L'autrice et la date sont posées par la base (comme 0042 pour les
--     cabinets). Sans cela, `invited_by` était écrit par le navigateur, et la
--     borne de soixante jours (0030) ne bornait rien tant que le navigateur
--     choisissait aussi `created_at`.
create or replace function public.reseller_invitations_auteur()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.reseller_id is distinct from old.reseller_id then
    raise exception 'Une invitation ne change pas de revendeur.' using errcode = '42501';
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

revoke execute on function public.reseller_invitations_auteur() from public, anon, authenticated;

drop trigger if exists reseller_invitations_auteur on public.reseller_invitations;
create trigger reseller_invitations_auteur
  before insert or update on public.reseller_invitations
  for each row execute function public.reseller_invitations_auteur();

-- 9c. Les politiques : l'équipe voit, le propriétaire agit.
drop policy if exists "le revendeur gere ses invitations" on public.reseller_invitations;

drop policy if exists "l equipe du revendeur voit ses invitations" on public.reseller_invitations;
create policy "l equipe du revendeur voit ses invitations"
  on public.reseller_invitations for select to authenticated
  using (public.is_reseller_member(reseller_id));

drop policy if exists "le proprietaire invite dans son equipe" on public.reseller_invitations;
create policy "le proprietaire invite dans son equipe"
  on public.reseller_invitations for insert to authenticated
  with check (public.is_reseller_owner(reseller_id) and accepted_at is null);

drop policy if exists "le proprietaire relance une invitation" on public.reseller_invitations;
create policy "le proprietaire relance une invitation"
  on public.reseller_invitations for update to authenticated
  using (public.is_reseller_owner(reseller_id) and accepted_at is null)
  with check (public.is_reseller_owner(reseller_id) and accepted_at is null);

drop policy if exists "le proprietaire annule une invitation" on public.reseller_invitations;
create policy "le proprietaire annule une invitation"
  on public.reseller_invitations for delete to authenticated
  using (public.is_reseller_owner(reseller_id) and accepted_at is null);

-- 9d. Les membres ne s'écrivent jamais depuis le navigateur : l'entrée passe
--     par claim_access, la sortie par retirer_du_revendeur. Aucune politique
--     ne l'ouvrait ; le droit lui-même disparaît.
revoke insert, update, delete on public.reseller_members from authenticated;

-- 9e. L'équipe, telle que l'onglet « Équipe » la montre. L'adresse de chacun
--     vit dans auth.users, que le navigateur ne lit pas : on la rend aux
--     seuls membres du même revendeur, qui en ont besoin pour se reconnaître.
create or replace function public.equipe_du_revendeur()
returns table (
  reseller_id uuid,
  user_id     uuid,
  email       text,
  role        public.reseller_role,
  created_at  timestamptz,
  moi         boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.reseller_id, m.user_id, u.email::text, m.role, m.created_at, m.user_id = auth.uid()
    from public.reseller_members m
    join auth.users u on u.id = m.user_id
   where m.reseller_id in (
     select x.reseller_id from public.reseller_members x where x.user_id = auth.uid()
   )
   order by (m.role = 'owner') desc, m.created_at;
$$;

revoke execute on function public.equipe_du_revendeur() from public, anon;
grant execute on function public.equipe_du_revendeur() to authenticated;

-- 9f. Retirer quelqu'un de l'équipe. Rend un mot, jamais une exception.
--   'ok'                    retiré ;
--   'pas_proprietaire'      l'appelant n'est pas propriétaire de ce revendeur ;
--   'soi_meme'              on ne se retire pas soi-même ;
--   'dernier_proprietaire'  le dernier propriétaire reste ;
--   'inconnu'               cette personne n'est pas (ou plus) dans l'équipe.
-- Les invitations en attente qu'elle avait posées partent avec elle :
-- claim_access ne les honorerait plus, et l'écran les montrerait encore.
create or replace function public.retirer_du_revendeur(p_reseller uuid, p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.reseller_role;
  v_proprietaires integer;
begin
  if auth.uid() is null or not public.is_reseller_owner(p_reseller) then
    return 'pas_proprietaire';
  end if;
  if p_user = auth.uid() then
    return 'soi_meme';
  end if;

  -- Deux retraits croisés ne doivent pas laisser le revendeur sans propriétaire.
  perform 1 from public.reseller_members where reseller_id = p_reseller for update;

  select m.role into v_role
    from public.reseller_members m
   where m.reseller_id = p_reseller and m.user_id = p_user;
  if v_role is null then
    return 'inconnu';
  end if;

  if v_role = 'owner' then
    select count(*) into v_proprietaires
      from public.reseller_members m
     where m.reseller_id = p_reseller and m.role = 'owner';
    if v_proprietaires <= 1 then
      return 'dernier_proprietaire';
    end if;
  end if;

  delete from public.reseller_members
   where reseller_id = p_reseller and user_id = p_user;

  delete from public.reseller_invitations
   where reseller_id = p_reseller and invited_by = p_user and accepted_at is null;

  -- Trace technique : qui a retiré qui. Aucun cabinet n'est concerné.
  insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
  values (null, auth.uid(), 'revendeur.membre_retire', 'reseller_members', p_user,
          jsonb_build_object('reseller_id', p_reseller));

  return 'ok';
end;
$$;

revoke execute on function public.retirer_du_revendeur(uuid, uuid) from public, anon;
grant execute on function public.retirer_du_revendeur(uuid, uuid) to authenticated;


-- ============================================================================
-- 10. claim_access() : la porte du revendeur, celle d'un cabinet fermé
-- ============================================================================
--
-- Définition de production (0042) ; trois changements.
--   a) Cabinet : une invitation vers un cabinet fermé ne rattache personne.
--      Elle n'est pas close pour autant : si le cabinet rouvre avant son
--      échéance, elle vaut de nouveau.
--   b) Revendeur : n'est honorée qu'une invitation posée par la plateforme
--      (sans autrice : clé de service) ou par un propriétaire EN PLACE. Celle
--      qu'un propriétaire retiré depuis avait laissée ne rattache plus.
--   c) Revendeur : une invitation vers un revendeur dont la personne est déjà
--      membre est close au passage — elle resterait sinon « en attente »
--      pour toujours dans l'onglet Équipe, et l'index unique interdirait
--      d'en poser une autre.
create or replace function public.claim_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  --     l'amorçage n'a pas cette autrice, et ne rattache personne ;
  --   - et jamais dans un cabinet fermé (0057).
  begin
    insert into public.cabinet_members (cabinet_id, user_id, role, display_name)
    select i.cabinet_id, auth.uid(), i.role,
           coalesce(nullif(btrim(i.display_name), ''), split_part(v_email, '@', 1))
      from public.cabinet_invitations i
     where lower(i.email) = lower(v_email)
       and i.accepted_at is null
       and i.expires_at > now()
       and public.cabinet_ouvert(i.cabinet_id)
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

  -- Une invitation de revendeur encore valable, posée par la plateforme ou
  -- par un propriétaire en place (0057).
  begin
    insert into public.reseller_members (reseller_id, user_id, role)
    select i.reseller_id, auth.uid(), i.role
      from public.reseller_invitations i
     where lower(i.email) = lower(v_email)
       and i.accepted_at is null
       and i.expires_at > now()
       and not exists (
         select 1 from public.reseller_members d
          where d.reseller_id = i.reseller_id and d.user_id = auth.uid()
       )
       and (
         i.invited_by is null
         or exists (
           select 1 from public.reseller_members o
            where o.reseller_id = i.reseller_id
              and o.user_id = i.invited_by
              and o.role = 'owner'
         )
       )
     order by i.created_at
     limit 1
    on conflict (reseller_id, user_id) do nothing
    returning reseller_id into v_reseller;
  exception when others then
    v_reseller := null;
  end;

  -- Close toute invitation vers un revendeur dont le compte est membre.
  update public.reseller_invitations i
     set accepted_at = now()
   where lower(i.email) = lower(v_email)
     and i.accepted_at is null
     and exists (
       select 1 from public.reseller_members m
        where m.reseller_id = i.reseller_id and m.user_id = auth.uid()
     );

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
-- 11. Les coordonnées de support : le propriétaire, deux colonnes
-- ============================================================================
--
-- Le nom affiché et l'adresse de support sont ce que la thérapeute lit dans
-- son bandeau de contrat (« Écrivez à votre revendeur, … »). Rien d'autre de
-- la ligne ne se règle depuis le navigateur : l'identifiant (`slug`) porte
-- des adresses, et `accueille_demandes` (0060) désigne qui reçoit les
-- demandes d'essai de la plateforme — un revendeur ne se l'attribue pas.
alter table public.resellers
  drop constraint if exists resellers_nom;
alter table public.resellers
  add constraint resellers_nom
  check (char_length(btrim(name)) between 2 and 80);

alter table public.resellers
  drop constraint if exists resellers_courriel_support;
alter table public.resellers
  add constraint resellers_courriel_support
  check (
    support_email is null
    or (
      char_length(support_email) <= 254
      and support_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
    )
  );

revoke insert, update, delete on public.resellers from authenticated;
grant update (name, support_email) on public.resellers to authenticated;

drop policy if exists "le proprietaire regle ses coordonnees" on public.resellers;
create policy "le proprietaire regle ses coordonnees"
  on public.resellers for update to authenticated
  using (public.is_reseller_owner(id))
  with check (public.is_reseller_owner(id));


-- ============================================================================
-- 12. Le lundi ne réveille pas le serveur pour un cabinet qui ne peut rien
-- ============================================================================
--
-- Définition de production ; la condition sur le contrat est nouvelle. Le
-- serveur refuse déjà d'analyser pour un cabinet hors contrat — fermé
-- compris (server/ai.ts, analyserPourCabinet). Sans elle, la tâche était
-- réveillée à chaque passage pour des fiches qu'elle ne pouvait pas servir,
-- et le journal se remplissait d'échecs.
create or replace function public.declencher_affirmations()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if not exists (
    select 1
      from public.patient_settings s
      join public.patients p        on p.id = s.patient_id
      join public.cabinet_secrets k on k.cabinet_id = p.cabinet_id
     where s.affirmations_auto
       and p.archived_at is null
       and public.abonnement_en_regle(p.cabinet_id)
       and k.anthropic_key_enc is not null
       and not exists (
         select 1 from public.affirmations a
          where a.patient_id = p.id
            and a.published_at >= now() - interval '4 days'
       )
  ) then
    return;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'klaro_cron_secret';

  if v_secret is null then
    raise warning '[affirmations] le secret du planificateur manque dans le coffre : aucune reprise.';
    return;
  end if;

  -- La tâche s'accorde 48 secondes : la réponse arrive avant la minute.
  perform net.http_post(
    url := 'https://klaroweb.site/api/cron/affirmations',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 60000
  );
end;
$$;
