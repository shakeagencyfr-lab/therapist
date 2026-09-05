-- Le lundi matin, sans personne pour cliquer.
--
-- « Génération automatique chaque lundi » était cochable depuis le début et
-- ne déclenchait rien : aucune tâche planifiée n'existait, ni chez l'hébergeur
-- ni en base. La case écrivait bien `patient_settings.affirmations_auto`, et
-- ce réglage n'était lu par personne.
--
-- La tâche vit côté serveur (server/affirmationsHebdo.ts, api/cron/…). Elle a
-- besoin d'écrire la liste d'un patient sans être membre de son cabinet : la
-- fonction de publication de 0033 le lui accorde, à elle seule.
--
-- Ce n'est pas un trou : sous la clé de service, il n'y a pas d'`auth.uid()`,
-- donc `is_cabinet_member` rend faux et la fonction refusait tout. Le serveur
-- qui agit POUR le cabinet est déjà passé par ses propres contrôles — c'est le
-- même raisonnement que `levierDuCabinet` tient pour les droits.

create or replace function public.cabinet_publier_affirmations(p_patient uuid, p_textes text[])
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_cabinet uuid;
  v_posees integer := 0;
begin
  select p.cabinet_id into v_cabinet from public.patients p where p.id = p_patient;
  if v_cabinet is null
     or not (public.is_cabinet_member(v_cabinet) or current_user = 'service_role') then
    raise exception 'Fiche introuvable, ou hors de votre cabinet.';
  end if;

  delete from public.affirmations where patient_id = p_patient;

  /* `source` dit qui a écrit la liste, et c'est la seule chose qui distingue
     les deux appelants : la thérapeute publie « manuel », la tâche du lundi
     publie « auto ». Ajouter un paramètre aurait créé une seconde signature,
     donc une ambiguïté côté PostgREST. */
  insert into public.affirmations (cabinet_id, patient_id, text, position, source, published_at)
  select v_cabinet, p_patient, x.texte, (row_number() over (order by x.rang)) - 1,
         (case when current_user = 'service_role' then 'auto' else 'manuel' end)::public.affirmation_source,
         now()
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
grant execute on function public.cabinet_publier_affirmations(uuid, text[]) to authenticated, service_role;

comment on function public.cabinet_publier_affirmations(uuid, text[]) is
  'Remplace les affirmations d''un patient en une transaction. Ouverte au cabinet et à la tâche du lundi, à personne d''autre.';
