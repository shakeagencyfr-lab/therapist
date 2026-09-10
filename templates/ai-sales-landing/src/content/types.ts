/* Les deux formes de contenu du site.
 *
 *  SiteContent    — ce qui ne dépend pas de l'offre : navigation, pied de
 *                   page, mentions légales, infrastructure. Une version par
 *                   langue (site.fr.ts, site.en.ts).
 *  ProductContent — ce qui appartient à une offre : accroche, sections,
 *                   tarifs, FAQ. Une version par offre ET par langue
 *                   (ia.fr.ts, rdv.fr.ts, web.fr.ts, et leurs jumelles .en).
 *
 *  Les deux sont des sous-ensembles de BrandConfig : le reste (identité,
 *  URL, assets) est commun à tout et vit dans brand.config.ts.
 */
import type { BrandConfig } from "../brand.config";

export type SiteContent = Pick<
  BrandConfig,
  | "logoAlt"
  | "legalJurisdiction"
  | "legalEffectiveDate"
  | "infrastructure"
  | "nav"
  | "footer"
>;

export type ProductContent = Pick<
  BrandConfig,
  | "tagline"
  | "channels"
  | "hero"
  | "comparison"
  | "howItWorks"
  | "features"
  | "problem"
  | "conversation"
  | "guarantee"
  | "trust"
  | "useCases"
  | "integrations"
  | "testimonials"
  | "pricing"
  | "faq"
  | "finalCta"
>;
