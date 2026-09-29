-- ============================================================================
-- 0055 — Les rappels reviennent, et se taisent sur l'écran verrouillé
-- ============================================================================
--
-- Trois manques, un seul chemin : celui de 0040 (pg_cron chaque minute,
-- declencher_rappels(), rappels_a_pousser(), server/push.ts). Rien de neuf
-- chez l'hébergeur : pas de fonction de plus, pas de planification de plus.
--
--   1. LA DISCRÉTION. Un mot de la thérapeute s'affichait en clair sur l'écran
--      verrouillé — « Votre exercice pour les crises du soir » —, lisible par
--      quiconque pose les yeux sur un téléphone laissé sur la table. C'est une
--      donnée de santé offerte au premier regard. Désormais, sauf choix
--      contraire de la personne suivie, le rappel arrive avec un texte neutre,
--      « Un nouveau mot dans votre espace », et le contenu ne se lit qu'en
--      ouvrant l'espace, derrière sa connexion.
--
--      MASQUÉ PAR DÉFAUT. Le réglage protège quelqu'un qui ne sait pas encore
--      qu'il existe : le premier rappel part avant qu'on ait eu l'idée d'aller
--      le chercher. L'inverse — afficher d'abord, masquer sur demande —
--      exposerait justement celles et ceux qui n'ont pas lu les réglages. Qui
--      préfère lire le mot d'un coup d'œil l'affiche en un geste, en
--      connaissance de cause.
--
--      LE CONTENU MASQUÉ NE QUITTE PAS LA BASE. rappels_a_pousser() rend
--      lui-même le texte neutre : le serveur ne reçoit pas ce qu'il ne doit pas
--      écrire. Il le vérifie une seconde fois (server/push.ts), pour le cas où
--      une base plus ancienne lui rendrait autre chose.
--
--   2. LE RAPPEL DU SOIR, choisi par la personne suivie : chaque soir à l'heure
--      qu'elle a dite (20 h 30 par défaut, heure de Paris), un rappel de sa
--      note du soir. Pas de rappel si la note est déjà prise, ni sur un suivi
--      clos, ni sans téléphone inscrit. C'est SON réglage : le cabinet ne le
--      lit ni ne le change.
--
--   3. LES RAPPELS QUI REVIENNENT, programmés par la thérapeute : « chaque
--      jour à 9 h », « chaque lundi à 18 h », pour quelques personnes, jusqu'à
--      une date de fin. À l'heure dite, la base écrit le mot du jour — un mot
--      du cabinet comme les autres, qui suit le même chemin jusqu'au
--      téléphone. Une seule fois par jour et par rappel (contrainte
--      d'unicité), rien après la date de fin, rien pour un suivi clos.
--
-- ATTENTION À QUI REDÉFINIRA APRÈS : cette migration redéfinit
-- declencher_rappels(), rappels_a_pousser() et patient_mots(). Une migration
-- postérieure qui y touche part de CES définitions, pas de celles de 0040.

-- ============================================================================
-- 1. Les réglages de la personne suivie
-- ============================================================================

create table if not exists public.preferences_rappels (
  patient_id      uuid primary key references public.patients(id) on delete cascade,
  -- Masqué tant qu'elle n'a rien choisi : voir plus haut.
  masquer_contenu boolean not null default true,
  soir_actif      boolean not null default false,
  soir_heure      time not null default '20:30',
  /* Quand l'heure ou l'activation ont changé. Un soir dont l'heure précède
     ce moment n'est pas dû : avancer son rappel de 21 h à 20 h, à 20 h 30,
     ne doit pas faire sonner le téléphone dans la minute. */
  soir_regle_le   timestamptz not null default now(),
  -- Le jour de Paris du dernier rappel du soir traité : un seul par soir.
  soir_envoye_le  date,
  -- Réclamé par un passage du serveur ; rendu au suivant après cinq minutes.
  soir_reclame_le timestamptz,
  soir_statut     text,
  modifie_le      timestamptz not null default now(),
  constraint preferences_rappels_minute check (extract(second from soir_heure) = 0),
  constraint preferences_rappels_statut check (soir_statut in ('envoyee', 'sans_appareil', 'echec'))
);

comment on table public.preferences_rappels is
  'Les réglages de rappel d''une personne suivie : discrétion sur l''écran verrouillé, rappel du soir. Lus et écrits par elle seule, au travers de deux fonctions ; le cabinet n''y a pas accès.';

/* AUCUNE POLITIQUE, AUCUN DROIT DIRECT. La personne lit et règle par
   patient_preferences_rappels() et patient_regler_rappels() ; le serveur,
   par sa clé de service. Le cabinet n'a pas à savoir qui masque ses rappels
   ni à quelle heure quelqu'un note sa soirée — et encore moins à le changer. */
alter table public.preferences_rappels enable row level security;
revoke all on table public.preferences_rappels from anon, authenticated;
grant all on table public.preferences_rappels to service_role;

/**
 * Ses réglages, valeurs par défaut comprises.
 *
 * Sans ligne, les valeurs par défaut : masqué, pas de rappel du soir, 20 h 30.
 * Aucune ligne rendue pour la fiche d'une autre — l'écran le lit comme un
 * échec, pas comme des réglages vierges.
 */
create or replace function public.patient_preferences_rappels(p_patient uuid)
returns table (masquer_contenu boolean, soir_actif boolean, soir_heure text)
language sql stable security definer set search_path = ''
as $$
  select coalesce(pr.masquer_contenu, true),
         coalesce(pr.soir_actif, false),
         to_char(coalesce(pr.soir_heure, time '20:30'), 'HH24:MI')
    from (select p_patient as id) f
    left join public.preferences_rappels pr on pr.patient_id = f.id
   where public.is_patient_record(p_patient);
$$;

revoke execute on function public.patient_preferences_rappels(uuid) from public, anon;
grant execute on function public.patient_preferences_rappels(uuid) to authenticated;

/**
 * Régler ses rappels. Un paramètre laissé vide ne change rien.
 *
 * L'heure arrive en « HH:MM » et se relit ici : un champ d'heure de téléphone
 * peut rendre des secondes, ou rien du tout, et un rappel réglé sur une heure
 * illisible ne partirait jamais sans que personne le sache.
 */
create or replace function public.patient_regler_rappels(
  p_patient uuid,
  p_masquer_contenu boolean default null,
  p_soir_actif boolean default null,
  p_soir_heure text default null
)
returns table (masquer_contenu boolean, soir_actif boolean, soir_heure text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_heure time;
begin
  if not public.is_patient_record(p_patient) then
    raise exception 'Cette fiche n''est pas la vôtre.' using errcode = '42501';
  end if;

  if p_soir_heure is not null then
    if p_soir_heure !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'Heure illisible : choisissez une heure et des minutes.' using errcode = '22023';
    end if;
    v_heure := p_soir_heure::time;
  end if;

  insert into public.preferences_rappels as pr (patient_id, masquer_contenu, soir_actif, soir_heure)
  values (p_patient, coalesce(p_masquer_contenu, true), coalesce(p_soir_actif, false), coalesce(v_heure, time '20:30'))
  on conflict (patient_id) do update
     set masquer_contenu = coalesce(p_masquer_contenu, pr.masquer_contenu),
         soir_actif      = coalesce(p_soir_actif, pr.soir_actif),
         soir_heure      = coalesce(v_heure, pr.soir_heure),
         soir_regle_le   = case
                             when coalesce(p_soir_actif, pr.soir_actif) is distinct from pr.soir_actif
                               or coalesce(v_heure, pr.soir_heure) is distinct from pr.soir_heure
                             then now()
                             else pr.soir_regle_le
                           end,
         modifie_le      = now();

  return query select * from public.patient_preferences_rappels(p_patient);
end;
$$;

revoke execute on function public.patient_regler_rappels(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.patient_regler_rappels(uuid, boolean, boolean, text) to authenticated;

-- ============================================================================
-- 2. Le contenu masqué ne quitte pas la base
-- ============================================================================
--
-- Même réclamation qu'en 0040 (et que sa reprise de 0044, qui écarte les
-- suivis clos), plus une colonne : `masque`. Quand il vaut vrai, le titre et
-- le texte sont déjà les neutres — le serveur n'a rien à retirer, il n'a
-- rien reçu. Le type rendu change : la fonction est recréée, pas remplacée.

drop function if exists public.rappels_a_pousser(integer);

create function public.rappels_a_pousser(p_limite integer default 50)
returns table (push_id uuid, patient_id uuid, titre text, corps text, masque boolean)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with dus as (
    select r.push_id, r.patient_id
      from public.push_recipients r
      join public.push_notifications n on n.id = r.push_id
      join public.patients p on p.id = r.patient_id
     where r.push_status is null
       and p.archived_at is null
       and coalesce(n.scheduled_at, n.created_at) <= now()
       and coalesce(n.scheduled_at, n.created_at) > now() - interval '2 hours'
       and (r.push_claimed_at is null or r.push_claimed_at < now() - interval '5 minutes')
     order by coalesce(n.scheduled_at, n.created_at)
     limit greatest(1, least(coalesce(p_limite, 50), 500))
     for update of r skip locked
  ),
  pris as (
    update public.push_recipients r
       set push_claimed_at = now()
      from dus
     where r.push_id = dus.push_id
       and r.patient_id = dus.patient_id
    returning r.push_id, r.patient_id
  )
  select pris.push_id,
         pris.patient_id,
         case when m.masque then 'Un nouveau mot dans votre espace' else n.title end,
         case when m.masque then 'Il se lit en ouvrant votre espace.' else n.body end,
         m.masque
    from pris
    join public.push_notifications n on n.id = pris.push_id
    -- Sans réglage posé, masqué : c'est le défaut, et il vaut ici aussi.
    cross join lateral (
      select coalesce(
               (select pr.masquer_contenu from public.preferences_rappels pr where pr.patient_id = pris.patient_id),
               true
             ) as masque
    ) m;
end;
$$;

revoke execute on function public.rappels_a_pousser(integer) from public, anon, authenticated;
grant execute on function public.rappels_a_pousser(integer) to service_role;

-- ============================================================================
-- 3. Le rappel du soir
-- ============================================================================

/**
 * Les soirs dus à cet instant : qui, et pour quel jour de Paris.
 *
 * Le jour d'hier est regardé aussi : un rappel de 23 h 45 que le passage de
 * la minute n'a pu traiter qu'à 0 h 05 appartient encore à la veille. Au-delà
 * de deux heures, il ne part plus — un « notez votre soirée » à 2 h du matin
 * réveille plus qu'il ne rappelle.
 *
 * Écartés : la note déjà prise ce jour-là, le suivi clos, la fiche sans
 * compte, la personne sans téléphone inscrit (rien ne pourrait lui arriver :
 * inutile de réveiller le serveur pour l'écrire).
 */
create or replace function public.soirs_dus()
returns table (patient_id uuid, jour date)
language sql stable security definer set search_path = ''
as $$
  select pr.patient_id, d.jour
    from public.preferences_rappels pr
    join public.patients p on p.id = pr.patient_id
   cross join lateral (
     select x.jour
       from (values ((now() at time zone 'Europe/Paris')::date),
                    ((now() at time zone 'Europe/Paris')::date - 1)) as x(jour)
      where ((x.jour + pr.soir_heure) at time zone 'Europe/Paris') <= now()
        and ((x.jour + pr.soir_heure) at time zone 'Europe/Paris') > now() - interval '2 hours'
        and ((x.jour + pr.soir_heure) at time zone 'Europe/Paris') >= pr.soir_regle_le
      order by x.jour desc
      limit 1
   ) d
   where pr.soir_actif
     and p.archived_at is null
     and p.auth_user_id is not null
     and (pr.soir_envoye_le is null or pr.soir_envoye_le < d.jour)
     and (pr.soir_reclame_le is null or pr.soir_reclame_le < now() - interval '5 minutes')
     and exists (select 1 from public.push_subscriptions s where s.patient_id = pr.patient_id)
     and not exists (
       select 1
         from public.scale_entries e
        where e.patient_id = pr.patient_id
          and e.recorded_at >= (d.jour::timestamp at time zone 'Europe/Paris')
          and e.recorded_at < ((d.jour + 1)::timestamp at time zone 'Europe/Paris')
     );
$$;

revoke execute on function public.soirs_dus() from public, anon, authenticated;

/* Le passage de la minute ne lit que les réglages allumés. */
create index if not exists preferences_rappels_soir_idx
  on public.preferences_rappels (soir_heure)
  where soir_actif;

/**
 * Les rappels du soir, réclamés pour ce passage.
 *
 * La même mécanique que rappels_a_pousser() : verrou sans attente, cinq
 * minutes de réclamation, et le serveur écrit ensuite le jour traité
 * (`soir_envoye_le`) — c'est lui qui interdit un second rappel le même soir.
 * Les deux conditions qui bougent sont redites sur la ligne verrouillée : si
 * un passage concurrent vient de la prendre, la relecture après verrou le voit.
 *
 * Non masqué, le rappel porte la question du soir telle que la thérapeute l'a
 * réglée ; masqué, un texte qui ne dit rien de ce qu'il rappelle.
 */
create or replace function public.rappels_du_soir_a_pousser(p_limite integer default 50)
returns table (patient_id uuid, jour date, titre text, corps text, masque boolean)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with dus as (
    select pr.patient_id, d.jour
      from public.preferences_rappels pr
      join public.soirs_dus() d on d.patient_id = pr.patient_id
     where (pr.soir_reclame_le is null or pr.soir_reclame_le < now() - interval '5 minutes')
       and (pr.soir_envoye_le is null or pr.soir_envoye_le < d.jour)
     order by pr.patient_id
     limit greatest(1, least(coalesce(p_limite, 50), 500))
     for update of pr skip locked
  ),
  pris as (
    update public.preferences_rappels pr
       set soir_reclame_le = now()
      from dus
     where pr.patient_id = dus.patient_id
    returning pr.patient_id, dus.jour, pr.masquer_contenu
  )
  select pris.patient_id,
         pris.jour,
         case when pris.masquer_contenu then 'Un rappel de votre espace' else 'Votre note du soir' end,
         case when pris.masquer_contenu then 'C''est l''heure que vous aviez choisie.'
              else coalesce(nullif(btrim(p.scale_question), ''), 'Où en êtes-vous ce soir ?') end,
         pris.masquer_contenu
    from pris
    join public.patients p on p.id = pris.patient_id;
end;
$$;

revoke execute on function public.rappels_du_soir_a_pousser(integer) from public, anon, authenticated;
grant execute on function public.rappels_du_soir_a_pousser(integer) to service_role;

-- ============================================================================
-- 4. Les rappels qui reviennent
-- ============================================================================

create table if not exists public.rappels_recurrents (
  id           uuid primary key default gen_random_uuid(),
  cabinet_id   uuid not null references public.cabinets(id) on delete cascade,
  title        text not null,
  body         text not null,
  -- Vide : chaque jour. Sinon le jour de la semaine, à la norme ISO : 1 = lundi.
  jour_semaine smallint,
  -- Heure de Paris : c'est celle des cabinets, et celle que l'écran affiche.
  heure        time not null,
  -- Dernier jour inclus. Obligatoire : un rappel de santé ne court pas sans fin.
  fin_le       date not null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Arrêté : il ne part plus. La ligne reste, pour que les mots déjà partis
  -- gardent leur rappel d'origine.
  annule_le    timestamptz,
  constraint rappels_recurrents_titre check (length(btrim(title)) between 1 and 120),
  constraint rappels_recurrents_texte check (length(btrim(body)) between 1 and 1000),
  constraint rappels_recurrents_jour check (jour_semaine between 1 and 7),
  constraint rappels_recurrents_minute check (extract(second from heure) = 0)
);

create index if not exists rappels_recurrents_cabinet_idx on public.rappels_recurrents (cabinet_id);
create index if not exists rappels_recurrents_created_by_idx on public.rappels_recurrents (created_by);
-- Le passage de la minute ne regarde que les rappels en cours.
create index if not exists rappels_recurrents_en_cours_idx
  on public.rappels_recurrents (fin_le)
  where annule_le is null;

create table if not exists public.rappels_recurrents_patients (
  rappel_id  uuid not null references public.rappels_recurrents(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  -- Posé par le déclencheur de rangement d'après la fiche.
  cabinet_id uuid not null references public.cabinets(id) on delete cascade,
  primary key (rappel_id, patient_id)
);

create index if not exists rappels_recurrents_patients_patient_idx on public.rappels_recurrents_patients (patient_id);
create index if not exists rappels_recurrents_patients_cabinet_idx on public.rappels_recurrents_patients (cabinet_id);

drop trigger if exists rappels_recurrents_patients_rangement on public.rappels_recurrents_patients;
create trigger rappels_recurrents_patients_rangement
  before insert or update on public.rappels_recurrents_patients
  for each row execute function public.ranger_selon_la_fiche();

/* LE CABINET LIT, ET N'ÉCRIT QUE PAR DEUX GESTES. Programmer passe par
   cabinet_programmer_rappel(), qui écrit le rappel et ses destinataires dans
   la même transaction — écrits l'un après l'autre depuis le navigateur, une
   coupure entre les deux laissait un rappel sans personne. Arrêter passe par
   cabinet_arreter_rappel(). La personne suivie ne lit rien ici : elle reçoit
   les mots, pas leur planification. */
alter table public.rappels_recurrents enable row level security;
alter table public.rappels_recurrents_patients enable row level security;

drop policy if exists "le cabinet lit ses rappels recurrents" on public.rappels_recurrents;
create policy "le cabinet lit ses rappels recurrents" on public.rappels_recurrents
  for select to authenticated using (public.is_cabinet_member(cabinet_id));

drop policy if exists "le cabinet lit les destinataires de ses rappels" on public.rappels_recurrents_patients;
create policy "le cabinet lit les destinataires de ses rappels" on public.rappels_recurrents_patients
  for select to authenticated using (public.is_cabinet_member(cabinet_id));

revoke all on table public.rappels_recurrents from anon, authenticated;
revoke all on table public.rappels_recurrents_patients from anon, authenticated;
grant select on table public.rappels_recurrents to authenticated;
grant select on table public.rappels_recurrents_patients to authenticated;
grant all on table public.rappels_recurrents to service_role;
grant all on table public.rappels_recurrents_patients to service_role;

-- ── Le mot du jour garde son rappel d'origine ─────────────────────────────

alter table public.push_notifications
  add column if not exists rappel_recurrent_id uuid
    references public.rappels_recurrents(id) on delete set null,
  add column if not exists occurrence date;

comment on column public.push_notifications.rappel_recurrent_id is
  'Le rappel récurrent dont ce mot est l''envoi du jour. Vide pour un mot écrit à la main.';
comment on column public.push_notifications.occurrence is
  'Le jour de Paris de cet envoi : un seul mot par rappel et par jour.';

/* PAS DE DOUBLON, PAR CONSTRUCTION. Deux passages simultanés, un passage
   rejoué, un cron qui rattrape : la contrainte refuse le second mot du même
   jour. Les mots écrits à la main (colonnes vides) n'y sont pas soumis — deux
   vides ne sont jamais égaux. L'index qu'elle crée couvre aussi la clé
   étrangère. */
alter table public.push_notifications drop constraint if exists push_notifications_occurrence_unique;
alter table public.push_notifications
  add constraint push_notifications_occurrence_unique unique (rappel_recurrent_id, occurrence);

alter table public.push_notifications drop constraint if exists push_notifications_occurrence_datee;
alter table public.push_notifications
  add constraint push_notifications_occurrence_datee
  check (rappel_recurrent_id is null or occurrence is not null);

/**
 * Un mot ne se rattache qu'à un rappel de son propre cabinet.
 *
 * Le cabinet écrit ses mots lui-même (politique « cabinet » de 0001) : sans
 * ce garde, un mot pouvait occuper le jour d'un rappel d'un autre cabinet et
 * l'empêcher de partir. Le lien qui tombe (rappel effacé avec son cabinet)
 * passe toujours.
 */
create or replace function public.garder_le_lien_du_rappel()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.rappel_recurrent_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.rappel_recurrent_id is not distinct from old.rappel_recurrent_id
     and new.occurrence is not distinct from old.occurrence
     and new.cabinet_id is not distinct from old.cabinet_id then
    return new;
  end if;
  if not exists (
    select 1 from public.rappels_recurrents r
     where r.id = new.rappel_recurrent_id and r.cabinet_id = new.cabinet_id
  ) then
    raise exception 'Ce mot ne peut pas se rattacher au rappel d''un autre cabinet.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.garder_le_lien_du_rappel() from public, anon, authenticated;

drop trigger if exists push_notifications_rappel_recurrent on public.push_notifications;
create trigger push_notifications_rappel_recurrent
  before insert or update of rappel_recurrent_id, occurrence, cabinet_id on public.push_notifications
  for each row execute function public.garder_le_lien_du_rappel();

/** « Chaque lundi, 9 h 30 » : le libellé que le journal des envois affiche. */
create or replace function public.libelle_rappel_recurrent(p_jour smallint, p_heure time)
returns text
language sql immutable set search_path = ''
as $$
  select case
           when p_jour is null then 'Chaque jour'
           else 'Chaque ' || (array['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'])[p_jour]
         end
         || ', ' || extract(hour from p_heure)::int || ' h'
         || case
              when extract(minute from p_heure)::int > 0
              then ' ' || lpad(extract(minute from p_heure)::int::text, 2, '0')
              else ''
            end;
$$;

revoke execute on function public.libelle_rappel_recurrent(smallint, time) from public, anon, authenticated;

/**
 * Programmer un rappel qui revient.
 *
 * Tout est relu ici, et les refus sont dits en français : l'écran les montre
 * tels quels. Les destinataires sont des suivis EN COURS de CE cabinet — une
 * fiche close ou celle d'un autre cabinet font refuser l'ensemble, plutôt que
 * de programmer un rappel à moitié.
 */
create or replace function public.cabinet_programmer_rappel(
  p_cabinet uuid,
  p_titre text,
  p_texte text,
  p_jour_semaine smallint,
  p_heure text,
  p_fin date,
  p_patients uuid[]
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_choisies integer;
  v_valides integer;
  v_id uuid;
begin
  if not public.is_cabinet_member(p_cabinet) then
    raise exception 'Ce cabinet n''est pas le vôtre.' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_texte, ''))) = 0 then
    raise exception 'Écrivez le mot qui partira.' using errcode = '22023';
  end if;
  if length(btrim(p_texte)) > 1000 then
    raise exception 'Le mot dépasse 1 000 caractères : un rappel se lit d''un coup d''œil.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_titre, ''))) > 120 then
    raise exception 'Le titre dépasse 120 caractères.' using errcode = '22023';
  end if;
  if p_jour_semaine is not null and p_jour_semaine not between 1 and 7 then
    raise exception 'Jour de la semaine inconnu.' using errcode = '22023';
  end if;
  if p_heure is null or p_heure !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Choisissez une heure d''envoi.' using errcode = '22023';
  end if;
  if p_fin is null or p_fin < v_aujourdhui then
    raise exception 'La date de fin est déjà passée : choisissez aujourd''hui ou plus tard.' using errcode = '22023';
  end if;
  if p_fin > v_aujourdhui + 366 then
    raise exception 'Un rappel récurrent court un an au plus : choisissez une date de fin plus proche.' using errcode = '22023';
  end if;

  select count(distinct x) into v_choisies from unnest(coalesce(p_patients, '{}'::uuid[])) as x;
  if v_choisies = 0 then
    raise exception 'Choisissez au moins une personne.' using errcode = '22023';
  end if;
  select count(*) into v_valides
    from public.patients p
   where p.id = any (p_patients)
     and p.cabinet_id = p_cabinet
     and p.archived_at is null;
  if v_valides <> v_choisies then
    raise exception 'Une des fiches choisies n''est pas un suivi en cours de ce cabinet.' using errcode = '22023';
  end if;

  insert into public.rappels_recurrents (cabinet_id, title, body, jour_semaine, heure, fin_le, created_by)
  values (p_cabinet, coalesce(nullif(btrim(p_titre), ''), 'Un mot du cabinet'), btrim(p_texte),
          p_jour_semaine, p_heure::time, p_fin, auth.uid())
  returning id into v_id;

  -- cabinet_id est reposé par le déclencheur de rangement, d'après la fiche.
  insert into public.rappels_recurrents_patients (rappel_id, patient_id, cabinet_id)
  select distinct v_id, x, p_cabinet
    from unnest(p_patients) as x;

  return v_id;
end;
$$;

revoke execute on function public.cabinet_programmer_rappel(uuid, text, text, smallint, text, date, uuid[]) from public, anon;
grant execute on function public.cabinet_programmer_rappel(uuid, text, text, smallint, text, date, uuid[]) to authenticated;

/**
 * Arrêter un rappel qui revient : il ne partira plus.
 *
 * Les mots déjà partis restent dans les espaces — ils ont pu être lus, et
 * l'on ne retire pas un mot de la vue de quelqu'un après coup. Rend faux si
 * le rappel n'existe pas, n'est pas de ce cabinet, ou était déjà arrêté.
 */
create or replace function public.cabinet_arreter_rappel(p_rappel uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.rappels_recurrents r
     set annule_le = now()
   where r.id = p_rappel
     and r.annule_le is null
     and public.is_cabinet_member(r.cabinet_id);
  return found;
end;
$$;

revoke execute on function public.cabinet_arreter_rappel(uuid) from public, anon;
grant execute on function public.cabinet_arreter_rappel(uuid) to authenticated;

/**
 * Écrire les mots du jour des rappels qui reviennent.
 *
 * Appelée par le passage de la minute, AVANT qu'il regarde ce qui est dû :
 * le mot écrit ici part dans ce même passage. L'heure d'hier est regardée
 * aussi, pour un passage retardé au-delà de minuit ; au-delà de deux heures
 * de retard, on n'écrit plus — le mot serait aussitôt marqué expiré.
 *
 * Un rappel n'écrit rien pour une heure antérieure à sa création (programmé à
 * 9 h 10 pour « chaque jour à 9 h », il part demain), rien après sa date de
 * fin, rien une fois arrêté, et n'adresse rien à un suivi clos. S'il n'a plus
 * personne à qui écrire, il n'écrit pas de mot du tout.
 */
create or replace function public.generer_rappels_recurrents()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_maintenant timestamptz := now();
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  c record;
  v_push uuid;
  v_n integer := 0;
begin
  for c in
    select r.id, r.cabinet_id, r.title, r.body, r.created_by, r.jour_semaine, r.heure, d.jour,
           ((d.jour + r.heure) at time zone 'Europe/Paris') as instant
      from public.rappels_recurrents r
     cross join (values (v_aujourdhui - 1), (v_aujourdhui)) as d(jour)
     where r.annule_le is null
       and r.fin_le >= v_aujourdhui - 1
       and d.jour <= r.fin_le
       and (r.jour_semaine is null or r.jour_semaine = extract(isodow from d.jour))
       and ((d.jour + r.heure) at time zone 'Europe/Paris') <= v_maintenant
       and ((d.jour + r.heure) at time zone 'Europe/Paris') > v_maintenant - interval '2 hours'
       and ((d.jour + r.heure) at time zone 'Europe/Paris') >= r.created_at
       and not exists (
         select 1 from public.push_notifications n
          where n.rappel_recurrent_id = r.id and n.occurrence = d.jour
       )
       and exists (
         select 1
           from public.rappels_recurrents_patients rp
           join public.patients p on p.id = rp.patient_id
          where rp.rappel_id = r.id and p.archived_at is null
       )
     order by instant
  loop
    v_push := null;
    insert into public.push_notifications
      (cabinet_id, title, body, scheduled_for, scheduled_at, created_by, rappel_recurrent_id, occurrence)
    values
      (c.cabinet_id, c.title, c.body, public.libelle_rappel_recurrent(c.jour_semaine, c.heure),
       c.instant, c.created_by, c.id, c.jour)
    on conflict (rappel_recurrent_id, occurrence) do nothing
    returning id into v_push;

    -- Un passage concurrent l'a écrit le premier : ses destinataires sont les siens.
    if v_push is null then
      continue;
    end if;

    insert into public.push_recipients (push_id, patient_id, cabinet_id)
    select v_push, rp.patient_id, rp.cabinet_id
      from public.rappels_recurrents_patients rp
      join public.patients p on p.id = rp.patient_id
     where rp.rappel_id = c.id
       and p.archived_at is null;

    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.generer_rappels_recurrents() from public, anon, authenticated;

-- ============================================================================
-- 5. Dans l'espace, un rappel qui revient ne s'empile pas
-- ============================================================================
--
-- Vingt mots par ouverture (0051) : un « chaque jour » de trois semaines
-- remplissait la liste à lui seul, et chassait de la vue le mot personnel de
-- la veille. Seul le dernier envoi de chaque rappel s'y montre ; les mots
-- écrits à la main restent tous là.

create or replace function public.patient_mots(p_patient uuid, p_limite integer default 20)
returns table (push_id uuid, title text, body text, du_le timestamptz, read_at timestamptz)
language sql stable set search_path = ''
as $$
  select m.id, m.title, m.body, m.du_le, m.read_at
    from (
      select distinct on (coalesce(n.rappel_recurrent_id, n.id))
             n.id, n.title, n.body, coalesce(n.scheduled_at, n.created_at) as du_le, r.read_at
        from public.push_recipients r
        join public.push_notifications n on n.id = r.push_id
       where r.patient_id = p_patient
         and public.is_patient_record(r.patient_id)
         and (n.scheduled_at is null or n.scheduled_at <= now())
       order by coalesce(n.rappel_recurrent_id, n.id), coalesce(n.scheduled_at, n.created_at) desc, n.id
    ) m
   order by m.du_le desc, m.id
   limit least(greatest(coalesce(p_limite, 20), 1), 100);
$$;

-- ============================================================================
-- 6. Le passage de la minute
-- ============================================================================
--
-- Repris de sa définition en production (0040, puis 0044 qui écarte les
-- suivis clos), avec deux ajouts : les mots du jour des rappels récurrents
-- s'écrivent d'abord, et un rappel du soir dû réveille le serveur comme un
-- mot dû.

create or replace function public.declencher_rappels()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret text;
begin
  /* Un défaut dans l'écriture des rappels récurrents ne doit pas priver les
     autres mots de leur envoi : il se dit au journal de la base — sans rien
     du contenu — et le passage continue. */
  begin
    perform public.generer_rappels_recurrents();
  exception when others then
    raise warning '[rappels] les rappels récurrents du jour n''ont pas pu être écrits (%)', sqlstate;
  end;

  update public.push_recipients r
     set push_status = 'expiree', pushed_at = now()
    from public.push_notifications n
   where n.id = r.push_id
     and r.push_status is null
     and coalesce(n.scheduled_at, n.created_at) <= now() - interval '2 hours';

  if not exists (
    select 1
      from public.push_recipients r
      join public.push_notifications n on n.id = r.push_id
      join public.patients p on p.id = r.patient_id
     where r.push_status is null
       and p.archived_at is null
       and coalesce(n.scheduled_at, n.created_at) <= now()
       and (r.push_claimed_at is null or r.push_claimed_at < now() - interval '5 minutes')
  ) and not exists (select 1 from public.soirs_dus()) then
    return;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'klaro_cron_secret';

  if v_secret is null then
    raise warning '[rappels] le secret du planificateur manque dans le coffre : aucun envoi.';
    return;
  end if;

  perform net.http_post(
    url := 'https://klaroweb.site/api/cron/rappels',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function public.declencher_rappels() from public, anon, authenticated;
