-- ============================================================================
-- 0019 — Ce que l'offre ouvre : patients, boutique, marque blanche, site.
--
-- Le revendeur vend l'application, pas l'analyse : chaque thérapeute branche
-- sa propre clé Anthropic et paie ses appels. Son offre règle donc ce que
-- l'application OUVRE, et rien d'autre.
--
-- Quatre leviers, un par colonne d'offre :
--
--   max_patients    combien de fiches actives le cabinet peut tenir
--   shop            la boutique en ligne
--   marque_blanche  son propre domaine et son propre SMTP
--   site            la bibliothèque de sites vitrines
--
-- CHAQUE LEVIER SE SURCHARGE PAR CABINET. Un revendeur qui négocie une
-- exception ne doit pas avoir à créer une quatrième offre pour un seul
-- cabinet : `subscriptions` porte des colonnes `*_override` nulles par
-- défaut, et l'offre s'applique quand elles le sont.
--
-- ET LE PLAFOND EST TENU PAR LA BASE, pas par l'écran. Un déclencheur refuse
-- la fiche au-delà du plafond : une limite qui ne vit que dans l'interface
-- n'est pas une limite, c'est une suggestion.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Ce que chaque offre ouvre
-- ---------------------------------------------------------------------------

alter table public.plans
  add column shop           boolean not null default false,
  add column marque_blanche boolean not null default false,
  add column site           boolean not null default false;

comment on column public.plans.shop is
  'La boutique en ligne est-elle ouverte aux cabinets de cette offre ?';
comment on column public.plans.marque_blanche is
  'Domaine personnalisé et SMTP propre : la marque blanche totale.';
comment on column public.plans.site is
  'La bibliothèque de sites vitrines, nourrie par la fiche Google.';

-- Le plafond de consommation IA n'a plus de sens : la thérapeute paie ses
-- propres appels. La colonne reste pour ne pas casser les vues qui la lisent,
-- mais elle ne pilote plus rien.
comment on column public.plans.ai_monthly_cap_cents is
  'Vestige du temps où le revendeur avançait l''IA. Ne pilote plus rien : chaque cabinet paie ses appels avec sa clé.';

-- Les exceptions négociées, cabinet par cabinet. Nulles = l'offre s'applique.
alter table public.subscriptions
  add column max_patients_override   integer check (max_patients_override > 0),
  add column shop_override           boolean,
  add column marque_blanche_override boolean,
  add column site_override           boolean;

comment on column public.subscriptions.max_patients_override is
  'Plafond négocié pour ce cabinet. Null : celui de l''offre.';

-- Valeurs de départ : la boutique dès l'Essentiel, la marque blanche et le
-- site à partir de Cabinet. À ajuster par le revendeur depuis son écran.
update public.plans set shop = true                        where code in ('essentiel', 'cabinet', 'reseau');
update public.plans set marque_blanche = true, site = true where code in ('cabinet', 'reseau');

-- ---------------------------------------------------------------------------
-- Les droits effectifs, calculés en un seul endroit
--
-- Le serveur, les écrans et le déclencheur lisent tous cette fonction : trois
-- endroits qui recalculeraient la même règle finiraient par en avoir trois
-- versions.
-- ---------------------------------------------------------------------------

