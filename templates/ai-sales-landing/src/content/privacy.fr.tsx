// Politique de confidentialité — version FRANÇAISE (corps du document).
// La version anglaise vit dans src/content/privacy.en.tsx.
//
// ⚠️ Traduction de travail du modèle fourni avec le template. Comme la version
// anglaise, elle doit être relue et adaptée par un juriste avant publication.

import {
  LegalSection,
  LegalSub,
  LegalP,
  LegalUl,
  LegalCallout,
  LegalTable,
} from "../lib/LegalPageShell";
import brand from "../brand.config";

export const TOC_FR = [
  { id: "intro", label: "Introduction et champ d'application" },
  { id: "info-we-collect", label: "Données que nous collectons" },
  { id: "how-we-use", label: "Usage que nous en faisons" },
  { id: "ai", label: "Traitement par l'IA" },
  { id: "legal-bases", label: "Bases légales" },
  { id: "data-sharing", label: "Hébergement, partage et sous-traitants" },
  { id: "transfers", label: "Transferts internationaux" },
  { id: "retention", label: "Durées de conservation" },
  { id: "your-rights", label: "Vos droits" },
  { id: "children", label: "Mineurs" },
  { id: "cookies", label: "Cookies et traceurs" },
  { id: "security", label: "Sécurité" },
  { id: "changes", label: "Modification de la politique" },
  { id: "contact", label: "Contact" },
];

export function PrivacyIntroFr() {
  return (
    <>
      <div
        role="note"
        className="not-prose rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-900"
      >
        <span className="font-semibold">⚠️ MODÈLE —</span> ceci est un point de
        départ, pas un conseil juridique. Faites relire et adapter ce texte par
        un juriste qualifié avant publication. Les informations d&rsquo;hébergement
        et de sous-traitance sont pré-remplies pour la plateforme sur laquelle
        ce produit fonctionne — vérifiez qu&rsquo;elles correspondent à votre
        installation. Remplacez chaque valeur restante entre{" "}
        <span className="font-mono">[crochets]</span> et vérifiez que chaque
        mention correspond à la manière dont {brand.brandName} traite réellement
        les données.
      </div>
      <p>
        La présente politique de confidentialité explique comment{" "}
        {brand.legalEntity} («&nbsp;{brand.brandName}&nbsp;», «&nbsp;nous&nbsp;»)
        collecte, utilise, partage et protège les données à caractère personnel
        lorsque vous utilisez {brand.domain}, notre application et les services
        associés.
      </p>
      <p>
        Les termes définis employés ici ont le sens que leur donnent nos
        conditions générales. Adaptez cette politique aux lois sur la protection
        des données qui vous sont applicables, ainsi qu&rsquo;à celles
        applicables à vos clients (par exemple le RGPD, le California Privacy
        Rights Act et les autres réglementations locales).
      </p>
    </>
  );
}

