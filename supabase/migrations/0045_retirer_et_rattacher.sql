-- ============================================================================
-- 0045 — Ce qui se retire d'une fiche, et l'adresse qui ouvre son espace
-- ============================================================================
--
-- Trois gestes manquaient à la fiche d'un patient, et chacun demande à la
-- base de tenir une règle que l'écran seul ne tiendrait pas.
--
--   1. Retirer un exercice du parcours. Rien ne l'en retirait : tout
--      s'accumulait chez le patient, sous « aujourd'hui », séance après
--      séance. On RETIRE plutôt qu'on ne supprime : un exercice fait,
--      commenté, dont le quiz a reçu des réponses, fait partie du dossier —
--      le supprimer emporterait en cascade ce que le patient y a laissé, et
--      un retrait par erreur ne se rattraperait pas. La colonne `archived_at`
--      le sort de SON espace (politiques et fonctions ci-dessous) et le laisse
--      à la thérapeute, qui peut le remettre.
--
--   2. Changer l'adresse d'une fiche. Une fiche créée sans adresse ne
--      recevait jamais son accès, une adresse fausse ne se corrigeait pas.
--      Mais une fiche dont le compte est déjà rattaché (`auth_user_id`) ne
--      doit pas changer d'adresse en silence : l'espace resterait à
--      l'ancienne, et le lien envoyé à la nouvelle ouvrirait un compte neuf,
--      sans fiche, sur un espace vide. D'où un verrou, et une seule porte —
--      `cabinet_changer_adresse` — qui détache le compte en le disant.
--
--   3. Retirer un audio, à un patient ou de la bibliothèque. Un audio ACHETÉ
--      dans la boutique appartient au patient qui l'a payé ; un audio EN
--      VENTE, s'il disparaissait, laisserait un produit qui encaisse sans
--      rien livrer. La base refuse ces deux suppressions-là.

-- ============================================================================
-- 1. Un exercice se retire du parcours
-- ============================================================================

alter table public.patient_modules
  add column if not exists archived_at timestamptz;

comment on column public.patient_modules.archived_at is
  'Retiré du parcours par le cabinet. Invisible au patient, conservé au dossier.';

-- Le cabinet écrit la colonne sous sa politique « cabinet », comme les autres.
-- Le droit est redit colonne par colonne : si les droits de la table viennent
-- à se resserrer par colonnes, celle-ci — plus jeune que la liste — ne doit
-- pas rester dehors.
grant select (archived_at), update (archived_at) on public.patient_modules to authenticated;

-- Les politiques du patient sont cherchées plutôt que nommées : l'accent de
-- « répond » n'est pas le même selon les bases (voir 0030). Seules les
-- permissives qui passent par la fiche du patient sont remplacées ; celle du
-- cabinet ne bouge pas.
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'patient_modules'
       and permissive = 'PERMISSIVE' and cmd = 'SELECT'
       and coalesce(qual, '') like '%is_patient_record%'
  loop
    execute format('drop policy %I on public.patient_modules', r.policyname);
  end loop;

  for r in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'module_quiz_answers'
       and permissive = 'PERMISSIVE'
       and coalesce(qual, '') || coalesce(with_check, '') like '%is_patient_record%'
  loop
    execute format('drop policy %I on public.module_quiz_answers', r.policyname);
  end loop;
end $$;

create policy "le patient lit ses modules"
  on public.patient_modules for select to authenticated
  using (public.is_patient_record(patient_id) and archived_at is null);

-- Un exercice retiré n'a plus de quiz à passer : ni lecture, ni réponse.
create policy "le patient répond aux quiz"
  on public.module_quiz_answers for all to authenticated
  using (exists (
    select 1 from public.patient_modules m
     where m.id = module_quiz_answers.module_id
       and public.is_patient_record(m.patient_id)
       and m.archived_at is null
  ))
  with check (exists (
    select 1 from public.patient_modules m
     where m.id = module_quiz_answers.module_id
       and public.is_patient_record(m.patient_id)
       and m.archived_at is null
  ));

-- Les deux gestes du patient passent par des fonctions SECURITY DEFINER, que
-- la RLS n'arrête pas : elles doivent refuser d'elles-mêmes un exercice
-- retiré — un onglet resté ouvert le montre encore.
create or replace function public.patient_set_module_done(p_module uuid, p_done boolean)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare v_done timestamptz;
begin
  update public.patient_modules m
     set done_at = case when p_done then now() else null end
   where m.id = p_module
     and public.is_patient_record(m.patient_id)
     and m.archived_at is null
  returning m.done_at into v_done;

  if not found then
    raise exception 'Module introuvable ou hors de votre parcours.';
  end if;
  return v_done;
end;
$$;

create or replace function public.patient_save_note(p_module uuid, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.patient_modules m
     set patient_note = p_note
   where m.id = p_module
     and public.is_patient_record(m.patient_id)
     and m.archived_at is null;

  if not found then
    raise exception 'Module introuvable ou hors de votre parcours.';
  end if;
end;
$$;

-- ============================================================================
-- 2. L'adresse d'une fiche, et le compte qui s'y rattache
-- ============================================================================
--
-- L'invariant : tant qu'un compte est rattaché, l'adresse de la fiche est
-- celle avec laquelle il l'a été (`claim_access` rapproche par adresse, et le
-- patient ne change pas la sienne). Un changement d'adresse qui garderait le
-- compte le romprait sans que personne le voie. Changer la casse n'est pas
-- changer d'adresse.

