/* =============================================================================
 *  /privacy-policy — politique de confidentialité, en français et en anglais
 * =============================================================================
 *  Le corps du document vit dans content/privacy.fr.tsx et privacy.en.tsx ;
 *  cette page ne fait que choisir la version correspondant à la langue active.
 *
 *  ⚠️ Les deux versions sont des MODÈLES. Faites-les relire par un juriste
 *  avant publication — la version française séparément de l'anglaise.
 * ========================================================================== */
import LegalPageShell from "../lib/LegalPageShell";
import brand, { getActiveLang, lhref } from "../brand.config";
import { TOC_FR, PrivacyIntroFr, PrivacyBodyFr } from "../content/privacy.fr";
import { TOC_EN, PrivacyIntroEn, PrivacyBodyEn } from "../content/privacy.en";

const canonicalUrl = () => `${brand.siteUrl}${lhref("/privacy-policy")}`;

export default function PrivacyPolicyPage() {
  const isEn = getActiveLang() === "en";

  const title = isEn ? "Privacy Policy" : "Politique de confidentialité";
  const metaTitle = `${title} · ${brand.brandName}`;
  const metaDescription = isEn
    ? `How ${brand.brandName} collects, uses, shares and protects personal data. Effective ${brand.legalEffectiveDate}.`
    : `Comment ${brand.brandName} collecte, utilise, partage et protège les données à caractère personnel. En vigueur depuis le ${brand.legalEffectiveDate}.`;

  return (
    <LegalPageShell
      title={title}
      lastUpdated={brand.legalEffectiveDate}
      metaTitle={metaTitle}
      metaDescription={metaDescription}
      canonical={canonicalUrl()}
      toc={isEn ? TOC_EN : TOC_FR}
      intro={isEn ? <PrivacyIntroEn /> : <PrivacyIntroFr />}
    >
      {isEn ? <PrivacyBodyEn /> : <PrivacyBodyFr />}
    </LegalPageShell>
  );
}
