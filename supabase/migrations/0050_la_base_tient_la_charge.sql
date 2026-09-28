-- ============================================================================
-- 0050 — La base tient la charge : auth.uid() une fois par requête, et un
--        index sous chaque clé étrangère
-- ============================================================================
--
-- Rien de visible aujourd'hui, avec un cabinet et trois fiches. Deux défauts
-- que le conseiller de performance de Supabase signale, et qui grandissent
-- avec le produit.
--
--   1. QUATRE POLITIQUES APPELAIENT auth.uid() À CHAQUE LIGNE. Écrit nu dans
--      une politique, `auth.uid()` est réévalué pour chaque ligne examinée ;
--      écrit `(select auth.uid())`, PostgreSQL le calcule une fois (un
--      « initPlan ») et compare ensuite une constante. La règle ne change
--      pas d'un caractère : seule sa façon d'être évaluée change.
--
--      Les politiques sont MODIFIÉES (`alter policy`), pas recréées : nom,
--      commande, rôle et caractère permissif restent ceux de la production.
--      Les expressions reprennent mot pour mot celles de la production
--      (pg_policies, 28 septembre), à l'enveloppe près.
--
--      Deux autres politiques signalées ne sont pas ici, parce que d'autres
--      migrations les remplacent déjà, sans auth.uid() nu :
--        - « la patiente voit la vitrine de son cabinet » (products) : 0047 ;
--        - « le proprietaire regle les offres » (plans) : 0049.
--      Les toucher ici défairait ce que ces migrations viennent d'écrire.
--
--   2. VINGT-HUIT CLÉS ÉTRANGÈRES SANS INDEX. Une clé étrangère n'indexe pas
--      sa colonne. Supprimer un cabinet, un compte, une séance ou un produit
--      oblige alors PostgreSQL à parcourir EN ENTIER chaque table qui s'y
--      réfère — pour la suppression en cascade, ou pour vérifier qu'aucune
--      ligne ne pointe encore vers le parent. C'est la suppression d'un
--      compte (RGPD) qui en souffrirait la première : elle traverse
--      audit_log, push_subscriptions, reseller_members, custom_modules…
--      Chaque index porte la seule colonne de la clé : ce sont ces
--      recherches-là qu'il sert.
--
-- Ce qui n'est PAS fait, et pourquoi :
--   - Les « politiques permissives multiples » (une politique pour le
--     cabinet, une pour le patient, sur la même table) restent séparées. Les
--     fusionner gagnerait peu et mêlerait deux règles que les épreuves
--     d'isolement relisent une à une.
--   - pg_net reste dans le schéma public : l'extension n'est pas
--     relogeable (`extrelocatable = false`), la déplacer demanderait de la
--     supprimer puis de la recréer, ce qui viderait sa file d'envois et les
--     droits que la plateforme y pose. Ses fonctions vivent de toute façon
--     dans le schéma `net`.

-- ============================================================================
-- 1. auth.uid() calculé une fois par requête
-- ============================================================================

alter policy "je vois mes appartenances revendeur" on public.reseller_members
  using ((user_id = (select auth.uid())) or public.is_reseller_member(reseller_id));

alter policy "le patient lit sa fiche" on public.patients
  using ((auth_user_id = (select auth.uid())) and (archived_at is null));

alter policy "la patiente voit ses telephones" on public.push_subscriptions
  using (user_id = (select auth.uid()));

alter policy "la patiente retire ses telephones" on public.push_subscriptions
  using (user_id = (select auth.uid()));

-- ============================================================================
-- 2. Un index sous chaque clé étrangère signalée
-- ============================================================================

-- Le cabinet : sa suppression descend en cascade dans chacune de ces tables.
create index if not exists affirmations_cabinet_idx        on public.affirmations (cabinet_id);
create index if not exists hypnose_mouvements_cabinet_idx  on public.hypnose_mouvements (cabinet_id);
create index if not exists journal_pages_cabinet_idx       on public.journal_pages (cabinet_id);
create index if not exists module_quiz_answers_cabinet_idx on public.module_quiz_answers (cabinet_id);
create index if not exists patient_audios_cabinet_idx      on public.patient_audios (cabinet_id);
create index if not exists patient_settings_cabinet_idx    on public.patient_settings (cabinet_id);
create index if not exists psych_profiles_cabinet_idx      on public.psych_profiles (cabinet_id);
create index if not exists push_notifications_cabinet_idx  on public.push_notifications (cabinet_id);
create index if not exists push_recipients_cabinet_idx     on public.push_recipients (cabinet_id);
create index if not exists push_subscriptions_cabinet_idx  on public.push_subscriptions (cabinet_id);
create index if not exists scale_entries_cabinet_idx       on public.scale_entries (cabinet_id);
create index if not exists therapy_sessions_cabinet_idx    on public.therapy_sessions (cabinet_id);

-- Un compte : sa suppression passe par ces colonnes (cascade ou mise à nul).
create index if not exists audit_log_actor_idx                 on public.audit_log (actor_user_id);
create index if not exists cabinet_invitations_invited_by_idx  on public.cabinet_invitations (invited_by);
create index if not exists custom_modules_created_by_idx       on public.custom_modules (created_by);
create index if not exists push_notifications_created_by_idx   on public.push_notifications (created_by);
create index if not exists push_subscriptions_user_idx         on public.push_subscriptions (user_id);
create index if not exists reseller_invitations_invited_by_idx on public.reseller_invitations (invited_by);
-- La clé primaire (reseller_id, user_id) ne sert pas une recherche par compte :
-- c'est pourtant celle que fait chaque appel à is_reseller_member().
create index if not exists reseller_members_user_idx           on public.reseller_members (user_id);

-- Le reste du dossier : séances, audios, produits, offres.
create index if not exists hypnoses_session_idx              on public.hypnoses (session_id);
create index if not exists psych_profiles_source_session_idx on public.psych_profiles (source_session_id);
create index if not exists patient_audios_audio_idx          on public.patient_audios (audio_id);
create index if not exists products_audio_idx                on public.products (audio_id);
create index if not exists orders_product_idx                on public.orders (product_id);
create index if not exists audio_library_category_idx        on public.audio_library (category_id);
create index if not exists subscriptions_plan_idx            on public.subscriptions (plan_code);
create index if not exists credit_orders_pack_idx            on public.credit_orders (pack_id);
create index if not exists credit_orders_reseller_idx        on public.credit_orders (reseller_id);
