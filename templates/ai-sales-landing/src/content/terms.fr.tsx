// Conditions générales — version FRANÇAISE (corps du document).
// La version anglaise vit dans src/content/terms.en.tsx.
//
// ⚠️ Traduction de travail du modèle fourni avec le template. Comme la version
// anglaise, elle doit être relue et adaptée par un juriste avant publication :
// une traduction n'a pas la même portée juridique qu'un texte rédigé pour le
// droit applicable.

import {
  LegalSection,
  LegalSub,
  LegalP,
  LegalUl,
  LegalCallout,
} from "../lib/LegalPageShell";
import brand from "../brand.config";

export const TOC_FR = [
  { id: "acceptance", label: "Acceptation des conditions" },
  { id: "service", label: "Le service" },
  { id: "accounts", label: "Comptes et éligibilité" },
  { id: "acceptable-use", label: "Usage acceptable" },
  { id: "billing", label: "Offres, essai et paiement" },
  { id: "customer-data", label: "Vos données et leur propriété" },
  { id: "ip", label: "Propriété intellectuelle" },
  { id: "third-parties", label: "Services tiers" },
  { id: "ai", label: "Productions de l'IA" },
  { id: "warranty", label: "Exclusion de garanties" },
  { id: "liability", label: "Limitation de responsabilité" },
  { id: "indemnity", label: "Garantie d'indemnisation" },
  { id: "termination", label: "Durée et résiliation" },
  { id: "changes", label: "Modification des conditions" },
  { id: "governing-law", label: "Droit applicable" },
  { id: "general", label: "Dispositions générales" },
  { id: "contact", label: "Contact" },
];

export function TermsIntroFr() {
  return (
    <>
      <div
        role="note"
        className="not-prose rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-900"
      >
        <span className="font-semibold">⚠️ MODÈLE —</span> ceci est un point de
        départ, pas un conseil juridique. Faites relire et adapter ce texte par
        un juriste qualifié avant publication. Remplacez chaque valeur entre{" "}
        <span className="font-mono">[crochets]</span> et vérifiez que chaque
        clause correspond au fonctionnement réel de {brand.brandName}.
      </div>
      <p>
        Les présentes conditions générales (les «&nbsp;Conditions&nbsp;»)
        régissent votre accès à {brand.brandName} et votre utilisation de ce
        service, une plateforme d&rsquo;agent commercial IA exploitée par{" "}
        {brand.legalEntity} («&nbsp;nous&nbsp;»), accessible à l&rsquo;adresse{" "}
        {brand.domain}.
      </p>
      <p>
        En créant un compte, en démarrant un essai gratuit, en souscrivant un
        abonnement ou en utilisant le service de quelque manière que ce soit,
        vous acceptez d&rsquo;être lié par les présentes Conditions. Si vous ne
        les acceptez pas, n&rsquo;utilisez pas le service.
      </p>
    </>
  );
}

