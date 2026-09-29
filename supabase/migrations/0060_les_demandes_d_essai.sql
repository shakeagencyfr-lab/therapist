-- 0060 — Les demandes d'essai de la page d'accueil.
--
-- La racine de klaroweb.site devient une page de vente : une hypnothérapeute
-- y laisse son nom, son adresse et son cabinet pour qu'on lui ouvre un essai.
-- Ces demandes arrivent chez UN revendeur — celui qui « accueille les demandes
-- de la plateforme » — et chez lui seul : ses membres les lisent, les
-- traitent, les effacent. Personne d'autre ne les voit, ni un autre revendeur,
-- ni un cabinet, ni surtout le visiteur anonyme.
--
-- PAS D'ÉCRITURE ANONYME DIRECTE. Le visiteur n'a pas de compte : sa demande
-- passe par le serveur (api/invitations, geste « demande-essai »), qui vérifie
-- le CAPTCHA quand il est réglé, puis appelle `deposer_demande_essai` avec la
-- clé de service. Ouverte à `anon`, cette fonction aurait laissé n'importe qui
-- contourner le CAPTCHA en appelant la base directement — la vérification
-- n'aurait plus rien gardé. Elle ne s'exécute donc que pour `service_role`,
-- et c'est ELLE qui tient les bornes : longueurs, formats, consentement,
-- trois demandes par adresse et par jour, trente par heure sur la plateforme.
-- Sans CAPTCHA réglé, ces bornes sont la seule garde, et elles suffisent à
-- empêcher qu'une rafale noie la liste du revendeur.
--
-- Le champ piège du formulaire est vérifié par l'écran et par le serveur : un
-- robot qui le remplit reçoit un « merci » et n'écrit rien.

-- ── Le revendeur qui accueille ──────────────────────────────────────────────

alter table public.resellers
  add column if not exists accueille_demandes boolean not null default false;

comment on column public.resellers.accueille_demandes is
  'Vrai pour le revendeur qui reçoit les demandes d''essai de la page d''accueil (0060). Un seul à la fois.';

-- Un seul à la fois : deux revendeurs qui se partageraient les demandes
-- verraient chacun la moitié d'une file, et aucun ne saurait qu'il en manque.
create unique index if not exists resellers_un_seul_accueil
  on public.resellers ((true)) where accueille_demandes;

-- Le revendeur existant accueille : c'est la plateforme qui l'a ouvert, et il
-- n'y en a qu'un. Rien ne change si un autre accueille déjà.
update public.resellers
   set accueille_demandes = true
 where id = (select id from public.resellers order by created_at limit 1)
   and not exists (select 1 from public.resellers where accueille_demandes);

-- ── Les demandes ────────────────────────────────────────────────────────────

create table if not exists public.demandes_essai (
  id              uuid primary key default gen_random_uuid(),
  reseller_id     uuid not null references public.resellers(id) on delete cascade,
  created_at      timestamptz not null default now(),
  nom             text not null,
  email           text not null,
  telephone       text,
  cabinet         text not null,
  ville           text not null,
  patients        text not null,
  offre           text not null,
  message         text,
  -- Le consentement au recontact, horodaté : sans lui, rien ne s'écrit.
  consentement_le timestamptz not null,
  statut          text not null default 'nouvelle',
  statut_le       timestamptz,
  note_interne    text not null default '',

  constraint demandes_essai_nom check (char_length(nom) between 2 and 120),
  constraint demandes_essai_email check (
    char_length(email) between 3 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  ),
  constraint demandes_essai_telephone check (telephone is null or telephone ~ '^[0-9 +().-]{6,30}$'),
  constraint demandes_essai_cabinet check (char_length(cabinet) between 2 and 120),
  constraint demandes_essai_ville check (char_length(ville) between 2 and 80),
  constraint demandes_essai_patients check (patients in ('moins-10', '10-25', '26-80', 'plus-80')),
  constraint demandes_essai_offre check (offre in ('essentiel', 'cabinet', 'reseau', 'a-voir')),
  constraint demandes_essai_message check (message is null or char_length(message) <= 2000),
  constraint demandes_essai_statut check (statut in ('nouvelle', 'contactee', 'ouverte', 'sans-suite')),
  constraint demandes_essai_note check (char_length(note_interne) <= 4000)
);

comment on table public.demandes_essai is
  'Demandes d''essai déposées depuis la page d''accueil (0060). Lues et traitées par les membres du revendeur qui les accueille ; écrites par deposer_demande_essai() seulement.';

-- La clé étrangère a son index (tests/politiques_et_index.sql) — et c'est
-- celui de la liste du revendeur, la plus récente d'abord.
create index if not exists demandes_essai_revendeur_idx
  on public.demandes_essai (reseller_id, created_at desc);
-- Les deux bornes : par adresse sur vingt-quatre heures, et sur l'heure.
create index if not exists demandes_essai_adresse_idx on public.demandes_essai (email, created_at);
create index if not exists demandes_essai_recentes_idx on public.demandes_essai (created_at);

-- ── Qui lit, qui traite ─────────────────────────────────────────────────────

alter table public.demandes_essai enable row level security;

-- Rien pour `anon` : ni lecture, ni écriture. Pour un membre de revendeur,
-- lire, effacer, et ne changer QUE le statut et la note interne — une demande
-- ne se réécrit pas au nom de la personne qui l'a envoyée.
revoke all on table public.demandes_essai from public, anon, authenticated;
grant select, delete on table public.demandes_essai to authenticated;
grant update (statut, note_interne) on table public.demandes_essai to authenticated;

