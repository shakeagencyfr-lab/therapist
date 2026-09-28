-- ============================================================================
-- 0040 — Les rappels arrivent sur le téléphone
-- ============================================================================
--
-- La table s'appelait push_recipients et l'écran programmait l'envoi à la
-- minute près. Mais rien ne partait jamais : pas de notification, pas de
-- service worker, pas de courriel. Un rappel « ce soir, 20 h » ne se lisait
-- que si la patiente ouvrait son espace d'elle-même — l'inverse d'un rappel.
--
-- Quatre pièces :
--
--   1. push_subscriptions — les téléphones où une patiente a accepté les
--      rappels. Une adresse d'envoi est une CAPACITÉ : qui la détient peut
--      écrire sur un écran verrouillé. Elle ne sort donc jamais vers le
--      cabinet ; la thérapeute n'en voit que le nombre.
--   2. Sur push_recipients, ce qui est arrivé à chaque envoi : parti, aucun
--      téléphone, échec, trop tard. L'écran de la thérapeute le dira.
--   3. rappels_a_pousser() — le serveur réclame les envois dus par lots, sans
--      que deux passages se marchent dessus.
--   4. pg_cron — chaque minute, la base regarde s'il y a quelque chose à
--      envoyer, et n'appelle le serveur QUE dans ce cas.
--
-- Pourquoi la planification vit ici et pas chez l'hébergeur : sur l'offre
-- gratuite de Vercel, une tâche planifiée ne tourne qu'une fois par jour, et
-- une planification plus fréquente fait échouer le déploiement. Un rappel
-- programmé à 20 h qui part le lendemain matin n'est pas un rappel.

-- ============================================================================
-- 0. Les extensions
-- ============================================================================

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create extension if not exists pg_net;

-- ============================================================================
-- 1. Les téléphones
-- ============================================================================

create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients(id) on delete cascade,
  -- Posé par le déclencheur de rangement d'après la fiche : jamais par le
  -- navigateur.
  cabinet_id      uuid not null references public.cabinets(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  -- L'adresse depuis laquelle l'espace a été installé : c'est elle qu'on
  -- rouvre au toucher de la notification. /son-cabinet/mon porte la marque
  -- du cabinet ; /mon, la nôtre.
  chemin          text not null default '/mon',
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz,
  failures        integer not null default 0,

  /* LE SERVEUR ÉCRIT À CETTE ADRESSE. Sans cette liste, une patiente pourrait
     inscrire n'importe quelle URL en https, et notre serveur irait y poster
     depuis l'hébergeur — un relais tout trouvé. On n'accepte que les quatre
     services qui livrent réellement les notifications : Google (Chrome,
     Edge, Android), Mozilla, Apple et Microsoft. */
  constraint push_subscriptions_service_connu check (
    endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
  ),
  constraint push_subscriptions_chemin check (chemin ~ '^/([a-z0-9][a-z0-9-]{0,62}/)?mon/?$'),
  constraint push_subscriptions_cles check (
    length(p256dh) between 40 and 200 and length(auth) between 10 and 100
  )
);

create index if not exists push_subscriptions_patient_idx on public.push_subscriptions (patient_id);

drop trigger if exists push_subscriptions_rangement on public.push_subscriptions;
create trigger push_subscriptions_rangement
  before insert or update on public.push_subscriptions
  for each row execute function public.ranger_selon_la_fiche();

alter table public.push_subscriptions enable row level security;

/* La patiente voit et retire SES téléphones — rien d'autre. Elle n'en
   inscrit pas directement : enregistrer_appareil() s'en charge, parce qu'un
   téléphone déjà inscrit par quelqu'un d'autre doit changer de mains, ce
   que la RLS ne permettrait pas. */
drop policy if exists "la patiente voit ses telephones" on public.push_subscriptions;
create policy "la patiente voit ses telephones" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "la patiente retire ses telephones" on public.push_subscriptions;
create policy "la patiente retire ses telephones" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

revoke all on table public.push_subscriptions from anon, authenticated;
grant select, delete on table public.push_subscriptions to authenticated;
grant all on table public.push_subscriptions to service_role;

/**
 * Inscrire ce téléphone pour les rappels de cette fiche.
 *
 * UN TÉLÉPHONE APPARTIENT À QUI L'A INSCRIT EN DERNIER.
 * Le navigateur rend la même adresse d'envoi à quiconque s'inscrit depuis le
 * même appareil. Sur un téléphone partagé, la seconde personne aurait buté
 * sur l'unicité de l'adresse — et ses rappels seraient partis vers la fiche
 * de la première. Ici, l'inscription précédente est effacée d'abord.
 */