export function TermsBodyFr() {
  return (
    <>
      <LegalSection id="acceptance" number={1} title="Acceptation des conditions">
        <LegalP>
          Les présentes Conditions forment un contrat contraignant entre vous
          (le «&nbsp;Client&nbsp;») et {brand.legalEntity}. Si vous acceptez ces
          Conditions au nom d&rsquo;une société ou d&rsquo;une autre personne
          morale, vous déclarez avoir le pouvoir de l&rsquo;engager, et le terme
          «&nbsp;Client&nbsp;» désigne alors cette entité.
        </LegalP>
        <LegalP>
          La «&nbsp;date d&rsquo;entrée en vigueur&nbsp;» des présentes
          Conditions est le {brand.legalEffectiveDate}, ou la date à laquelle
          vous les avez acceptées pour la première fois si celle-ci est
          postérieure.
        </LegalP>
      </LegalSection>

      <LegalSection id="service" number={2} title="Le service">
        <LegalP>
          {brand.brandName} est un agent commercial IA qui répond aux messages,
          répond aux questions, qualifie les prospects, prend les rendez-vous et
          effectue les relances pour votre compte, sur les canaux de messagerie
          que vous connectez.
        </LegalP>
        <LegalP>
          Le service évolue dans le temps. Nous pouvons ajouter, modifier ou
          retirer des fonctionnalités, et mettre à jour les présentes Conditions
          en conséquence, selon les modalités décrites à la section
          «&nbsp;Modification des conditions&nbsp;».
        </LegalP>
      </LegalSection>

      <LegalSection id="accounts" number={3} title="Comptes et éligibilité">
        <LegalP>
          Le service est destiné à un usage professionnel. En l&rsquo;utilisant,
          vous confirmez être âgé d&rsquo;au moins 18 ans et l&rsquo;utiliser
          dans le cadre d&rsquo;une activité commerciale, professionnelle ou
          artisanale.
        </LegalP>
        <LegalP>
          Vous devez fournir des informations exactes, à jour et complètes lors
          de votre inscription, et les maintenir à jour. Vous êtes responsable
          de la protection de vos identifiants et de toute activité effectuée
          depuis votre compte. Prévenez-nous immédiatement à{" "}
          {brand.supportEmail} si vous pensez que vos identifiants ont été
          compromis.
        </LegalP>
      </LegalSection>

      <LegalSection id="acceptable-use" number={4} title="Usage acceptable">
        <LegalP>Vous vous engagez à ne pas utiliser le service pour&nbsp;:</LegalP>
        <LegalUl>
          <li>
            Envoyer des messages non sollicités en masse ou des courriers
            indésirables, ou écrire à des destinataires qui n&rsquo;ont pas
            donné leur consentement lorsque celui-ci est requis
          </li>
          <li>
            Harceler, menacer, diffamer, injurier ou traquer quiconque
          </li>
          <li>
            Diffuser des contenus illicites, des contenus portant atteinte aux
            droits de tiers, ou incitant à la violence ou à la haine
          </li>
          <li>
            Diffuser des logiciels malveillants, des liens d&rsquo;hameçonnage
            ou tout autre code malveillant
          </li>
          <li>
            Enfreindre une loi ou une réglementation applicable à votre activité
            ou aux destinataires de vos messages
          </li>
          <li>
            Procéder à de l&rsquo;ingénierie inverse, décompiler ou tenter
            d&rsquo;obtenir le code source du service, sauf dans la mesure
            autorisée par une disposition légale impérative
          </li>
          <li>
            Enfreindre les conditions d&rsquo;une plateforme à laquelle le
            service se connecte, ou toute réglementation applicable à la
            prospection commerciale (par exemple les règles relatives au
            consentement et à la lutte contre les messages non sollicités dans
            votre juridiction)
          </li>
          <li>
            Dissimuler ou usurper l&rsquo;identité de l&rsquo;expéditeur
            d&rsquo;un message, y compris en se faisant passer pour nous ou pour
            un tiers
          </li>
        </LegalUl>
        <LegalP>
          Nous pouvons enquêter sur les manquements présumés et suspendre ou
          résilier l&rsquo;accès en cas de violation grave ou répétée. Lorsque
          cela est raisonnable, nous vous en informerons et vous laisserons la
          possibilité d&rsquo;y remédier.
        </LegalP>
      </LegalSection>

      <LegalSection id="billing" number={5} title="Offres, essai et paiement">
        <LegalP>
          Les offres, les prix et les conditions de l&rsquo;éventuel essai
          gratuit sont décrits sur notre page tarifs et au moment de
          l&rsquo;inscription. Les prix s&rsquo;entendent hors TVA et hors taxes
          indirectes équivalentes, sauf mention contraire.
        </LegalP>
        <LegalSub>Essai et reconduction</LegalSub>
        <LegalP>
          Si un essai gratuit est proposé et que vous ne résiliez pas avant son
          terme, votre compte bascule vers l&rsquo;offre payante choisie à
          l&rsquo;inscription et votre moyen de paiement est débité de manière
          récurrente. Les abonnements se reconduisent automatiquement à la fin
          de chaque période de facturation jusqu&rsquo;à résiliation. Vous
          pouvez résilier à tout moment depuis votre tableau de bord&nbsp;; la
          résiliation prend effet à la fin de la période de facturation en
          cours.
        </LegalP>
        <LegalSub>Paiement et remboursements</LegalSub>
        <LegalP>
          Les paiements sont traités par notre prestataire de paiement. Les
          abonnements récurrents sont facturés d&rsquo;avance pour chaque
          période. Les remboursements sont régis par le droit de la
          consommation applicable et par notre politique de remboursement
          publiée. En cas d&rsquo;échec de prélèvement, nous pouvons effectuer
          de nouvelles tentatives et suspendre le service après un délai de
          grâce raisonnable si le paiement reste impayé.
        </LegalP>
        <LegalSub>Évolution des prix</LegalSub>
        <LegalP>
          Nous pouvons modifier nos prix. Nous vous en informerons dans un délai
          raisonnable (par e-mail ou dans l&rsquo;application) avant qu&rsquo;un
          changement ne s&rsquo;applique à votre abonnement. Vous pouvez
          résilier avant sa prise d&rsquo;effet pour ne pas être soumis au
          nouveau prix.
        </LegalP>
      </LegalSection>

      <LegalSection
        id="customer-data"
        number={6}
        title="Vos données et leur propriété"
      >
        <LegalP>
          Vous conservez l&rsquo;intégralité des droits sur les contenus que
          vous, votre équipe ou vos utilisateurs finaux déposez dans le service
          ou y générez, y compris les contacts, les transcriptions de
          conversations, le contenu de la base de connaissances et la
          configuration (les «&nbsp;Données Client&nbsp;»). Nous traitons les
          Données Client uniquement pour fournir et améliorer le service,
          conformément aux présentes Conditions et à notre politique de
          confidentialité.
        </LegalP>
        <LegalP>
          Vous pouvez exporter vos Données Client pendant toute la durée de
          votre abonnement et pendant une période raisonnable après sa fin,
          après quoi nous les supprimerons de nos systèmes actifs dans le cours
          normal de nos opérations. Les durées de conservation figurent dans
          notre politique de confidentialité.
        </LegalP>
      </LegalSection>

      <LegalSection id="ip" number={7} title="Propriété intellectuelle">
        <LegalP>
          Nous conservons l&rsquo;ensemble des droits, titres et intérêts
          afférents au service, y compris les logiciels, la marque et la
          documentation. Sous réserve du respect des présentes Conditions et du
          paiement des sommes dues, nous vous concédons une licence limitée, non
          exclusive, non transférable et révocable d&rsquo;utilisation du
          service pour les besoins de votre activité, pendant la durée de votre
          abonnement.
        </LegalP>
        <LegalSub>Retours et suggestions</LegalSub>
        <LegalP>
          Si vous nous transmettez des retours ou des suggestions sur le
          service, vous nous concédez une licence perpétuelle, mondiale et
          gratuite d&rsquo;utilisation de ces retours pour améliorer nos
          produits et services.
        </LegalP>
      </LegalSection>

      <LegalSection id="third-parties" number={8} title="Services tiers">
        <LegalP>
          Pour fournir le service, nous faisons appel à des prestataires tiers
          pour la messagerie, les paiements, le traitement par IA,
          l&rsquo;hébergement et les fonctions connexes. Votre utilisation des
          canaux et des intégrations est également soumise aux conditions et
          politiques propres à ces prestataires. La liste à jour des
          sous-traitants qui traitent des données à caractère personnel figure
          dans notre politique de confidentialité, ou est disponible sur demande
          par son intermédiaire.
        </LegalP>
        <LegalSub>Hébergement et localisation des données</LegalSub>
        <LegalP>{brand.infrastructure.hostingSummary}</LegalP>
      </LegalSection>

      <LegalSection id="ai" number={9} title="Productions de l'IA">
        <LegalCallout>
          Les contenus générés par l&rsquo;IA ne sont pas garantis exacts,
          complets ou appropriés. Il vous appartient de les vérifier avant de
          vous y fier.
        </LegalCallout>
        <LegalP>
          L&rsquo;agent IA ne fournit pas de conseil juridique, médical,
          financier, fiscal ni aucun autre conseil professionnel réglementé, et
          ses productions ne doivent pas être considérées comme tels. Pour les
          transactions à fort enjeu ou les décisions affectant sensiblement les
          droits ou les intérêts d&rsquo;une personne, vous devez maintenir une
          intervention humaine. Vous acceptez le risque lié au fait de laisser
          l&rsquo;agent IA traiter des conversations sans supervision humaine.
        </LegalP>
      </LegalSection>

      <LegalSection id="warranty" number={10} title="Exclusion de garanties">
        <LegalP>
          Le service est fourni «&nbsp;en l&rsquo;état&nbsp;» et «&nbsp;selon
          disponibilité&nbsp;». Dans toute la mesure permise par la loi, nous
          excluons toute garantie de quelque nature que ce soit, expresse,
          implicite ou légale, y compris les garanties de qualité marchande,
          d&rsquo;adéquation à un usage particulier, de titre et de
          non-contrefaçon. Nous ne garantissons pas que le service sera
          ininterrompu, exempt d&rsquo;erreurs ou sécurisé.
        </LegalP>
      </LegalSection>

      <LegalSection id="liability" number={11} title="Limitation de responsabilité">
        <LegalP>
          Dans toute la mesure permise par la loi, notre responsabilité globale
          au titre des présentes Conditions ou du service n&rsquo;excédera pas
          le plus élevé des deux montants suivants&nbsp;: (a) les sommes que
          vous nous avez versées au cours des 12 mois précédant le fait
          générateur, ou (b) [un montant forfaitaire faible, par exemple
          100&nbsp;€].
        </LegalP>
        <LegalP>
          Dans toute la mesure permise par la loi, nous ne serons pas
          responsables des dommages indirects, accessoires, consécutifs,
          spéciaux ou punitifs, ni d&rsquo;une perte de bénéfices, de chiffre
          d&rsquo;affaires, de clientèle, de données ou d&rsquo;opportunité
          commerciale, même si nous avons été informés de l&rsquo;éventualité de
          tels dommages.
        </LegalP>
        <LegalP>
          Aucune stipulation des présentes Conditions n&rsquo;exclut ni ne
          limite une responsabilité qui ne peut être exclue ou limitée en vertu
          du droit applicable.
        </LegalP>
      </LegalSection>

      <LegalSection id="indemnity" number={12} title="Garantie d'indemnisation">
        <LegalP>
          Vous nous défendrez, nous indemniserez et nous garantirez contre toute
          réclamation, dommage, responsabilité, coût et dépense (y compris les
          frais de justice raisonnables) découlant de&nbsp;: (a) votre
          utilisation du service&nbsp;; (b) votre manquement aux présentes
          Conditions, y compris aux règles d&rsquo;usage acceptable&nbsp;; (c)
          les interactions de vos utilisateurs finaux avec le service&nbsp;; (d)
          les contenus générés par l&rsquo;IA que vous validez et envoyez&nbsp;;
          et (e) toute réclamation selon laquelle vos Données Client portent
          atteinte aux droits d&rsquo;un tiers.
        </LegalP>
      </LegalSection>

      <LegalSection id="termination" number={13} title="Durée et résiliation">
        <LegalP>
          Sauf accord contraire, les abonnements courent pour la période de
          facturation que vous choisissez et se reconduisent automatiquement.
          Vous pouvez résilier à tout moment depuis votre tableau de bord, avec
          effet à la fin de la période de facturation en cours.
        </LegalP>
        <LegalP>
          Nous pouvons suspendre ou résilier le service pour motif légitime si
          vous ne réglez pas les sommes dues après mise en demeure et délai de
          grâce, si vous manquez gravement aux présentes Conditions sans y
          remédier dans un délai raisonnable, ou si vous utilisez le service
          d&rsquo;une manière qui nous expose à un risque juridique ou
          réglementaire. À la résiliation, votre droit d&rsquo;accès au service
          prend fin&nbsp;; les clauses qui par nature doivent survivre (dont la
          propriété intellectuelle, la garantie d&rsquo;indemnisation, la
          limitation de responsabilité et le droit applicable) demeurent en
          vigueur.
        </LegalP>
      </LegalSection>

      <LegalSection id="changes" number={14} title="Modification des conditions">
        <LegalP>
          Nous pouvons mettre à jour les présentes Conditions de temps à autre.
          Pour les modifications substantielles, nous vous en informerons dans
          un délai raisonnable par e-mail ou par une notification dans
          l&rsquo;application avant leur entrée en vigueur. Pour les
          modifications mineures, nous publierons les Conditions mises à jour
          sur cette page avec une nouvelle date de «&nbsp;dernière mise à
          jour&nbsp;». La poursuite de votre utilisation du service après
          l&rsquo;entrée en vigueur d&rsquo;une mise à jour vaut acceptation des
          Conditions modifiées.
        </LegalP>
      </LegalSection>

      <LegalSection id="governing-law" number={15} title="Droit applicable">
        <LegalP>
          Les présentes Conditions sont régies par le droit de{" "}
          {brand.legalJurisdiction}, à l&rsquo;exclusion de ses règles de
          conflit de lois. Les tribunaux situés en {brand.legalJurisdiction}{" "}
          seront seuls compétents pour connaître de tout litige né des présentes
          Conditions ou s&rsquo;y rapportant, sauf lorsque une disposition
          impérative vous donne le droit d&rsquo;agir devant une autre
          juridiction. [Si vous préférez l&rsquo;arbitrage ou la médiation,
          remplacez cette clause par le mode de règlement des litiges que vous
          avez retenu.]
        </LegalP>
      </LegalSection>

      <LegalSection id="general" number={16} title="Dispositions générales">
        <LegalSub>Intégralité de l&rsquo;accord</LegalSub>
        <LegalP>
          Les présentes Conditions, ainsi que les documents expressément
          incorporés par référence (tels que notre politique de
          confidentialité), constituent l&rsquo;intégralité de l&rsquo;accord
          entre les parties et remplacent tout accord antérieur portant sur le
          même objet.
        </LegalP>
        <LegalSub>Divisibilité et renonciation</LegalSub>
        <LegalP>
          Si une stipulation est jugée inapplicable, les autres demeurent
          pleinement en vigueur. Le fait de ne pas exercer un droit ne vaut pas
          renonciation à ce droit.
        </LegalP>
        <LegalSub>Cession et force majeure</LegalSub>
        <LegalP>
          Vous ne pouvez céder les présentes Conditions sans notre accord
          écrit préalable&nbsp;; nous pouvons les céder dans le cadre
          d&rsquo;une fusion, d&rsquo;une acquisition ou d&rsquo;une cession
          d&rsquo;actifs. Aucune des parties n&rsquo;est responsable d&rsquo;un
          manquement ou d&rsquo;un retard causé par des événements échappant à
          son contrôle raisonnable.
        </LegalP>
      </LegalSection>

      <LegalSection id="contact" number={17} title="Contact">
        <LegalP>
          Une question sur les présentes Conditions&nbsp;? Écrivez-nous&nbsp;:
        </LegalP>
        <LegalUl>
          <li>{brand.legalEntity}</li>
          <li>{brand.legalJurisdiction}</li>
          <li>E-mail&nbsp;: {brand.supportEmail}</li>
        </LegalUl>
        <LegalP>
          [Ajoutez votre adresse complète du siège, votre numéro
          d&rsquo;immatriculation et les identifiants fiscaux requis en{" "}
          {brand.legalJurisdiction}.]
        </LegalP>
      </LegalSection>
    </>
  );
}
