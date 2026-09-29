-- ============================================================================
-- 0064 — La note d'honoraires part au patient par courriel, si on le demande
-- ============================================================================
--
-- En émettant une note, la praticienne coche « l'envoyer par courriel » : la
-- note part à l'adresse de la fiche, et son PDF se télécharge comme avant.
-- Sans la case, rien ne part. Une note déjà émise se renvoie depuis sa ligne.
--
-- LE SERVEUR ENVOIE, LA BASE DÉCIDE. Le serveur ne choisit ni le destinataire
-- ni ce qui est dit : il appelle `cabinet_preparer_envoi_note_honoraires`
-- sous l'identité de la praticienne, qui vérifie qu'elle est du cabinet, que
-- la note est vivante, que la fiche a une adresse, et que les plafonds ne
-- sont pas atteints ; elle inscrit l'envoi et rend l'adresse. Le serveur
-- envoie, puis note ce qui s'est passé (parti ou échec).
--
-- LES PLAFONDS. Une adresse d'expédition se juge à ce qu'elle envoie : un
-- compte d'essai qui ouvrirait des fiches à des adresses inventées pour leur
-- adresser des pièces jointes abîmerait la réputation de l'expéditeur pour
-- tous les cabinets. Trois envois par note et par jour ; trente par cabinet
-- et par heure. Un verrou par cabinet : deux envois simultanés comptent l'un
-- après l'autre.
--
-- La note elle-même ne change pas : elle reste figée (0053). Les envois sont
-- une table à part, que le cabinet lit et que personne n'écrit du navigateur.

create table if not exists public.notes_honoraires_envois (
  id            uuid primary key default gen_random_uuid(),
  note_id       uuid not null references public.notes_honoraires (id) on delete cascade,
  cabinet_id    uuid not null references public.cabinets (id) on delete cascade,
  destinataire  text not null check (char_length(destinataire) between 3 and 320),
  par           uuid references auth.users (id) on delete set null,
  le            timestamptz not null default now(),
  statut        text not null default 'en_cours' check (statut in ('en_cours', 'parti', 'echec'))
);

create index if not exists notes_honoraires_envois_note_idx    on public.notes_honoraires_envois (note_id, le desc);
create index if not exists notes_honoraires_envois_cabinet_idx on public.notes_honoraires_envois (cabinet_id, le desc);
create index if not exists notes_honoraires_envois_par_idx     on public.notes_honoraires_envois (par);

alter table public.notes_honoraires_envois enable row level security;
revoke all on public.notes_honoraires_envois from anon, authenticated;
grant select on public.notes_honoraires_envois to authenticated;

drop policy if exists "le cabinet relit ses envois de notes" on public.notes_honoraires_envois;
create policy "le cabinet relit ses envois de notes"
  on public.notes_honoraires_envois for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

comment on table public.notes_honoraires_envois is
  'Chaque envoi d''une note d''honoraires par courriel : à qui, quand, par qui, et s''il est parti. Écrite par cabinet_preparer_envoi_note_honoraires et par le serveur.';

create or replace function public.cabinet_preparer_envoi_note_honoraires(p_note uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_note    public.notes_honoraires;
  v_email   text;
  v_fiche   text;
  v_cabinet text;
  v_moi     text;
  v_envoi   uuid;
  v_n       integer;
begin
  select * into v_note from public.notes_honoraires n where n.id = p_note;
  if not found or not public.is_cabinet_member(v_note.cabinet_id) then
    raise exception 'Cette note d''honoraires n''existe pas.' using errcode = 'P0002';
  end if;
  if not public.cabinet_ouvert(v_note.cabinet_id) then
    raise exception 'Ce cabinet est fermé : aucune note ne part tant qu''il n''est pas rouvert.'
      using errcode = 'check_violation';
  end if;
  if v_note.annulee_le is not null then
    raise exception 'Cette note est annulée : elle ne s''envoie plus.' using errcode = 'check_violation';
  end if;
  if v_note.patient_id is null then
    raise exception 'Cette note n''est plus rattachée à une fiche : téléchargez-la et remettez-la vous-même.'
      using errcode = 'check_violation';
  end if;

  select btrim(coalesce(p.email, '')), p.display_name into v_email, v_fiche
    from public.patients p
   where p.id = v_note.patient_id and p.cabinet_id = v_note.cabinet_id;
  if v_email is null or v_email = '' then
    raise exception 'La fiche de % n''a pas d''adresse de courriel : ajoutez-la, puis envoyez la note.',
      coalesce(v_fiche, v_note.beneficiaire)
      using errcode = 'check_violation';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' or char_length(v_email) > 320 then
    raise exception 'L''adresse de la fiche (%) n''est pas une adresse de courriel valide : corrigez-la, puis envoyez la note.',
      v_email
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('klaro.envoi-note:' || v_note.cabinet_id::text));

  select count(*) into v_n
    from public.notes_honoraires_envois e
   where e.note_id = v_note.id
     and e.statut <> 'echec'
     and e.le > now() - interval '1 day';
  if v_n >= 3 then
    raise exception 'Cette note est déjà partie trois fois aujourd''hui : elle pourra repartir demain.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_n
    from public.notes_honoraires_envois e
   where e.cabinet_id = v_note.cabinet_id
     and e.le > now() - interval '1 hour';
  if v_n >= 30 then
    raise exception 'Trente notes sont parties dans l''heure : les suivantes pourront partir un peu plus tard.'
      using errcode = 'check_violation';
  end if;

  insert into public.notes_honoraires_envois (note_id, cabinet_id, destinataire, par)
  values (v_note.id, v_note.cabinet_id, v_email, auth.uid())
  returning id into v_envoi;

  -- Le fait et son numéro : ni l'adresse, ni le montant.
  insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
  values (v_note.cabinet_id, auth.uid(), 'honoraires.envoyee', 'notes_honoraires', v_note.id,
          jsonb_build_object('numero', v_note.numero));

  select c.name into v_cabinet from public.cabinets c where c.id = v_note.cabinet_id;
  select u.email into v_moi from auth.users u where u.id = auth.uid();

  return jsonb_build_object(
    'envoi', v_envoi,
    'destinataire', v_email,
    'numero', v_note.numero,
    'date_prestation', v_note.date_prestation,
    'beneficiaire', v_note.beneficiaire,
    'praticien', v_note.praticien,
    'cabinet', coalesce(v_cabinet, ''),
    'repondre_a', v_moi
  );
end;
$fn$;

revoke execute on function public.cabinet_preparer_envoi_note_honoraires(uuid) from public, anon;
grant execute on function public.cabinet_preparer_envoi_note_honoraires(uuid) to authenticated;

comment on function public.cabinet_preparer_envoi_note_honoraires(uuid) is
  'Inscrit l''envoi d''une note d''honoraires vivante à l''adresse de sa fiche, sous plafonds, et rend de quoi composer le courriel. Le serveur envoie.';
