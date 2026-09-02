-- ============================================================================
-- 0015 — Le logo d'un cabinet : un compartiment PUBLIC, rangé par cabinet.
--
-- Public, contrairement aux audios, et pour une raison précise : le logo doit
-- s'afficher sur klaroweb.site/c/<identifiant>, page ouverte par quelqu'un qui
-- n'est pas connecté. Une URL signée demanderait une session ; il n'y en a
-- pas. Un logo est d'ailleurs, par nature, ce qu'un cabinet montre à tout le
-- monde — c'est ce qu'il met sur sa devanture.
--
-- Ce qui reste fermé, en revanche : le dépôt. Seul un membre du cabinet écrit
-- dans le dossier de son cabinet, remplace son fichier ou le retire. La forme
-- du chemin est celle des audios — « <cabinet_id>/<fichier> » — et le même
-- cabinet_of_path() la lit.
--
-- Les images seules, et pas toutes : ni SVG ni autre format porteur de script.
-- Un logo est une image, il n'a rien à exécuter.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos', 'logos', true, 1048576,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 1048576,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

create policy "le cabinet dépose son logo"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.is_cabinet_member(public.cabinet_of_path(name)));

create policy "le cabinet remplace son logo"
  on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.is_cabinet_member(public.cabinet_of_path(name)))
  with check (bucket_id = 'logos' and public.is_cabinet_member(public.cabinet_of_path(name)));

create policy "le cabinet retire son logo"
  on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.is_cabinet_member(public.cabinet_of_path(name)));

-- L'adresse du fichier se range dans cabinets.branding, sous la clé « logoUrl ».
-- Rien à ajouter au schéma : branding est déjà du jsonb, et il voyage déjà
-- jusqu'à my_context(), patient_cabinet_settings() et cabinet_vitrine().
