-- ============================================================================
-- Le revendeur ouvre le cabinet, puis n'y entre plus
--
-- L'écran du revendeur affirme : « La praticienne devient propriétaire de ses
-- données : vous n'y entrez pas. » Le schéma, lui, laissait une porte.
--
-- Le revendeur pouvait créer une invitation de cabinet pour UNE ADRESSE QU'IL
-- CONTRÔLE, se connecter avec elle, et `claim_access()` en faisait un membre
-- du cabinet — donc de tout le dossier : noms, notes, transcriptions,
-- journaux, profils. Rien dans l'interface ne l'annonçait à la praticienne.
--
-- Interdire au revendeur d'inviter sa propre adresse ne suffit pas : il en
-- contrôle d'autres. Ce qui se borne vraiment, c'est le MOMENT.
--
--   - Tant que le cabinet n'a AUCUN membre, le revendeur invite : c'est
--     l'amorçage, et c'est ainsi qu'un cabinet s'ouvre.
--   - Dès qu'une praticienne l'a rejoint, le revendeur ne peut plus inviter
--     personne. Le cabinet est à elle.
--   - Et c'est elle qui invite ses consœurs — ce que le schéma ne permettait
--     à personne, ce qui rendait l'offre « plusieurs praticiennes » inopérante.
--
-- Le revendeur garde la LECTURE des invitations : son portefeuille affiche
-- « Invitation envoyée » tant qu'elle est en attente, et cela ne donne accès
-- à rien.
-- ============================================================================

-- La politique d'origine existe en deux orthographes selon les bases — avec et
-- sans accent. N'en retirer qu'une laisserait la porte ouverte par l'autre :
-- les politiques d'une table se cumulent, il suffit qu'une seule autorise.
drop policy if exists "le revendeur gère les invitations" on public.cabinet_invitations;
drop policy if exists "le revendeur gere les invitations" on public.cabinet_invitations;

-- Lecture : le revendeur suit l'ouverture de ses cabinets.
create policy "le revendeur voit les invitations de ses cabinets"
  on public.cabinet_invitations for select to authenticated
  using (public.is_reseller_of_cabinet(cabinet_id));

/**
 * Le cabinet a-t-il déjà quelqu'un ?
 *
 * SECURITY DEFINER : la politique doit pouvoir compter les membres d'un
 * cabinet dont le demandeur n'est pas membre — sans quoi la RLS de
 * `cabinet_members` répondrait « personne » à tout le monde, et la borne ne
 * bornerait rien.
 */
create or replace function public.cabinet_a_un_membre(p_cabinet uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.cabinet_members m where m.cabinet_id = p_cabinet);
$$;

-- Une politique s'évalue sous le rôle qui écrit : sans ce droit, l'amorçage
-- lui-même serait refusé. La fonction ne rend qu'un booléen — « ce cabinet
-- a-t-il quelqu'un » — et aucune donnée.
revoke execute on function public.cabinet_a_un_membre(uuid) from public, anon;
grant execute on function public.cabinet_a_un_membre(uuid) to authenticated;

-- Écriture, côté revendeur : seulement tant que le cabinet est vide.
create policy "le revendeur ouvre un cabinet vide"
  on public.cabinet_invitations for insert to authenticated
  with check (
    public.is_reseller_of_cabinet(cabinet_id)
    and not public.cabinet_a_un_membre(cabinet_id)
  );

-- Corriger une adresse mal saisie, ou retirer une invitation : même borne.
create policy "le revendeur corrige une invitation en attente"
  on public.cabinet_invitations for update to authenticated
  using (public.is_reseller_of_cabinet(cabinet_id) and not public.cabinet_a_un_membre(cabinet_id))
  with check (public.is_reseller_of_cabinet(cabinet_id) and not public.cabinet_a_un_membre(cabinet_id));

create policy "le revendeur retire une invitation en attente"
  on public.cabinet_invitations for delete to authenticated
  using (public.is_reseller_of_cabinet(cabinet_id) and not public.cabinet_a_un_membre(cabinet_id));

-- Et la praticienne invite ses consœurs, ce que rien ne permettait.
create policy "le cabinet invite ses praticiennes"
  on public.cabinet_invitations for all to authenticated
  using (public.is_cabinet_member(cabinet_id))
  with check (public.is_cabinet_member(cabinet_id));