drop policy if exists "le revendeur lit ses demandes" on public.demandes_essai;
create policy "le revendeur lit ses demandes" on public.demandes_essai
  for select to authenticated
  using (public.is_reseller_member(reseller_id));

drop policy if exists "le revendeur traite ses demandes" on public.demandes_essai;
create policy "le revendeur traite ses demandes" on public.demandes_essai
  for update to authenticated
  using (public.is_reseller_member(reseller_id))
  with check (public.is_reseller_member(reseller_id));

-- Effacer : une personne qui demande qu'on oublie sa demande doit pouvoir
-- l'obtenir sans passer par nous.
drop policy if exists "le revendeur efface une demande" on public.demandes_essai;
create policy "le revendeur efface une demande" on public.demandes_essai
  for delete to authenticated
  using (public.is_reseller_member(reseller_id));

-- Le moment où le statut a changé, posé par la base : l'écran le lit, il ne
-- l'écrit pas (il n'en a pas le droit, colonne comprise).
create or replace function public.demande_essai_statut_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.statut is distinct from old.statut then
    new.statut_le := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.demande_essai_statut_date() from public, anon, authenticated;

drop trigger if exists demandes_essai_statut on public.demandes_essai;
create trigger demandes_essai_statut
  before update on public.demandes_essai
  for each row execute function public.demande_essai_statut_date();

-- ── Le dépôt ────────────────────────────────────────────────────────────────

/*
 * Déposer une demande. Rend {"ok": true}, ou {"ok": false, "motif": …} :
 *
 *   champ    un champ ne passe pas (et lequel, dans "champ") ;
 *   adresse  trois demandes déjà reçues de cette adresse en vingt-quatre heures ;
 *   heure    trente demandes déjà reçues sur la plateforme dans l'heure ;
 *   fermee   aucun revendeur n'accueille les demandes.
 *
 * Un refus ne lève pas d'exception : le serveur traduit le motif en une
 * phrase (src/lib/demandeEssai.ts, reponseAuRefus). Les bornes sont prises
 * sous un verrou de transaction, pour que deux dépôts simultanés ne passent
 * pas tous deux sous le plafond.
 */
create or replace function public.deposer_demande_essai(
  p_nom text,
  p_email text,
  p_telephone text,
  p_cabinet text,
  p_ville text,
  p_patients text,
  p_offre text,
  p_message text,
  p_consentement boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nom      text := btrim(coalesce(p_nom, ''));
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_tel      text := nullif(btrim(coalesce(p_telephone, '')), '');
  v_cabinet  text := btrim(coalesce(p_cabinet, ''));
  v_ville    text := btrim(coalesce(p_ville, ''));
  v_patients text := btrim(coalesce(p_patients, ''));
  v_offre    text := btrim(coalesce(p_offre, ''));
  v_message  text := nullif(btrim(coalesce(p_message, '')), '');
  v_revendeur uuid;
  v_n int;
begin
  if p_consentement is not true then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'consentement');
  end if;
  if char_length(v_nom) not between 2 and 120 or v_nom ~ '[[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'nom');
  end if;
  if char_length(v_email) not between 3 and 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'email');
  end if;
  if v_tel is not null
     and (v_tel !~ '^[0-9 +().-]{6,30}$' or char_length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 6) then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'telephone');
  end if;
  if char_length(v_cabinet) not between 2 and 120 or v_cabinet ~ '[[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'cabinet');
  end if;
  if char_length(v_ville) not between 2 and 80 or v_ville ~ '[[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'ville');
  end if;
  if v_patients not in ('moins-10', '10-25', '26-80', 'plus-80') then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'patients');
  end if;
  if v_offre not in ('essentiel', 'cabinet', 'reseau', 'a-voir') then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'offre');
  end if;
  if v_message is not null and char_length(v_message) > 2000 then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'message');
  end if;

  select id into v_revendeur from public.resellers where accueille_demandes limit 1;
  if v_revendeur is null then
    return jsonb_build_object('ok', false, 'motif', 'fermee');
  end if;

  -- Un dépôt à la fois : les deux comptes ci-dessous ne se croisent pas.
  perform pg_advisory_xact_lock(hashtext('klaro.demandes_essai'));

  select count(*) into v_n
    from public.demandes_essai
   where email = v_email and created_at > now() - interval '24 hours';
  if v_n >= 3 then
    return jsonb_build_object('ok', false, 'motif', 'adresse');
  end if;

  select count(*) into v_n
    from public.demandes_essai
   where created_at > now() - interval '1 hour';
  if v_n >= 30 then
    return jsonb_build_object('ok', false, 'motif', 'heure');
  end if;

  insert into public.demandes_essai
    (reseller_id, nom, email, telephone, cabinet, ville, patients, offre, message, consentement_le)
  values
    (v_revendeur, v_nom, v_email, v_tel, v_cabinet, v_ville, v_patients, v_offre, v_message, now());

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.deposer_demande_essai(text, text, text, text, text, text, text, text, boolean) is
  'Dépose une demande d''essai de la page d''accueil (0060). Valide tout, borne à 3 par adresse et par 24 h et à 30 par heure. Réservée au serveur (service_role), qui vérifie le CAPTCHA avant.';

revoke execute on function public.deposer_demande_essai(text, text, text, text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.deposer_demande_essai(text, text, text, text, text, text, text, text, boolean)
  to service_role;
