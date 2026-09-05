-- Deux gestes qui pouvaient laisser un patient devant un espace faux.
--
-- ============================================================================
-- 1. Le fil de 0030, tiré jusqu'au bout
-- ============================================================================
--
-- 0030 a posé la règle : le cabinet d'une ligne se DÉDUIT de la fiche, il ne
-- se déclare pas depuis le navigateur. Elle n'a été appliquée qu'à trois
-- tables — celles que la passe d'audit avait nommées. Or neuf tables portent
-- les deux clés, et quatre d'entre elles sont LUES PAR LE PATIENT sur son
-- propre identifiant : affirmations, patient_audios, patient_modules,
-- push_recipients.
--
-- Sur ces quatre-là, la faille n'est pas théorique. La politique du cabinet
-- accepte l'écriture dès que `cabinet_id` est le sien ; `patient_id`, lui,
-- n'était comparé à rien. N'importe quel compte membre d'un cabinet pouvait
-- donc déposer une ligne au nom d'un patient qui ne le connaît pas — et ce
-- patient la lisait, puisque SA politique ne regarde que `patient_id`. Des
-- affirmations, un audio, un exercice, une notification : dans l'espace d'une
-- personne en thérapie, déposés par un inconnu.
--
-- On l'étend donc aux neuf, y compris là où seul le cabinet lit. Une règle qui
-- ne vaut que sur les tables où quelqu'un a déjà cherché la faille n'est pas
-- une règle ; c'est la liste des endroits où l'on a regardé.
--
-- Vérifié avant de poser : zéro ligne mal rangée sur les neuf tables.

do $$
declare
  t text;
begin
  foreach t in array array[
    'affirmations', 'patient_audios', 'patient_modules', 'push_recipients',
    'hypnoses', 'patient_settings', 'psych_profiles', 'therapy_sessions', 'orders'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_rangement', t);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.ranger_selon_la_fiche()',
      t || '_rangement', t);
  end loop;
end $$;

-- ============================================================================
-- 2. Publier des affirmations sans pouvoir les perdre
-- ============================================================================
--
-- L'écran remplaçait la liste en deux appels : un DELETE, puis un INSERT.
-- Entre les deux, rien ne tient. Une coupure réseau, un onglet fermé, un
-- refus de la base sur la seconde requête, et le patient se retrouvait avec
-- AUCUNE affirmation — pendant que la thérapeute lisait « Les affirmations
-- n'ont pas pu être publiées », c'est-à-dire l'inverse de ce qui venait
-- d'arriver : elles n'avaient pas été publiées, mais les précédentes étaient
-- parties avec.
--
-- Une fonction : l'appel PostgREST est une transaction, les deux instructions
-- réussissent ensemble ou ne changent rien.
--
-- SECURITY INVOKER : la RLS du cabinet continue de s'appliquer à la lettre.
-- Le contrôle explicite au-dessus n'est là que pour rendre un refus lisible
-- plutôt qu'un silence à zéro ligne.

create or replace function public.cabinet_publier_affirmations(p_patient uuid, p_textes text[])
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_cabinet uuid;
  v_posees integer := 0;
begin
  select p.cabinet_id into v_cabinet from public.patients p where p.id = p_patient;
  if v_cabinet is null or not public.is_cabinet_member(v_cabinet) then
    raise exception 'Fiche introuvable, ou hors de votre cabinet.';
  end if;

  delete from public.affirmations where patient_id = p_patient;

  insert into public.affirmations (cabinet_id, patient_id, text, position, source, published_at)
  select v_cabinet, p_patient, x.texte, (row_number() over (order by x.rang)) - 1, 'manuel', now()
    from (
      select btrim(t.texte) as texte, t.rang
        from unnest(coalesce(p_textes, array[]::text[])) with ordinality as t(texte, rang)
    ) x
   where x.texte <> '';
  get diagnostics v_posees = row_count;
  return v_posees;
end;
$$;

revoke execute on function public.cabinet_publier_affirmations(uuid, text[]) from public, anon;
grant execute on function public.cabinet_publier_affirmations(uuid, text[]) to authenticated;

comment on function public.cabinet_publier_affirmations(uuid, text[]) is
  'Remplace les affirmations d''un patient en une transaction. Le DELETE puis l''INSERT du navigateur pouvaient laisser la liste vide en annonçant un échec de publication.';
