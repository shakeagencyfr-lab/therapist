-- ============================================================================
-- 0026 — Le levier « boutique » atteint enfin l'espace du patient
--
-- 0023 a fait descendre le droit jusqu'aux deux pages publiques — le site
-- vitrine et le domaine personnalisé. Il a oublié la troisième porte, et
-- c'est la seule où quelqu'un paie.
--
-- `patient_cabinet_settings()` ne lisait que l'intention de la thérapeute,
-- `cabinet_settings.shop_enabled`. Le revendeur pouvait fermer le levier :
-- l'onglet « Boutique » restait ouvert dans l'application du patient, les
-- produits s'affichaient, elle choisissait — et l'achat butait au dernier pas,
-- côté serveur, qui lui refusait ce que l'écran venait de lui proposer.
--
-- Deux conditions désormais, dans cet ordre : l'offre l'ouvre, et la
-- thérapeute l'allume. Fermer le levier referme l'onglet ; le rouvrir le
-- rouvre, sans que personne ait à retoucher un réglage.
-- ============================================================================

create or replace function public.patient_cabinet_settings()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'booking_url', s.booking_url,
    'booking_mode', coalesce(s.booking_mode, 'bouton'),
    'booking_widget_url', s.booking_widget_url,
    -- L'offre d'abord, le réglage du cabinet ensuite.
    'shop_enabled', coalesce(ab.shop_override, pl.shop, false) and coalesce(s.shop_enabled, false)
  )
  from public.patients p
  left join public.cabinet_settings s on s.cabinet_id = p.cabinet_id
  left join public.subscriptions ab   on ab.cabinet_id = p.cabinet_id
  left join public.plans pl           on pl.code = ab.plan_code
  where p.auth_user_id = auth.uid() and p.archived_at is null
  limit 1;
$$;

comment on function public.patient_cabinet_settings() is
  'Ce que le patient voit de son cabinet : agenda et boutique, jamais une clé. La boutique demande les deux : que l''offre l''ouvre, et que la thérapeute l''allume.';
