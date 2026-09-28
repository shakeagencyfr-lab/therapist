-- ============================================================================
-- 0041 — Changer son mot de passe, en prouvant qui l'on est
-- ============================================================================
--
-- Jusqu'ici, n'importe quelle session ouverte pouvait remplacer le mot de
-- passe du compte, sans rien demander. Un ordinateur de cabinet resté
-- allumé, une tablette prêtée : il suffisait de passer devant pour prendre
-- le compte et en fermer la porte à sa titulaire.
--
-- Le changement passe désormais par le serveur, qui exige l'une de deux
-- preuves : le mot de passe actuel, ou une entrée par lien reçu par courriel
-- il y a moins de vingt-quatre heures (ce que dit le jeton, champ amr).
--
-- Cette migration porte la première preuve : comparer un mot de passe à
-- l'empreinte que garde le service d'authentification. Elle ne s'expose
-- qu'au serveur — jamais au navigateur — et elle compte les échecs : cinq
-- en quinze minutes, et elle refuse d'essayer davantage. Sans ce compte,
-- une session volée deviendrait une machine à deviner le mot de passe.

create table if not exists public.essais_mot_de_passe (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  essaye_le  timestamptz not null default now()
);

create index if not exists essais_mot_de_passe_user_idx
  on public.essais_mot_de_passe (user_id, essaye_le);

-- Aucune politique, aucun droit : seul le serveur y touche, par la fonction.
alter table public.essais_mot_de_passe enable row level security;
revoke all on public.essais_mot_de_passe from public, anon, authenticated;

comment on table public.essais_mot_de_passe is
  'Échecs récents de vérification du mot de passe actuel. Serveur seulement.';

-- 'ok'      le mot de passe est le bon ;
-- 'faux'    il ne l'est pas (ou le compte n'en a pas) ;
-- 'trop'    cinq échecs en quinze minutes : on n'essaie même pas ;
-- 'inconnu' l'empreinte n'est pas lisible ici (format importé) : le serveur
--           renvoie alors vers l'entrée par lien.
create or replace function public.verifier_mot_de_passe(p_user uuid, p_mot_de_passe text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_empreinte text;
  v_echecs integer;
begin
  if p_user is null then
    return 'faux';
  end if;

  select count(*) into v_echecs
    from public.essais_mot_de_passe
   where user_id = p_user and essaye_le > now() - interval '15 minutes';
  if v_echecs >= 5 then
    return 'trop';
  end if;

  select encrypted_password into v_empreinte from auth.users where id = p_user;

  -- Au-delà de 72 octets, bcrypt tronque : un tel mot de passe n'a jamais pu
  -- être posé, il ne peut pas être le bon.
  if v_empreinte is null or v_empreinte = '' or p_mot_de_passe is null
     or p_mot_de_passe = '' or octet_length(p_mot_de_passe) > 72 then
    insert into public.essais_mot_de_passe (user_id) values (p_user);
    return 'faux';
  end if;

  if v_empreinte !~ '^\$2[abxy]\$' then
    return 'inconnu';
  end if;

  if extensions.crypt(p_mot_de_passe, v_empreinte) = v_empreinte then
    delete from public.essais_mot_de_passe where user_id = p_user;
    return 'ok';
  end if;

  insert into public.essais_mot_de_passe (user_id) values (p_user);
  -- Le ménage au passage : au-delà d'un jour, un échec ne compte plus.
  delete from public.essais_mot_de_passe where essaye_le < now() - interval '1 day';
  return 'faux';
end;
$$;

revoke all on function public.verifier_mot_de_passe(uuid, text) from public, anon, authenticated;
grant execute on function public.verifier_mot_de_passe(uuid, text) to service_role;
