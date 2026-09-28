-- ============================================================================
-- 0044 — Un suivi clos ferme la porte ; le lundi reprend ce qu'il a laissé
-- ============================================================================
--
-- Quatre écarts entre ce que l'écran promet et ce que la base tient.
--
--   1. UN SUIVI CLOS GARDAIT SES CLÉS. « Clore le suivi » annonce à la
--      thérapeute que son patient perd l'accès à son espace. my_context() le
--      lui cachait bien — mais is_patient_record(), sur quoi reposent toutes
--      les politiques et tous les gestes du patient, ne regardait que le
--      compte rattaché. Un onglet resté ouvert, ou un appel direct à l'API,
--      lisait encore modules, audios, affirmations, journal et commandes, et
--      cochait un module. La fiche elle-même restait lisible par sa politique
--      propre. Les deux vérifient désormais que le suivi est en cours ; tout
--      ce qui passe par is_patient_record suit sans être réécrit (gestes du
--      module, écoutes, mots lus, téléphones, stockage des audios).
--
--   2. UN RAPPEL PARTAIT ENCORE VERS UN SUIVI CLOS. Un rappel programmé avant
--      la clôture sonnait sur le téléphone après elle, et ouvrait un espace
--      fermé. Il n'est plus réclamé : s'il reste en attente plus de deux
--      heures, il est marqué « trop tard » comme les autres ; si le suivi est
--      rouvert d'ici là, il part.
--
--   3. UN AUDIO POUVAIT VENIR D'UN AUTRE CABINET. Rien ne vérifiait que
--      l'audio envoyé à un patient — ou vendu dans une boutique — appartenait
--      au cabinet de la fiche. Qui connaissait l'identifiant d'un audio
--      voisin pouvait l'envoyer à son patient, et la politique de lecture
--      lui ouvrait alors le titre et le fichier. Un déclencheur refuse ce
--      mélange à l'écriture, sur l'envoi comme sur le produit : refuser au
--      produit, c'est ne pas découvrir l'erreur après un paiement.
--
--   4. LE LUNDI NE REPRENAIT PAS CE QU'IL LAISSAIT. La tâche des affirmations
--      s'arrête avant la coupure de l'hébergeur et compte ce qu'elle laisse
--      « au passage suivant » — qui n'existait pas avant le lundi d'après.
--      L'offre gratuite de l'hébergeur ne permet qu'un passage par jour et
--      par tâche : les reprises vivent ici, comme les rappels (0040), et ne
--      réveillent le serveur que s'il reste vraiment une fiche à servir.

-- ============================================================================
-- 1. La fiche d'un suivi clos ne s'ouvre plus à son patient
-- ============================================================================

create or replace function public.is_patient_record(p_patient uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.patients p
    where p.id = p_patient
      and p.auth_user_id = auth.uid()
      and p.archived_at is null
  );
$$;

comment on function public.is_patient_record(uuid) is
  'Cette fiche est-elle celle du compte connecté, et son suivi en cours ? Un suivi clos ne rouvre rien à son patient.';

drop policy if exists "le patient lit sa fiche" on public.patients;
create policy "le patient lit sa fiche" on public.patients
  for select to authenticated
  using (auth_user_id = auth.uid() and archived_at is null);

-- ============================================================================
-- 2. Les rappels ne partent plus vers un suivi clos
-- ============================================================================
--
-- Les deux fonctions de 0040, reprises telles qu'elles sont en production,
-- avec la seule condition sur la fiche en plus. La réclamation ignore un
-- suivi clos ; le passage de la minute aussi, sans quoi il réveillerait le
-- serveur chaque minute pendant deux heures pour un envoi que personne ne
-- réclamera.

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
  select pris.push_id, pris.patient_id, n.title, n.body
    from pris
    join public.push_notifications n on n.id = pris.push_id;
end;
$$;

revoke execute on function public.rappels_a_pousser(integer) from public, anon, authenticated;
grant execute on function public.rappels_a_pousser(integer) to service_role;

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
      join public.patients p on p.id = r.patient_id
     where r.push_status is null
       and p.archived_at is null
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

-- ============================================================================
-- 3. Un audio reste dans son cabinet
-- ============================================================================
--
-- La fiche fait foi pour un envoi, le produit pour une vente. Pour l'envoi,
-- on relit le cabinet de la fiche plutôt que `cabinet_id` : le déclencheur
-- de rangement le pose aussi, et l'ordre entre deux déclencheurs « avant »
-- n'est qu'alphabétique — la règle ne doit pas en dépendre.
--
-- SECURITY DEFINER : un membre qui glisse l'audio d'un voisin ne peut pas le
-- lire sous la RLS ; la fonction doit le voir pour dire non.

create or replace function public.audio_du_meme_cabinet()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_audio   uuid;
  v_attendu uuid;
begin
  if new.audio_id is null then
    return new;
  end if;

  select a.cabinet_id into v_audio from public.audio_library a where a.id = new.audio_id;

  if tg_table_name = 'patient_audios' then
    select p.cabinet_id into v_attendu from public.patients p where p.id = new.patient_id;
  else
    v_attendu := new.cabinet_id;
  end if;

  if v_audio is distinct from v_attendu then
    raise exception 'Cet audio n''est pas dans la bibliothèque de ce cabinet.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.audio_du_meme_cabinet() from public, anon, authenticated;

drop trigger if exists patient_audios_meme_cabinet on public.patient_audios;
create trigger patient_audios_meme_cabinet
  before insert or update of audio_id, patient_id on public.patient_audios
  for each row execute function public.audio_du_meme_cabinet();

drop trigger if exists products_audio_meme_cabinet on public.products;
create trigger products_audio_meme_cabinet
  before insert or update of audio_id, cabinet_id on public.products
  for each row execute function public.audio_du_meme_cabinet();

-- ============================================================================
-- 4. Le lundi reprend ce qu'il a laissé
-- ============================================================================
--
-- L'hébergeur fait le premier passage à 6 h UTC (vercel.json). La base
-- reprend à 8 h, 10 h et 12 h UTC — assez loin l'un de l'autre pour qu'un
-- passage (une minute au plus) ne chevauche jamais le suivant, même quand
-- l'hébergeur, sur l'offre gratuite, déclenche le sien n'importe quand dans
-- l'heure.
--
-- « Reste à servir » redit ici la règle du serveur (server/affirmationsHebdo.ts) :
-- réglage automatique, suivi en cours, clé Anthropic du cabinet, pas de série
-- publiée depuis quatre jours. Une fiche sans clé ne réveille donc personne ;
-- une fiche en échec, oui — trois fois au plus dans la matinée, puis elle
-- attend le lundi suivant.
--
-- Le secret est celui des rappels, rangé dans le coffre sous le nom
-- « klaro_cron_secret » — JAMAIS dans ce fichier. Tant qu'il manque, rien ne
-- part : une base de développement qui rejoue cette migration n'appellera
-- pas le serveur de production.

create or replace function public.declencher_affirmations()
returns void
language plpgsql security definer set search_path = ''
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

revoke execute on function public.declencher_affirmations() from public, anon, authenticated;

-- Un nom déjà planifié est remplacé : rejouer la migration ne double rien.
select cron.schedule('klaro-affirmations-reprises', '0 8,10,12 * * 1', 'select public.declencher_affirmations()');
