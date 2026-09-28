-- ============================================================================
-- 0054 — Le mot lu, le mot répondu
-- ============================================================================
--
-- Le patient écrit « Un mot » à sa thérapeute — une page de son journal,
-- partagée d'emblée (src/patient/MotAuTherapeute.tsx) — et n'apprenait
-- jamais s'il avait été lu. La thérapeute, elle, ne pouvait répondre que par
-- une notification composée pour un groupe, sans lien avec ce qu'elle
-- venait de lire. Un fil à sens unique, dans un métier où le lien compte.
--
--   1. LU, ET PAR QUI SEULEMENT. `journal_pages.lu_le` dit quand le cabinet a
--      ouvert la page. Il n'est posé que par une fonction du cabinet : le
--      patient tient son journal (politique ALL de 0002), et une politique ne
--      sait pas dire « cette colonne-là ne se touche pas ». Les droits par
--      colonne, si : le patient écrit le texte, le titre, le partage et le
--      rang de ses pages — rien d'autre. Une page corrigée après lecture
--      redevient non lue : la version que la thérapeute a lue n'est plus
--      celle qui est là.
--
--   2. UNE RÉPONSE, À CETTE PERSONNE-LÀ. La réponse est un mot comme les
--      autres (push_notifications / push_recipients) : elle arrive dans
--      l'espace, et sur le téléphone si les rappels y sont activés, par le
--      passage que 0040 réveille déjà chaque minute. Elle porte en plus
--      `en_reponse_a`, la page à laquelle elle répond. La base tient qu'elle
--      ne va QU'À l'auteur de cette page : un déclencheur refuse tout autre
--      destinataire, et le lien ne se pose qu'à la création — un mot collectif
--      ne se déguise pas après coup en réponse, ni l'inverse.
--
--   3. COMBIEN ATTENDENT. Le nombre de pages partagées non lues, par fiche,
--      compté en base : la liste des patients l'affiche sans lire toutes les
--      pages du cabinet — que l'API arrêterait à mille.
--
-- Rien de ce qui s'écrit ici ne passe par audit_log : ni le texte d'une
-- page, ni celui d'une réponse.

-- ============================================================================
-- 1. Lu le
-- ============================================================================

alter table public.journal_pages
  add column if not exists lu_le timestamptz;

comment on column public.journal_pages.lu_le is
  'Quand le cabinet a ouvert cette page partagée. Posé par cabinet_marquer_page_lue ou cabinet_repondre_a_la_page, jamais par le patient ; remis à vide si le patient corrige la page.';

/* LE PATIENT ÉCRIT SES PAGES, PAS LEUR LECTURE.
   Les droits de table restaient ceux du départ : tout, sur toutes les
   colonnes, borné aux lignes par la politique. On les ramène à ce que
   l'espace écrit vraiment (Journal.tsx, MotAuTherapeute.tsx). Une colonne
   ajoutée plus tard et que le patient doit écrire devra être accordée ici,
   nommément — c'est voulu : ce qui n'est pas accordé ne s'écrit pas. */
revoke insert, update on public.journal_pages from authenticated;
grant insert (cabinet_id, patient_id, title, body, trigger_label, shared, position)
  on public.journal_pages to authenticated;
grant update (title, body, trigger_label, shared, position)
  on public.journal_pages to authenticated;

/**
 * Une page neuve n'est pas lue ; une page corrigée ne l'est plus.
 *
 * Le droit par colonne suffit contre le navigateur. Ce déclencheur tient le
 * reste : une page insérée par un autre chemin arrive non lue, et une page
 * dont le titre ou le texte change perd sa lecture — « Lu le 3 septembre »
 * sous une version écrite le 5 serait faux. Changer le partage ou le rang
 * ne touche pas à ce qui a été lu.
 */
create or replace function public.journal_page_relue()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.lu_le := null;
  elsif new.title is distinct from old.title or new.body is distinct from old.body then
    new.lu_le := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.journal_page_relue() from public, anon, authenticated;

drop trigger if exists journal_pages_relue on public.journal_pages;
create trigger journal_pages_relue
  before insert or update on public.journal_pages
  for each row execute function public.journal_page_relue();

