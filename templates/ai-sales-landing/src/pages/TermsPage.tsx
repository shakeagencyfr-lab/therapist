/* =============================================================================
 *  /terms — conditions générales, en français et en anglais
 * =============================================================================
 *  Le corps du document vit dans content/terms.fr.tsx et content/terms.en.tsx ;
 *  cette page ne fait que choisir la version correspondant à la langue active.
 *
 *  ⚠️ Les deux versions sont des MODÈLES. Faites-les relire par un juriste
 *  avant publication — et faites relire la version française séparément : une
 *  traduction n'a pas la même portée juridique qu'un texte rédigé pour le
 *  droit applicable.
 * ========================================================================== */
import LegalPageShell from "../lib/LegalPageShell";
import brand, { getActiveLang, lhref } from "../brand.config";
import { TOC_FR, TermsIntroFr, TermsBodyFr } from "../content/terms.fr";
import { TOC_EN, TermsIntroEn, TermsBodyEn } from "../content/terms.en";

const canonicalUrl = () => `${brand.siteUrl}${lhref("/terms")}`;

export default function TermsPage() {
  const isEn = getActiveLang() === "en";

  const title = isEn ? "Terms of Service" : "Conditions générales";
  const metaTitle = `${title} · ${brand.brandName}`;
  const metaDescription = isEn
    ? `The Terms of Service that govern your use of ${brand.brandName}. Effective ${brand.legalEffectiveDate}.`
    : `Les conditions générales qui régissent votre utilisation de ${brand.brandName}. En vigueur depuis le ${brand.legalEffectiveDate}.`;

  return (
    <LegalPageShell
      title={title}
      lastUpdated={brand.legalEffectiveDate}
      metaTitle={metaTitle}
      metaDescription={metaDescription}
      canonical={canonicalUrl()}
      toc={isEn ? TOC_EN : TOC_FR}
      intro={isEn ? <TermsIntroEn /> : <TermsIntroFr />}
    >
      {isEn ? <TermsBodyEn /> : <TermsBodyFr />}
    </LegalPageShell>
  );
}