create or replace function public.cabinet_droits(p_cabinet uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case
    when public.is_cabinet_member(p_cabinet) or public.is_reseller_of_cabinet(p_cabinet)
    then jsonb_build_object(
      'max_patients',     coalesce(s.max_patients_override, p.max_patients),
      'patients_actives', (
        select count(*) from public.patients pa
        where pa.cabinet_id = p_cabinet and pa.archived_at is null
      ),
      'shop',             coalesce(s.shop_override,           p.shop,           false),
      'marque_blanche',   coalesce(s.marque_blanche_override, p.marque_blanche, false),
      'site',             coalesce(s.site_override,           p.site,           false),
      'offre',            p.label,
      'offre_code',       p.code
    )
  end
  from public.cabinets c
  left join public.subscriptions s on s.cabinet_id = c.id
  left join public.plans p on p.code = s.plan_code
  where c.id = p_cabinet;
$$;

revoke execute on function public.cabinet_droits(uuid) from public, anon;
grant execute on function public.cabinet_droits(uuid) to authenticated;

/**
 * Les droits du cabinet de l'appelante, sans avoir à nommer le cabinet.
 *
 * C'est la forme dont les écrans ont besoin : une praticienne ne connaît pas
 * l'identifiant de son cabinet, et n'a pas à le passer.
 */
create or replace function public.mes_droits()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select public.cabinet_droits(m.cabinet_id)
  from public.cabinet_members m
  where m.user_id = auth.uid()
  limit 1;
$$;

revoke execute on function public.mes_droits() from public, anon;
grant execute on function public.mes_droits() to authenticated;

-- ---------------------------------------------------------------------------
-- Le plafond de patients, tenu par la base
--
-- Une limite qui ne vit que dans l'interface n'est pas une limite. Le
-- déclencheur refuse l'insertion au-delà du plafond, avec un message que
-- l'écran peut afficher tel quel.
--
-- Il ne compte QUE les fiches actives : archiver libère une place, ce qui est
-- le comportement attendu quand un suivi se termine.
-- ---------------------------------------------------------------------------

create or replace function public.verifier_plafond_patientes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_max integer;
  v_actives integer;
begin
  select coalesce(s.max_patients_override, p.max_patients)
    into v_max
  from public.subscriptions s
  left join public.plans p on p.code = s.plan_code
  where s.cabinet_id = new.cabinet_id;

  -- Sans offre ou sans plafond, il n'y a rien à tenir : « sans limite » est
  -- une valeur légitime, pas une configuration manquante.
  if v_max is null then
    return new;
  end if;

  select count(*) into v_actives
  from public.patients
  where cabinet_id = new.cabinet_id and archived_at is null;

  if v_actives >= v_max then
    raise exception
      'Votre offre permet % fiches actives, et elles le sont toutes. Archivez un suivi terminé, ou demandez à votre revendeur de relever le plafond.',
      v_max
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger patients_plafond
  before insert on public.patients
  for each row execute function public.verifier_plafond_patientes();

-- ---------------------------------------------------------------------------
-- Le domaine du cabinet
--
-- La marque blanche totale, c'est son adresse à elle : espace.son-cabinet.fr
-- plutôt qu'un chemin sous le nôtre. Les enregistrements DNS à poser sont
-- rendus par l'hébergeur et conservés tels quels — les réécrire de mémoire
-- est le meilleur moyen de faire poser un CNAME faux.
-- ---------------------------------------------------------------------------

create table public.cabinet_domains (
  cabinet_id  uuid primary key references public.cabinets (id) on delete cascade,
  domaine     text not null unique,
  -- Vérifié par l'hébergeur : tant que c'est faux, l'adresse ne sert pas.
  verifie     boolean not null default false,
  -- Ce que l'hébergeur demande de poser, tel qu'il le rend.
  dns         jsonb not null default '[]',
  -- Dernier message de l'hébergeur, pour dire pourquoi ça ne prend pas.
  etat        text,
  verifie_le  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint cabinet_domains_forme check (
    domaine ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  )
);

create index cabinet_domains_domaine_idx on public.cabinet_domains (lower(domaine));

alter table public.cabinet_domains enable row level security;
revoke all on public.cabinet_domains from anon;

-- Le cabinet lit son domaine ; le serveur seul l'écrit, parce que l'écriture
-- s'accompagne d'un enregistrement chez l'hébergeur.
create policy "le cabinet lit son domaine"
  on public.cabinet_domains for select to authenticated
  using (public.is_cabinet_member(cabinet_id) or public.is_reseller_of_cabinet(cabinet_id));

revoke insert, update, delete on public.cabinet_domains from authenticated;

/**
 * Le cabinet qui répond à ce domaine.
 *
 * Ouvert à `anon` : c'est ce qui permet à la page de connexion, servie sur
 * l'adresse du cabinet, de porter son nom et ses couleurs AVANT que
 * quiconque se soit identifié. Comme `cabinet_vitrine`, cette fonction ne
 * rend que de la marque — jamais une donnée de santé, jamais un compte.
 */
create or replace function public.cabinet_par_domaine(p_domaine text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'slug', c.slug,
    'name', c.name,
    'tagline', c.tagline,
    'branding', c.branding
  )
  from public.cabinet_domains d
  join public.cabinets c on c.id = d.cabinet_id
  where lower(d.domaine) = lower(trim(p_domaine)) and d.verifie
  limit 1;
$$;

revoke execute on function public.cabinet_par_domaine(text) from public;
grant execute on function public.cabinet_par_domaine(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Le SMTP du cabinet
--
-- Les liens de connexion partent aujourd'hui de l'adresse de la plateforme.
-- En marque blanche totale, ils doivent partir de la sienne : c'est la
-- dernière chose qui trahit le fournisseur.
--
-- Le mot de passe seul est un secret, et il rejoint `cabinet_secrets` — la
-- table sans politique ni droit pour le rôle authentifié. L'hôte, le port,
-- l'identifiant et l'expéditeur ne le sont pas : ils s'affichent, et il faut
-- pouvoir les relire pour les corriger.
-- ---------------------------------------------------------------------------

alter table public.cabinet_settings
  add column smtp_host    text,
  add column smtp_port    integer check (smtp_port between 1 and 65535),
  add column smtp_user    text,
  add column smtp_from    text,
  add column smtp_set_at  timestamptz;

alter table public.cabinet_secrets
  add column smtp_pass_enc text;

comment on column public.cabinet_secrets.smtp_pass_enc is
  'Mot de passe SMTP, chiffré par INTEGRATIONS_KEY. Ne sort jamais du serveur.';

-- ---------------------------------------------------------------------------
-- Le site vitrine
--
-- Une page d'accueil publique par cabinet, choisie dans une bibliothèque de
-- modèles et nourrie par sa fiche Google : nom, adresse, horaires, note,
-- avis, photos. L'espace patient s'y intègre — c'est la même porte, posée
-- dans sa page.
--
-- LE CONTENU IMPORTÉ EST MODIFIABLE. Une fiche Google est souvent incomplète
-- ou datée : l'import remplit, la thérapeute corrige. On garde donc la date
-- d'import pour pouvoir dire d'où vient un texte, sans jamais l'écraser sans
-- qu'elle le demande.
-- ---------------------------------------------------------------------------

create table public.cabinet_sites (
  cabinet_id   uuid primary key references public.cabinets (id) on delete cascade,
  -- Le modèle choisi dans la bibliothèque.
  modele       text not null default 'sobre',
  publie       boolean not null default false,
  titre        text,
  sous_titre   text,
  presentation text,
  adresse      text,
  telephone    text,
  site_web     text,
  -- [{ jour, heures }] tel que la fiche Google le rend.
  horaires     jsonb not null default '[]',
  -- [{ url, alt, attribution }] — l'attribution est exigée par Google quand
  -- la photo vient de sa fiche.
  photos       jsonb not null default '[]',
  -- [{ titre, texte }] : ce qu'elle propose.
  services     jsonb not null default '[]',
  -- [{ auteur, note, texte, date }] repris de la fiche Google.
  avis         jsonb not null default '[]',
  google_place_id text,
  google_note     numeric(2, 1) check (google_note between 0 and 5),
  google_avis     integer check (google_avis >= 0),
  importe_le   timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.cabinet_sites enable row level security;
revoke all on public.cabinet_sites from anon;

create policy "cabinet"
  on public.cabinet_sites for all to authenticated
  using (public.is_cabinet_member(cabinet_id))
  with check (public.is_cabinet_member(cabinet_id));

create policy "le revendeur voit le site de ses cabinets"
  on public.cabinet_sites for select to authenticated
  using (public.is_reseller_of_cabinet(cabinet_id));

/**
 * Le site publié d'un cabinet, par son identifiant public.
 *
 * Ouvert à `anon` : c'est une page publique. Elle ne rend que ce que la
 * thérapeute a choisi de publier, et seulement si elle l'a publié — un
 * brouillon reste invisible.
 */
create or replace function public.site_vitrine(p_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'slug', c.slug,
    'name', c.name,
    'tagline', c.tagline,
    'branding', c.branding,
    'modele', s.modele,
    'titre', s.titre,
    'sous_titre', s.sous_titre,
    'presentation', s.presentation,
    'adresse', s.adresse,
    'telephone', s.telephone,
    'site_web', s.site_web,
    'horaires', s.horaires,
    'photos', s.photos,
    'services', s.services,
    'avis', s.avis,
    'google_note', s.google_note,
    'google_avis', s.google_avis
  )
  from public.cabinet_sites s
  join public.cabinets c on c.id = s.cabinet_id
  where lower(c.slug) = lower(trim(p_slug)) and s.publie
  limit 1;
$$;

revoke execute on function public.site_vitrine(text) from public;
grant execute on function public.site_vitrine(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Les photos du site
--
-- Compartiment public, comme les logos : ce sont des images destinées à une
-- page d'accueil. Plus généreux en taille — une photo de cabinet n'est pas
-- une vignette — et toujours sans SVG, qui peut porter du script.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sites', 'sites', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "le cabinet dépose ses photos de site"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sites' and public.is_cabinet_member(public.cabinet_of_path(name)));

create policy "le cabinet remplace ses photos de site"
  on storage.objects for update to authenticated
  using (bucket_id = 'sites' and public.is_cabinet_member(public.cabinet_of_path(name)));

create policy "le cabinet retire ses photos de site"
  on storage.objects for delete to authenticated
  using (bucket_id = 'sites' and public.is_cabinet_member(public.cabinet_of_path(name)));

-- ---------------------------------------------------------------------------
-- Le revendeur règle ses offres
--
-- Le catalogue `plans` était en lecture seule pour tout le monde : les prix et
-- les plafonds ne se changeaient qu'en base. Puisque c'est lui qui vend, c'est
-- lui qui règle.
--
-- Réserve assumée : le catalogue est GLOBAL, pas par revendeur. Tant qu'il n'y
-- a qu'une enseigne, cela suffit. Le jour où il y en aura deux, il faudra une
-- colonne `reseller_id` sur `plans` et une clé composée sur `subscriptions` —
-- mieux vaut le dire ici que le découvrir alors.
-- ---------------------------------------------------------------------------

create policy "le revendeur regle les offres"
  on public.plans for update to authenticated
  using (exists (select 1 from public.reseller_members m where m.user_id = auth.uid()))
  with check (exists (select 1 from public.reseller_members m where m.user_id = auth.uid()));

grant update on public.plans to authenticated;