create or replace function public.garder_adresse_du_compte()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.auth_user_id is not null
     and new.auth_user_id is not distinct from old.auth_user_id
     and lower(coalesce(new.email, '')) <> lower(coalesce(old.email, '')) then
    raise exception
      'Son espace est activé avec l''adresse %. Pour la changer, détachez d''abord ce compte depuis les réglages de la fiche.',
      old.email
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.garder_adresse_du_compte() from public, anon, authenticated;

drop trigger if exists patients_adresse_du_compte on public.patients;
create trigger patients_adresse_du_compte
  before update of email on public.patients
  for each row execute function public.garder_adresse_du_compte();

-- La seule porte pour changer l'adresse d'une fiche rattachée : elle détache
-- le compte dans la même écriture, et le rend (`detache`) pour que l'écran le
-- dise. Sur une fiche non rattachée, c'est un simple changement d'adresse.
-- Rend { change, detache }.
create or replace function public.cabinet_changer_adresse(p_patient uuid, p_email text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_cabinet uuid;
  v_avant   text;
  v_compte  uuid;
  v_email   text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  select p.cabinet_id, p.email, p.auth_user_id
    into v_cabinet, v_avant, v_compte
    from public.patients p
   where p.id = p_patient;

  if v_cabinet is null or not public.is_cabinet_member(v_cabinet) then
    raise exception 'Fiche introuvable dans votre cabinet.' using errcode = '42501';
  end if;

  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'Cette adresse ne ressemble pas à une adresse électronique.'
      using errcode = 'check_violation';
  end if;

  if v_email is not distinct from lower(v_avant) then
    return jsonb_build_object('change', false, 'detache', false);
  end if;

  -- Une fiche activée garde une adresse : l'effacer fermerait l'espace sans
  -- rien proposer à la place. Pour fermer un espace, on clôt le suivi.
  if v_compte is not null and v_email is null then
    raise exception 'Son espace est activé : sa fiche garde une adresse. Pour fermer son espace, closez le suivi.'
      using errcode = 'check_violation';
  end if;

  -- L'unicité par cabinet (patients_cabinet_email_idx) lève 23505 ici :
  -- l'écran en fait sa phrase.
  update public.patients
     set email = v_email,
         auth_user_id = null
   where id = p_patient;

  -- Ni l'ancienne ni la nouvelle adresse au journal : le fait suffit.
  insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
  values (
    v_cabinet, auth.uid(),
    case when v_compte is not null then 'patient.compte_detache' else 'patient.adresse_changee' end,
    'patients', p_patient,
    jsonb_build_object('compte_detache', v_compte is not null)
  );

  return jsonb_build_object('change', true, 'detache', v_compte is not null);
end;
$$;

revoke execute on function public.cabinet_changer_adresse(uuid, text) from public, anon;
grant execute on function public.cabinet_changer_adresse(uuid, text) to authenticated;

-- ============================================================================
-- 3. Un audio acheté ne se retire pas, un audio en vente ne se supprime pas
-- ============================================================================
--
-- Les deux déclencheurs laissent passer ce qui part AVEC la fiche ou le
-- cabinet : supprimer un dossier, ou un cabinet, emporte tout, achats
-- compris. Dans une suppression en cascade, la ligne parente est déjà partie
-- quand la ligne enfant est examinée — c'est ce qu'on teste.

create or replace function public.garder_les_audios_achetes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.cabinets c where c.id = old.cabinet_id)
     or not exists (select 1 from public.patients p where p.id = old.patient_id) then
    return old;
  end if;

  if exists (
    select 1
      from public.orders o
      join public.products pr on pr.id = o.product_id
     where o.patient_id = old.patient_id
       and pr.audio_id = old.audio_id
       and o.status = 'payee'
  ) then
    raise exception 'Cet audio a été acheté dans votre boutique : il appartient à son compte, et y reste.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

revoke execute on function public.garder_les_audios_achetes() from public, anon, authenticated;

drop trigger if exists patient_audios_achats on public.patient_audios;
create trigger patient_audios_achats
  before delete on public.patient_audios
  for each row execute function public.garder_les_audios_achetes();

create or replace function public.garder_les_audios_vendus()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_titre text;
begin
  if not exists (select 1 from public.cabinets c where c.id = old.cabinet_id) then
    return old;
  end if;

  select pr.title into v_titre
    from public.products pr
   where pr.audio_id = old.id and pr.archived_at is null
   order by pr.position
   limit 1;
  if v_titre is not null then
    raise exception 'Cet audio est proposé dans votre boutique (« % ») : retirez d''abord le produit.', v_titre
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
      from public.orders o
      join public.products pr on pr.id = o.product_id
     where pr.audio_id = old.id and o.status = 'payee'
  ) then
    raise exception 'Cet audio a été acheté dans votre boutique : il appartient aux patients qui l''ont payé, et ne peut plus être supprimé.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

revoke execute on function public.garder_les_audios_vendus() from public, anon, authenticated;

drop trigger if exists audio_library_ventes on public.audio_library;
create trigger audio_library_ventes
  before delete on public.audio_library
  for each row execute function public.garder_les_audios_vendus();
