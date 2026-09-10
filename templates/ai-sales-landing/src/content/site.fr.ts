/* Contenu commun à tout le site — version FRANÇAISE.
 * Ce qui ne dépend pas de l'offre : navigation, pied de page, mentions
 * légales, infrastructure. La version anglaise est dans site.en.ts. */
import type { SiteContent } from "./types";

export const siteFr: SiteContent = {
  logoAlt: "YourBrand",
  legalJurisdiction: "[votre pays]",
  legalEffectiveDate: "1er janvier 2026",
  infrastructure: {
    hostingRegion: "l'Union européenne",
    hostingSummary:
      "Le service et vos données sont hébergés sur des serveurs dédiés sécurisés et une infrastructure cloud situés dans l'Union européenne (Allemagne, et la région européenne de notre fournisseur cloud). Les données sont chiffrées en transit via TLS, et les identifiants sensibles ainsi que les jetons d'intégration sont chiffrés au repos.",
    subProcessors: [
      {
        name: "Fournisseurs d'IA (par ex. Anthropic, OpenAI, Google)",
        purpose:
          "Génération des réponses IA et compréhension des images, messages vocaux et vidéos",
        location: "UE / États-Unis",
      },
      {
        name: "Fournisseurs de messagerie (par ex. Twilio, Meta Platforms)",
        purpose:
          "Envoi et réception des messages sur les canaux que vous connectez (WhatsApp, SMS, Instagram, Messenger)",
        location: "UE / États-Unis",
      },
      {
        name: "Hébergement cloud et serveurs (par ex. Hetzner, Google Cloud — régions UE)",
        purpose:
          "Hébergement de l'application, bases de données et sauvegardes chiffrées",
        location: "Union européenne",
      },
      {
        name: "Prestataire de paiement (par ex. Stripe)",
        purpose: "Facturation des abonnements et prévention de la fraude",
        location: "UE / États-Unis",
      },
      {
        name: "Outils d'e-mail et d'analyse",
        purpose:
          "E-mails transactionnels et marketing, et analyse de l'usage du produit",
        location: "UE / États-Unis",
      },
    ],
    transfersNote:
      "Notre infrastructure est principalement située dans l'Union européenne. Lorsqu'un sous-traitant (fournisseur d'IA, de messagerie ou de paiement) traite des données hors de l'UE, nous nous appuyons sur les clauses contractuelles types de la Commission européenne ou sur un autre mécanisme de transfert licite.",
    retention: {
      conversations:
        "Les contacts et le contenu des conversations sont conservés pendant toute la durée de vie de votre compte et supprimés des systèmes actifs dans les 90 jours suivant sa clôture, sauf si une durée plus longue est requise par la loi.",
      backups:
        "Les sauvegardes chiffrées sont conservées de manière glissante pendant 30 jours maximum.",
      logs: "Les journaux serveur et les événements de sécurité sont conservés pendant 90 jours maximum.",
    },
  },

  /* ---- Assets (chemins sous /public, communs aux deux langues) ---- */
  nav: {
    links: [
      { href: "/#features", label: "Fonctionnalités" },
      { href: "/#how-it-works", label: "Comment ça marche" },
      { href: "/#pricing", label: "Tarifs" },
      { href: "/#faq", label: "FAQ" },
      // Votre manuel (rebrander, changer de thème, déployer). Retirez cette
      // ligne avant la mise en ligne pour ne plus l'afficher dans le menu.
      { href: "/guide/", label: "Guide" },
    ],
    // Menu « Design » avec aperçu de chaque look. À passer à false pour le lancement.
    themePicker: true,
    ctaLabel: "Essai gratuit",
    ctaHref: "/pricing/",
    loginLabel: "Connexion",
    loginHref: "https://app.yourbrand.com",
  },
  footer: {
    tagline:
      "L'agent commercial IA qui prend les rendez-vous et conclut les ventes sur WhatsApp, Instagram, Messenger, le chat de votre site et par SMS.",
    columns: [
      {
        title: "Offres",
        links: [
          { href: "/", label: "Booster IA Pro" },
          { href: "/rdv-pro/", label: "Booster RDV Pro" },
          { href: "/web-pro/", label: "Web Pro" },
        ],
      },
      {
        title: "Produit",
        links: [
          { href: "/#features", label: "Fonctionnalités" },
          { href: "/#how-it-works", label: "Comment ça marche" },
          { href: "/#pricing", label: "Tarifs" },
          { href: "/#faq", label: "FAQ" },
        ],
      },
      {
        title: "Société",
        links: [{ href: "/contact/", label: "Contact" }],
      },
      {
        title: "Légal",
        links: [
          { href: "/terms/", label: "Conditions générales" },
          { href: "/privacy-policy/", label: "Politique de confidentialité" },
        ],
      },
    ],
    social: [
      { label: "Twitter", href: "#" },
      { label: "Instagram", href: "#" },
      { label: "LinkedIn", href: "#" },
    ],
    copyright: "© 2026 YourBrand. Tous droits réservés.",
  },
};

export default siteFr;