/**
 * Le cabinet ouvre une page partagée : elle est lue.
 *
 * Rend l'instant de la lecture — la première, si une consœur du cabinet l'a
 * déjà ouverte : c'est celle que le patient voit. Une page privée, d'un autre
 * cabinet ou qui n'existe plus reçoit le même refus : la réponse ne dit pas
 * laquelle des trois.
 *
 * SECURITY DEFINER : le cabinet n'a aucun droit d'écriture sur le journal, et
 * n'en reçoit pas. La fonction ne pose que cette colonne, après avoir vérifié
 * ce que la politique de lecture vérifie (membre du cabinet, page partagée).
 */
create or replace function public.cabinet_marquer_page_lue(p_page uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cabinet uuid;
  v_partagee boolean;
  v_lu timestamptz;
begin
  select j.cabinet_id, j.shared, j.lu_le
    into v_cabinet, v_partagee, v_lu
    from public.journal_pages j
   where j.id = p_page
     for update;

  if v_cabinet is null or not v_partagee or not public.is_cabinet_member(v_cabinet) then
    raise exception 'Cette page n''est pas partagée avec votre cabinet.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_lu is null then
    update public.journal_pages j
       set lu_le = now()
     where j.id = p_page
    returning j.lu_le into v_lu;
  end if;

  return v_lu;
end;
$$;

comment on function public.cabinet_marquer_page_lue(uuid) is
  'Le cabinet a ouvert cette page partagée : pose lu_le (la première lecture fait foi) et le rend.';

revoke execute on function public.cabinet_marquer_page_lue(uuid) from public, anon;
grant execute on function public.cabinet_marquer_page_lue(uuid) to authenticated;

-- ============================================================================
-- 2. La réponse
-- ============================================================================

alter table public.push_notifications
  add column if not exists en_reponse_a uuid
    references public.journal_pages (id) on delete set null;

comment on column public.push_notifications.en_reponse_a is
  'La page du journal à laquelle ce mot répond. Posé à la création seulement ; le mot ne va alors qu''à l''auteur de la page. Vide si la page a été effacée.';

-- Sous la clé étrangère : l'effacement d'une page cherche ses réponses. Les
-- mots collectifs, de loin les plus nombreux, n'y figurent pas.
create index if not exists push_notifications_en_reponse_a_idx
  on public.push_notifications (en_reponse_a)
  where en_reponse_a is not null;

/**
 * Le lien d'une réponse se pose à la création, et ne se déplace plus.
 *
 * À la création : la page doit être partagée, et de CE cabinet. Ensuite, le
 * lien ne peut que tomber — c'est l'effacement de la page (`on delete set
 * null`). Le poser sur un mot déjà adressé à un groupe, ou le faire passer
 * d'une page à une autre, en ferait une réponse arrivée chez quelqu'un
 * d'autre que l'auteur.
 *
 * SECURITY DEFINER : la vérification lit la page même quand celui qui écrit
 * ne la verrait pas, pour refuser au lieu de laisser passer.
 */
create or replace function public.garder_le_fil_de_la_reponse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.en_reponse_a is null or new.en_reponse_a is not distinct from old.en_reponse_a then
      return new;
    end if;
    raise exception 'Une réponse se rattache à sa page en naissant, pas après.'
      using errcode = 'check_violation';
  end if;

  if new.en_reponse_a is not null and not exists (
    select 1 from public.journal_pages j
     where j.id = new.en_reponse_a
       and j.cabinet_id = new.cabinet_id
       and j.shared
  ) then
    raise exception 'On ne répond qu''à une page partagée avec ce cabinet.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.garder_le_fil_de_la_reponse() from public, anon, authenticated;

drop trigger if exists push_notifications_fil on public.push_notifications;
create trigger push_notifications_fil
  before insert or update of en_reponse_a on public.push_notifications
  for each row execute function public.garder_le_fil_de_la_reponse();

/**
 * Une réponse ne va qu'à l'auteur de la page.
 *
 * Le cabinet écrit ses destinataires lui-même (politique « cabinet » de
 * push_recipients) : sans ce garde, une réponse pourrait être adressée à
 * toute la file active — avec, dans l'espace de chacun, un lien vers une page
 * qui n'est pas la sienne. Les colonnes qui désignent sont seules
 * surveillées : le passage des rappels, qui écrit le statut d'envoi, n'a
 * rien à vérifier.
 */
create or replace function public.reponse_a_son_auteur()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_page uuid;
  v_auteur uuid;
begin
  select n.en_reponse_a into v_page
    from public.push_notifications n
   where n.id = new.push_id;
  if v_page is null then
    return new;
  end if;

  select j.patient_id into v_auteur
    from public.journal_pages j
   where j.id = v_page;
  if v_auteur is distinct from new.patient_id then
    raise exception 'Une réponse ne va qu''à la personne qui a écrit la page.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.reponse_a_son_auteur() from public, anon, authenticated;

drop trigger if exists push_recipients_reponse on public.push_recipients;
create trigger push_recipients_reponse
  before insert or update of push_id, patient_id on public.push_recipients
  for each row execute function public.reponse_a_son_auteur();

/**
 * Répondre à une page partagée, en un geste.
 *
 * Le mot et son unique destinataire s'écrivent dans la même transaction :
 * écrits l'un après l'autre depuis le navigateur, une coupure entre les deux
 * laissait un mot sans personne (useCabinet, `envoyerNotification`). La page
 * est marquée lue au passage — on ne répond pas à ce qu'on n'a pas lu.
 *
 * Le titre est fixé ici, sobre : il s'affiche sur un écran verrouillé, et ne
 * nomme ni la page ni ce qu'elle disait.
 *
 * Un suivi clos ne reçoit plus rien : son espace est fermé (0044), la
 * réponse n'y serait jamais lue.
 */
create or replace function public.cabinet_repondre_a_la_page(p_page uuid, p_texte text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cabinet uuid;
  v_patient uuid;
  v_partagee boolean;
  v_close timestamptz;
  v_texte text := btrim(coalesce(p_texte, ''));
  v_mot uuid;
begin
  select j.cabinet_id, j.patient_id, j.shared, p.archived_at
    into v_cabinet, v_patient, v_partagee, v_close
    from public.journal_pages j
    join public.patients p on p.id = j.patient_id
   where j.id = p_page;

  if v_cabinet is null or not v_partagee or not public.is_cabinet_member(v_cabinet) then
    raise exception 'Cette page n''est pas partagée avec votre cabinet.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_close is not null then
    raise exception 'Ce suivi est clos : son espace est fermé, la réponse n''y serait pas lue.'
      using errcode = 'check_violation';
  end if;
  if v_texte = '' then
    raise exception 'La réponse est vide.' using errcode = 'check_violation';
  end if;
  if char_length(v_texte) > 2000 then
    raise exception 'La réponse dépasse 2 000 signes.' using errcode = 'check_violation';
  end if;

  insert into public.push_notifications (cabinet_id, title, body, scheduled_for, created_by, en_reponse_a)
  values (v_cabinet, 'Réponse de votre thérapeute', v_texte, 'Maintenant', (select auth.uid()), p_page)
  returning id into v_mot;

  insert into public.push_recipients (push_id, patient_id, cabinet_id)
  values (v_mot, v_patient, v_cabinet);

  update public.journal_pages j
     set lu_le = now()
   where j.id = p_page
     and j.lu_le is null;

  return v_mot;
end;
$$;

comment on function public.cabinet_repondre_a_la_page(uuid, text) is
  'Répond à une page partagée : un mot adressé à son seul auteur, rattaché à la page, qui part comme les autres rappels. Marque la page lue.';

revoke execute on function public.cabinet_repondre_a_la_page(uuid, text) from public, anon;
grant execute on function public.cabinet_repondre_a_la_page(uuid, text) to authenticated;

-- ============================================================================
-- 3. Combien attendent
-- ============================================================================

-- Les pages qui attendent, et elles seules : l'index reste petit, puisqu'une
-- page lue en sort.
create index if not exists journal_pages_non_lues_idx
  on public.journal_pages (cabinet_id, patient_id)
  where shared and lu_le is null;

/**
 * Les pages partagées non lues, par fiche.
 *
 * SECURITY INVOKER : aucun droit de plus. Le cabinet n'y compte que ce que sa
 * politique de lecture lui montre — les pages partagées de ses fiches.
 */
create or replace function public.cabinet_pages_non_lues(p_cabinet uuid)
returns table (patient_id uuid, non_lues integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select j.patient_id, count(*)::integer
    from public.journal_pages j
   where j.cabinet_id = p_cabinet
     and j.shared
     and j.lu_le is null
   group by j.patient_id;
$$;

comment on function public.cabinet_pages_non_lues(uuid) is
  'Le nombre de pages partagées non lues, par fiche du cabinet. Sous les droits de l''appelant.';

revoke execute on function public.cabinet_pages_non_lues(uuid) from public, anon;
grant execute on function public.cabinet_pages_non_lues(uuid) to authenticated;