create or replace function public.enregistrer_appareil(
  p_patient uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_chemin text default '/mon',
  p_user_agent text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_patient_record(p_patient) then
    raise exception 'Cette fiche n''est pas la vôtre.' using errcode = '42501';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint;

  -- cabinet_id est posé par le déclencheur de rangement : la valeur écrite
  -- ici n'est qu'une place réservée, écrasée avant l'écriture.
  insert into public.push_subscriptions
    (patient_id, cabinet_id, user_id, endpoint, p256dh, auth, chemin, user_agent)
  values
    (p_patient, (select cabinet_id from public.patients where id = p_patient), auth.uid(),
     p_endpoint, p_p256dh, p_auth, coalesce(p_chemin, '/mon'), left(p_user_agent, 300))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.enregistrer_appareil(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.enregistrer_appareil(uuid, text, text, text, text, text) to authenticated;

/**
 * Combien de téléphones chaque patiente a-t-elle inscrits ?
 *
 * Le nombre, jamais les adresses : la thérapeute a besoin de savoir qui
 * recevra le rappel sur son téléphone et qui devra ouvrir son espace pour le
 * lire. Pas de quoi écrire elle-même sur ces écrans.
 */
create or replace function public.cabinet_appareils(p_cabinet uuid)
returns table (patient_id uuid, appareils integer)
language sql stable security definer set search_path = ''
as $$
  select s.patient_id, count(*)::integer
    from public.push_subscriptions s
   where s.cabinet_id = p_cabinet
     and public.is_cabinet_member(p_cabinet)
   group by s.patient_id;
$$;

revoke execute on function public.cabinet_appareils(uuid) from public, anon;
grant execute on function public.cabinet_appareils(uuid) to authenticated;

-- ============================================================================
-- 2. Ce qui est arrivé à chaque envoi
-- ============================================================================
--
--   envoyee        au moins un téléphone l'a reçue ;
--   sans_appareil  la patiente n'a activé les rappels nulle part — elle lira
--                  le mot dans son espace, à sa prochaine ouverture ;
--   echec          tous ses téléphones ont refusé ;
--   expiree        l'heure était passée depuis plus de deux heures quand on a
--                  pu l'envoyer — un « ce soir, 20 h » qui sonne à minuit
--                  réveille plus qu'il ne rappelle.
--
-- Vide : pas encore traité.

alter table public.push_recipients
  add column if not exists push_status text,
  add column if not exists pushed_at timestamptz,
  add column if not exists push_claimed_at timestamptz;

alter table public.push_recipients drop constraint if exists push_recipients_push_status;
alter table public.push_recipients
  add constraint push_recipients_push_status
  check (push_status in ('envoyee', 'sans_appareil', 'echec', 'expiree'));

create index if not exists push_recipients_a_pousser_idx
  on public.push_recipients (push_id) where push_status is null;

-- Ce qui était déjà dû avant cette migration ne partira pas en rafale au
-- premier passage.
update public.push_recipients r
   set push_status = 'expiree', pushed_at = now()
  from public.push_notifications n
 where n.id = r.push_id
   and r.push_status is null
   and coalesce(n.scheduled_at, n.created_at) <= now();

-- ============================================================================
-- 3. Réclamer les envois dus
-- ============================================================================

/**
 * Les envois dus, réclamés pour ce passage.
 *
 * `for update skip locked` : deux passages simultanés ne prennent jamais la
 * même ligne. La réclamation dure cinq minutes ; un passage qui meurt en
 * route rend ses lignes au suivant. Le prix de cette sûreté : si le serveur
 * tombe APRÈS avoir envoyé et AVANT d'avoir noté, le rappel repart une fois.
 * Un doublon vaut mieux qu'un silence.
 *
 * Réservée au serveur : c'est la clé de service qui l'appelle.
 */
create or replace function public.rappels_a_pousser(p_limite integer default 50)
returns table (push_id uuid, patient_id uuid, titre text, corps text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with dus as (
    select r.push_id, r.patient_id
      from public.push_recipients r
      join public.push_notifications n on n.id = r.push_id
     where r.push_status is null
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
  select pris.push_id, pris.patient_id, n.title, n.body
    from pris
    join public.push_notifications n on n.id = pris.push_id;
end;
$$;

revoke execute on function public.rappels_a_pousser(integer) from public, anon, authenticated;
grant execute on function public.rappels_a_pousser(integer) to service_role;

-- ============================================================================
-- 4. Chaque minute
-- ============================================================================

/**
 * Le passage de la minute.
 *
 * Il ne réveille le serveur que s'il y a vraiment quelque chose à envoyer :
 * la plupart des minutes, il ne fait qu'une lecture d'index et rend la main.
 * Les rappels trop tardifs, il les marque lui-même — le serveur n'a pas à
 * être appelé pour dire qu'on n'enverra rien.
 *
 * Le secret du planificateur vit dans le coffre (Vault), sous le nom
 * « klaro_cron_secret » — JAMAIS dans ce fichier, qui est public. Tant qu'il
 * manque, le passage n'appelle personne : une base de développement qui
 * rejoue cette migration n'écrira pas au serveur de production.
 */
create or replace function public.declencher_rappels()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret text;
begin
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
     where r.push_status is null
       and coalesce(n.scheduled_at, n.created_at) <= now()
       and (r.push_claimed_at is null or r.push_claimed_at < now() - interval '5 minutes')
  ) then
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

select cron.schedule('klaro-rappels', '* * * * *', 'select public.declencher_rappels()');

/* Le journal des passages n'est jamais purgé par pg_cron : à raison d'une
   ligne par minute, il prendrait 150 Mo par an sur une base gratuite qui en
   compte 500. Une semaine suffit pour comprendre une panne. */
select cron.schedule(
  'klaro-menage-planificateur',
  '23 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
