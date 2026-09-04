-- Compter une séance sans pouvoir perdre le compte.
--
-- La clôture lisait sessions_done, ajoutait un, et réécrivait. Deux défauts
-- dans ce seul geste :
--
-- 1. UNE LECTURE QUI ÉCHOUE REMETTAIT LE COMPTEUR À UN. `fiche?.sessions_done
--    ?? 0` ne distingue pas « la fiche dit zéro » de « la lecture n'a rien
--    rendu ». Une panne réseau d'une seconde effaçait donc l'historique d'une
--    patiente suivie depuis deux ans — et le badge de maturité, qui se lit
--    dessus, repartait de zéro sans que personne ne comprenne pourquoi.
--
-- 2. DEUX CLÔTURES SIMULTANÉES N'EN COMPTAIENT QU'UNE. Lire puis écrire n'est
--    pas atomique : deux onglets, ou deux praticiennes du même cabinet, lisent
--    la même valeur et écrivent la même valeur plus un.
--
-- L'incrément se fait donc en base, en une seule instruction, et l'appartenance
-- au cabinet est vérifiée là aussi — la fonction est SECURITY DEFINER, elle ne
-- doit pas devenir un moyen de toucher la fiche d'un autre cabinet.

create or replace function public.cabinet_compter_seance(p_patient uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_total integer;
begin
  update public.patients p
     set sessions_done = coalesce(p.sessions_done, 0) + 1
   where p.id = p_patient
     and public.is_cabinet_member(p.cabinet_id)
  returning p.sessions_done into v_total;

  if v_total is null then
    raise exception 'Fiche introuvable, ou hors de votre cabinet.';
  end if;
  return v_total;
end;
$$;

revoke execute on function public.cabinet_compter_seance(uuid) from public, anon;
grant execute on function public.cabinet_compter_seance(uuid) to authenticated;

comment on function public.cabinet_compter_seance(uuid) is
  'Ajoute une séance au compteur d''une fiche, en une seule instruction. Un lire-puis-écrire perdait le compte sur une lecture ratée, et n''en comptait qu''une sur deux clôtures simultanées.';