export function PrivacyBodyFr() {
  return (
    <>
      <LegalSection
        id="intro"
        number={1}
        title="Introduction et champ d'application"
      >
        <LegalP>
          {brand.legalEntity} est responsable des données à caractère personnel
          décrites dans la présente politique. Nous agissons en qualité de
          responsable de traitement pour les données relatives à votre compte, à
          la facturation, à vos demandes d&rsquo;assistance et à nos propres
          opérations. Nous agissons en qualité de sous-traitant pour les données
          à caractère personnel contenues dans les messages, contacts et
          conversations que vous et vos utilisateurs finaux traitez via le
          service.
        </LegalP>
        <LegalP>
          La présente politique s&rsquo;applique à {brand.domain}, à notre
          application et à nos API. Sa date d&rsquo;entrée en vigueur est le{" "}
          {brand.legalEffectiveDate}.
        </LegalP>
      </LegalSection>

      <LegalSection
        id="info-we-collect"
        number={2}
        title="Données que nous collectons"
      >
        <LegalSub>Données que vous nous fournissez directement</LegalSub>
        <LegalUl>
          <li>
            Informations de compte&nbsp;: nom, adresse e-mail, numéro de
            téléphone, raison sociale, fonction et coordonnées de facturation
          </li>
          <li>
            Données de profil&nbsp;: fuseau horaire, préférences de langue et
            paramètres de notification
          </li>
          <li>
            Configuration de l&rsquo;espace de travail&nbsp;: instructions
            données à l&rsquo;agent, contenu de la FAQ et de la base de
            connaissances, et paramètres d&rsquo;intégration
          </li>
          <li>
            Échanges avec nous&nbsp;: tickets d&rsquo;assistance, conversations
            et e-mails, y compris les pièces jointes que vous choisissez de
            partager
          </li>
        </LegalUl>
        <LegalSub>Données professionnelles traitées via le service</LegalSub>
        <LegalUl>
          <li>
            Les contacts que vous importez ou qui arrivent par des messages
            entrants (nom, téléphone, e-mail, identifiants sociaux et champs
            personnalisés)
          </li>
          <li>
            Le contenu des conversations sur les canaux que vous connectez
            (texte, messages vocaux, images, vidéos et documents envoyés par vos
            utilisateurs finaux)
          </li>
          <li>
            Les ressources de connaissance que vous fournissez pour entraîner
            l&rsquo;IA
          </li>
        </LegalUl>
        <LegalSub>Informations de paiement</LegalSub>
        <LegalP>
          Lorsque vous souscrivez une offre payante, les informations de
          paiement sont traitées par notre prestataire de paiement. Nous ne
          stockons pas les numéros de carte complets sur nos serveurs&nbsp;;
          nous pouvons conserver un jeton, les quatre derniers chiffres de votre
          carte, le réseau de la carte et votre adresse de facturation.
        </LegalP>
        <LegalSub>Données collectées automatiquement</LegalSub>
        <LegalUl>
          <li>
            Télémétrie d&rsquo;usage&nbsp;: pages consultées, fonctions
            utilisées et erreurs rencontrées
          </li>
          <li>
            Données d&rsquo;appareil et de connexion&nbsp;: adresse IP,
            navigateur, système d&rsquo;exploitation et URL de provenance
          </li>
          <li>
            Journaux serveur et événements de sécurité, y compris les tentatives
            d&rsquo;authentification
          </li>
        </LegalUl>
      </LegalSection>

      <LegalSection
        id="how-we-use"
        number={3}
        title="Usage que nous en faisons"
      >
        <LegalUl>
          <li>Fournir, exploiter, maintenir et améliorer le service</li>
          <li>
            Traiter les conversations IA et la compréhension des médias (comme
            la transcription et l&rsquo;analyse d&rsquo;images)
          </li>
          <li>
            Acheminer et comptabiliser les messages sur les canaux que vous
            connectez
          </li>
          <li>
            Assurer l&rsquo;assistance client et répondre à vos demandes
          </li>
          <li>
            Traiter la facturation, gérer votre abonnement et détecter la fraude
          </li>
          <li>
            Sécuriser le service et prévenir les abus et les incidents de
            sécurité
          </li>
          <li>
            Envoyer des e-mails de service et, avec votre consentement distinct,
            des e-mails marketing
          </li>
          <li>
            Respecter nos obligations légales et répondre aux demandes des
            autorités
          </li>
        </LegalUl>
        <LegalP>
          Nous ne vendons pas de données à caractère personnel et nous ne les
          partageons pas avec des annonceurs tiers à des fins de publicité
          comportementale inter-contextuelle.
        </LegalP>
      </LegalSection>

      <LegalSection id="ai" number={4} title="Traitement par l'IA">
        <LegalCallout>
          [À confirmer auprès de vos fournisseurs d&rsquo;IA&nbsp;:] nous
          n&rsquo;utilisons pas les Données Client pour entraîner des modèles
          d&rsquo;IA, et nos fournisseurs traitent nos requêtes selon des
          conditions qui leur interdisent d&rsquo;entraîner leurs modèles sur
          les données de nos clients.
        </LegalCallout>
        <LegalP>
          Les conversations IA et certains traitements de médias (transcription,
          compréhension d&rsquo;images ou de vidéos) sont assurés par nos
          fournisseurs d&rsquo;IA. Vous êtes responsable de traitement pour les
          messages de vos utilisateurs finaux traités via le service&nbsp;; nous
          agissons comme votre sous-traitant pour ces données et ne les traitons
          que sur vos instructions documentées.
        </LegalP>
      </LegalSection>

      <LegalSection id="legal-bases" number={5} title="Bases légales">
        <LegalP>
          Lorsque le droit de la protection des données (tel que le RGPD) exige
          une base légale, nous nous fondons sur les suivantes&nbsp;:
        </LegalP>
        <LegalUl>
          <li>
            <strong>Exécution du contrat&nbsp;:</strong> les traitements
            nécessaires à la fourniture du service auquel vous avez souscrit
          </li>
          <li>
            <strong>Intérêts légitimes&nbsp;:</strong> sécurité, prévention de
            la fraude, amélioration du produit et défense de nos droits, avec
            une possibilité d&rsquo;opposition simple lorsque cela
            s&rsquo;applique
          </li>
          <li>
            <strong>Consentement&nbsp;:</strong> e-mails marketing, cookies
            d&rsquo;analyse ou de marketing facultatifs, et tout traitement qui
            requiert un consentement
          </li>
          <li>
            <strong>Obligation légale&nbsp;:</strong> obligations fiscales,
            comptables et réglementaires qui nous incombent
          </li>
        </LegalUl>
        <LegalP>
          Vous pouvez vous opposer à un traitement fondé sur l&rsquo;intérêt
          légitime, ou retirer votre consentement, à tout moment en écrivant à{" "}
          {brand.supportEmail}.
        </LegalP>
      </LegalSection>

      <LegalSection
        id="data-sharing"
        number={6}
        title="Hébergement, partage et sous-traitants"
      >
        <LegalSub>Où vos données sont hébergées</LegalSub>
        <LegalP>{brand.infrastructure.hostingSummary}</LegalP>
        <LegalSub>Sous-traitants</LegalSub>
        <LegalP>
          Nous et la plateforme qui fait fonctionner le service faisons appel
          aux catégories de sous-traitants suivantes pour traiter des données à
          caractère personnel. Nous exigeons de chacun qu&rsquo;il ne les traite
          que dans le cadre de garanties contractuelles appropriées. Les
          prestataires précis peuvent changer&nbsp;; cette liste est à jour au{" "}
          {brand.legalEffectiveDate}.
        </LegalP>
        <LegalTable
          headers={["Sous-traitant", "Finalité", "Localisation principale"]}
          rows={brand.infrastructure.subProcessors.map((s) => [
            s.name,
            s.purpose,
            s.location,
          ])}
        />
        <LegalP>
          Nous ne vendons pas de données à caractère personnel. Nous pouvons les
          partager avec des conseils professionnels soumis à une obligation de
          confidentialité, et dans le cadre d&rsquo;une fusion, d&rsquo;une
          acquisition ou d&rsquo;une cession d&rsquo;actifs, sous réserve de
          garanties appropriées.
        </LegalP>
      </LegalSection>

      <LegalSection
        id="transfers"
        number={7}
        title="Transferts internationaux"
      >
        <LegalP>{brand.infrastructure.transfersNote}</LegalP>
        <LegalP>
          Lorsque des données à caractère personnel sont transférées hors de
          votre région ou de celle de vos utilisateurs finaux, nous nous
          appuyons sur des garanties appropriées telles que les clauses
          contractuelles types applicables, une décision d&rsquo;adéquation ou
          un autre mécanisme de transfert licite.
        </LegalP>
      </LegalSection>

      <LegalSection id="retention" number={8} title="Durées de conservation">
        <LegalUl>
          <li>
            <strong>Données de compte actif&nbsp;:</strong> conservées pendant
            toute la durée de vie de votre compte
          </li>
          <li>
            <strong>Conversations et messages&nbsp;:</strong>{" "}
            {brand.infrastructure.retention.conversations}
          </li>
          <li>
            <strong>Pièces comptables&nbsp;:</strong> conservées pendant la
            durée requise par le droit fiscal en {brand.legalJurisdiction}
          </li>
          <li>
            <strong>Sauvegardes&nbsp;:</strong>{" "}
            {brand.infrastructure.retention.backups}
          </li>
          <li>
            <strong>Journaux serveur et événements de sécurité&nbsp;:</strong>{" "}
            {brand.infrastructure.retention.logs}
          </li>
        </LegalUl>
        <LegalP>
          À la résiliation, vous pouvez exporter vos données pendant une période
          raisonnable, après quoi nous supprimerons les Données Client de nos
          systèmes actifs dans le cours normal de nos opérations.
        </LegalP>
      </LegalSection>

      <LegalSection id="your-rights" number={9} title="Vos droits">
        <LegalP>
          Selon votre lieu de résidence, vous pouvez disposer de tout ou partie
          des droits suivants sur vos données à caractère personnel&nbsp;:
        </LegalP>
        <LegalUl>
          <li>
            Le droit d&rsquo;accéder aux données que nous détenons sur vous
          </li>
          <li>Le droit de rectifier des données inexactes</li>
          <li>
            Le droit à l&rsquo;effacement de vos données, dans les limites
            prévues par la loi
          </li>
          <li>
            Le droit de limiter le traitement ou de vous y opposer
          </li>
          <li>
            Le droit à la portabilité de vos données dans un format structuré et
            lisible par machine
          </li>
          <li>
            Le droit de retirer votre consentement à tout moment, sans effet sur
            les traitements antérieurs
          </li>
          <li>
            Le droit d&rsquo;introduire une réclamation auprès de votre autorité
            de protection des données (en France, la CNIL)
          </li>
        </LegalUl>
        <LegalP>
          Pour exercer ces droits, écrivez-nous à {brand.supportEmail}. Nous
          répondrons dans le délai prévu par la loi applicable et pourrons avoir
          besoin de vérifier votre identité au préalable.
        </LegalP>
      </LegalSection>

      <LegalSection id="children" number={10} title="Mineurs">
        <LegalP>
          Le service est destiné à un usage professionnel et ne s&rsquo;adresse
          pas aux mineurs. Nous ne collectons pas sciemment de données à
          caractère personnel les concernant. Si vous pensez qu&rsquo;un mineur
          nous a transmis des données, écrivez à {brand.supportEmail} et nous
          les supprimerons.
        </LegalP>
      </LegalSection>

      <LegalSection id="cookies" number={11} title="Cookies et traceurs">
        <LegalP>
          Nous utilisons des cookies et technologies similaires aux fins
          suivantes&nbsp;:
        </LegalP>
        <LegalUl>
          <li>
            <strong>Cookies essentiels&nbsp;:</strong> authentification, gestion
            de session et sécurité — nécessaires au fonctionnement du service
          </li>
          <li>
            <strong>Cookies fonctionnels&nbsp;:</strong> mémorisation de vos
            préférences, comme la langue et les réglages d&rsquo;affichage
          </li>
          <li>
            <strong>Cookies de mesure d&rsquo;audience&nbsp;:</strong>{" "}
            comprendre comment le service est utilisé — déposés uniquement avec
            votre consentement lorsque celui-ci est requis
          </li>
          <li>
            <strong>Cookies marketing&nbsp;:</strong> mesurer nos campagnes sur
            le site public — déposés uniquement avec votre consentement lorsque
            celui-ci est requis
          </li>
        </LegalUl>
        <LegalP>
          Vous pouvez modifier vos préférences à tout moment depuis votre
          navigateur ou via les réglages que nous mettons à disposition. [Si
          vous utilisez un bandeau de consentement ou un outil de mesure
          d&rsquo;audience précis, décrivez-le ici.]
        </LegalP>
      </LegalSection>

      <LegalSection id="security" number={12} title="Sécurité">
        <LegalP>
          Nous mettons en œuvre des mesures administratives, techniques et
          organisationnelles pour protéger les données à caractère personnel,
          notamment&nbsp;:
        </LegalP>
        <LegalUl>
          <li>Le chiffrement des données en transit via TLS</li>
          <li>
            Le chiffrement au repos des champs sensibles, tels que les
            identifiants et les jetons d&rsquo;intégration
          </li>
          <li>
            Un contrôle d&rsquo;accès par rôle, selon le principe du moindre
            privilège
          </li>
          <li>La journalisation des actions d&rsquo;administration</li>
          <li>Une procédure documentée de réponse aux incidents</li>
        </LegalUl>
        <LegalP>
          Aucun système ne peut être totalement sûr. Si nous avons connaissance
          d&rsquo;une violation de données susceptible d&rsquo;engendrer un
          risque pour vos droits, nous en informerons l&rsquo;autorité
          compétente et les personnes concernées dans les conditions prévues par
          la loi applicable.
        </LegalP>
      </LegalSection>

      <LegalSection
        id="changes"
        number={13}
        title="Modification de la politique"
      >
        <LegalP>
          Nous pouvons mettre à jour la présente politique de temps à autre.
          Pour les modifications substantielles, nous vous en informerons dans
          un délai raisonnable par e-mail ou par une notification dans
          l&rsquo;application avant leur entrée en vigueur. Pour les
          modifications mineures, nous publierons la politique mise à jour sur
          cette page avec une nouvelle date de «&nbsp;dernière mise à
          jour&nbsp;».
        </LegalP>
      </LegalSection>

      <LegalSection id="contact" number={14} title="Contact">
        <LegalP>
          Pour toute question relative à la confidentialité ou pour exercer vos
          droits, écrivez-nous. Merci d&rsquo;indiquer les éléments nous
          permettant de vérifier votre identité et de traiter votre demande.
        </LegalP>
        <LegalUl>
          <li>{brand.legalEntity}</li>
          <li>{brand.legalJurisdiction}</li>
          <li>E-mail&nbsp;: {brand.supportEmail}</li>
        </LegalUl>
        <LegalP>
          [Ajoutez l&rsquo;adresse complète de votre siège, ainsi que les
          mentions d&rsquo;immatriculation ou de délégué à la protection des
          données requises en {brand.legalJurisdiction}. Si vous traitez les
          données de personnes situées dans d&rsquo;autres régions, ajoutez le
          représentant ou le contact qui y est exigé.]
        </LegalP>
      </LegalSection>
    </>
  );
}
