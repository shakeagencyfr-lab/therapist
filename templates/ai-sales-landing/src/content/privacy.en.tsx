// Politique de confidentialité — version ANGLAISE (corps du document).
// La version française vit dans src/content/privacy.fr.tsx.

import {
  LegalSection,
  LegalSub,
  LegalP,
  LegalUl,
  LegalCallout,
  LegalTable,
} from "../lib/LegalPageShell";
import brand from "../brand.config";

export const TOC_EN = [
  { id: "intro", label: "Introduction & Scope" },
  { id: "info-we-collect", label: "Information We Collect" },
  { id: "how-we-use", label: "How We Use Information" },
  { id: "ai", label: "AI Processing" },
  { id: "legal-bases", label: "Legal Bases" },
  { id: "data-sharing", label: "Hosting, Data Sharing & Processors" },
  { id: "transfers", label: "International Transfers" },
  { id: "retention", label: "Data Retention" },
  { id: "your-rights", label: "Your Rights" },
  { id: "children", label: "Children" },
  { id: "cookies", label: "Cookies & Tracking" },
  { id: "security", label: "Security" },
  { id: "changes", label: "Changes to This Policy" },
  { id: "contact", label: "Contact" },
];

export function PrivacyIntroEn() {
  return (
    <>
          <div
            role="note"
            className="not-prose rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-900"
          >
            <span className="font-semibold">⚠️ TEMPLATE —</span> this is a
            starting point, not legal advice. Have a qualified lawyer review and
            adapt it for your business before publishing. The hosting and
            sub-processor details are pre-filled for the platform this product
            runs on — confirm they match your setup. Replace every remaining
            value in <span className="font-mono">[square brackets]</span> and
            confirm each disclosure matches how {brand.brandName} actually
            handles data.
          </div>
          <p>
            This Privacy Policy explains how {brand.legalEntity} (&ldquo;
            {brand.brandName}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;)
            collects, uses, shares and protects personal data when you use{" "}
            {brand.domain}, our app and any related services.
          </p>
          <p>
            Defined terms used here have the meanings given in our Terms of
            Service. Adapt this policy to the privacy laws that apply to you and
            your customers (for example the EU/UK GDPR, the California Privacy
            Rights Act, and other local data-protection laws).
          </p>
    </>
  );
}

export function PrivacyBodyEn() {
  return (
    <>
      <LegalSection id="intro" number={1} title="Introduction & Scope">
        <LegalP>
          {brand.legalEntity} is responsible for the personal data described in
          this policy. We act as the data controller for personal data relating
          to your account, billing, support requests and our own operations. We
          act as a data processor for the personal data contained in the
          messages, contacts and conversations that you and your end users
          process through the service.
        </LegalP>
        <LegalP>
          This policy applies to {brand.domain}, our application and our APIs.
          The Effective Date of this policy is {brand.legalEffectiveDate}.
        </LegalP>
      </LegalSection>

      <LegalSection
        id="info-we-collect"
        number={2}
        title="Information We Collect"
      >
        <LegalSub>Information you give us directly</LegalSub>
        <LegalUl>
          <li>
            Account information: name, email address, phone number, company
            name, role and billing details
          </li>
          <li>
            Profile data: time zone, language preferences and notification
            settings
          </li>
          <li>
            Workspace configuration: bot instructions, FAQ and knowledge-base
            content, and integration settings
          </li>
          <li>
            Communications with us: support tickets, chats and emails, including
            attachments you choose to share
          </li>
        </LegalUl>
        <LegalSub>Business data you process through the service</LegalSub>
        <LegalUl>
          <li>
            Contacts you import or that arrive through inbound messages (name,
            phone, email, social identifiers and custom fields)
          </li>
          <li>
            Conversation content across the channels you connect (text, voice
            notes, images, video and documents your end users send)
          </li>
          <li>Knowledge resources you provide to train the AI</li>
        </LegalUl>
        <LegalSub>Payment information</LegalSub>
        <LegalP>
          When you subscribe to a paid plan, payment information is handled by
          our payment processor. We do not store full card numbers on our
          servers; we may store a token, the last four digits of your card, the
          card brand and your billing address.
        </LegalP>
        <LegalSub>Information we collect automatically</LegalSub>
        <LegalUl>
          <li>
            Usage telemetry: pages visited, features used and errors encountered
          </li>
          <li>
            Device and connection data: IP address, browser, operating system
            and referrer URL
          </li>
          <li>
            Server logs and security events, including authentication attempts
          </li>
        </LegalUl>
      </LegalSection>

      <LegalSection id="how-we-use" number={3} title="How We Use Information">
        <LegalUl>
          <li>To provide, operate, maintain and improve the service</li>
          <li>
            To process AI conversations and media understanding (such as
            transcription and image analysis)
          </li>
          <li>To deliver and meter messages across the channels you connect</li>
          <li>To provide customer support and respond to your requests</li>
          <li>To process billing, manage your subscription and detect fraud</li>
          <li>
            To secure the service and prevent abuse and security incidents
          </li>
          <li>
            To send service emails and, with your separate consent, marketing
            emails
          </li>
          <li>
            To comply with legal obligations and respond to lawful requests
          </li>
        </LegalUl>
        <LegalP>
          We do not sell personal data and we do not share personal data with
          third-party advertisers for cross-context behavioural advertising.
        </LegalP>
      </LegalSection>

      <LegalSection id="ai" number={4} title="AI Processing">
        <LegalCallout>
          [Confirm with your AI providers:] we do not use Customer Data to train
          AI models, and our AI providers process our requests under terms that
          prohibit training on our customers&rsquo; data.
        </LegalCallout>
        <LegalP>
          AI conversations and certain media-processing tasks (such as
          transcription and image or video understanding) are handled by our AI
          providers. You are the data controller for the end-user messages you
          process through the service; we act as your processor for that data
          and process it only on your documented instructions.
        </LegalP>
      </LegalSection>

      <LegalSection id="legal-bases" number={5} title="Legal Bases">
        <LegalP>
          Where data-protection law (such as the EU/UK GDPR) requires a legal
          basis, we rely on the following:
        </LegalP>
        <LegalUl>
          <li>
            <strong>Contract performance:</strong> processing necessary to
            provide the service you signed up for
          </li>
          <li>
            <strong>Legitimate interests:</strong> security, fraud prevention,
            product improvement and defending legal claims, with an easy opt-out
            where applicable
          </li>
          <li>
            <strong>Consent:</strong> marketing emails, optional analytics or
            marketing cookies, and any processing that requires consent
          </li>
          <li>
            <strong>Legal obligation:</strong> tax, accounting and other
            regulatory requirements that apply to us
          </li>
        </LegalUl>
        <LegalP>
          You can object to processing based on legitimate interests, or
          withdraw consent, at any time by contacting {brand.supportEmail}.
        </LegalP>
      </LegalSection>

      <LegalSection
        id="data-sharing"
        number={6}
        title="Hosting, Data Sharing & Processors"
      >
        <LegalSub>Where your data is hosted</LegalSub>
        <LegalP>{brand.infrastructure.hostingSummary}</LegalP>
        <LegalSub>Sub-processors</LegalSub>
        <LegalP>
          We and the underlying platform that powers the service rely on the
          following categories of sub-processor to handle personal data. We
          require each of them to process personal data only under appropriate
          data-protection terms. The specific providers may change over time;
          this list is current as of {brand.legalEffectiveDate}.
        </LegalP>
        <LegalTable
          headers={["Sub-processor", "Purpose", "Primary Location"]}
          rows={brand.infrastructure.subProcessors.map((s) => [
            s.name,
            s.purpose,
            s.location,
          ])}
        />
        <LegalP>
          We do not sell personal data. We may share data with professional
          advisors under confidentiality obligations, and in connection with a
          merger, acquisition or sale of assets subject to appropriate
          protections.
        </LegalP>
      </LegalSection>

      <LegalSection id="transfers" number={7} title="International Transfers">
        <LegalP>{brand.infrastructure.transfersNote}</LegalP>
        <LegalP>
          Where personal data is transferred outside your or your end
          users&rsquo; region, we rely on appropriate safeguards such as the
          relevant standard contractual clauses, an applicable adequacy
          decision, or another lawful transfer mechanism.
        </LegalP>
      </LegalSection>

      <LegalSection id="retention" number={8} title="Data Retention">
        <LegalUl>
          <li>
            <strong>Active account data:</strong> retained for the life of your
            account
          </li>
          <li>
            <strong>Conversation and message data:</strong>{" "}
            {brand.infrastructure.retention.conversations}
          </li>
          <li>
            <strong>Financial records:</strong> retained for the period required
            by tax law in {brand.legalJurisdiction}
          </li>
          <li>
            <strong>Backups:</strong> {brand.infrastructure.retention.backups}
          </li>
          <li>
            <strong>Server logs and security events:</strong>{" "}
            {brand.infrastructure.retention.logs}
          </li>
        </LegalUl>
        <LegalP>
          When you cancel, you can export your data for a reasonable period,
          after which we will delete Customer Data from active systems in the
          normal course.
        </LegalP>
      </LegalSection>

      <LegalSection id="your-rights" number={9} title="Your Rights">
        <LegalP>
          Depending on where you live, you may have some or all of the following
          rights over your personal data:
        </LegalP>
        <LegalUl>
          <li>The right to access the personal data we hold about you</li>
          <li>The right to correct inaccurate personal data</li>
          <li>
            The right to delete your personal data, subject to legal limits
          </li>
          <li>The right to restrict or object to processing</li>
          <li>
            The right to data portability in a structured, machine-readable
            format
          </li>
          <li>
            The right to withdraw consent at any time, without affecting prior
            processing
          </li>
          <li>
            The right to lodge a complaint with your local data-protection
            authority
          </li>
        </LegalUl>
        <LegalP>
          To exercise these rights, contact us at {brand.supportEmail}. We will
          respond within the timeframe required by applicable law and may need
          to verify your identity first.
        </LegalP>
      </LegalSection>

      <LegalSection id="children" number={10} title="Children">
        <LegalP>
          The service is intended for business use and is not directed to
          children. We do not knowingly collect personal data from children. If
          you believe a child has provided personal data to us, contact{" "}
          {brand.supportEmail} and we will delete it.
        </LegalP>
      </LegalSection>

      <LegalSection id="cookies" number={11} title="Cookies & Tracking">
        <LegalP>
          We use cookies and similar technologies for the following purposes:
        </LegalP>
        <LegalUl>
          <li>
            <strong>Essential cookies:</strong> authentication, session
            management and security — required for the service to function
          </li>
          <li>
            <strong>Functional cookies:</strong> remembering your preferences
            such as language and UI settings
          </li>
          <li>
            <strong>Analytics cookies:</strong> understanding how the service is
            used — set only with your consent where required
          </li>
          <li>
            <strong>Marketing cookies:</strong> measuring marketing campaigns on
            our public website — set only with your consent where required
          </li>
        </LegalUl>
        <LegalP>
          You can change your cookie preferences at any time through your
          browser or any cookie controls we provide. [If you use a consent
          banner or specific analytics provider, describe it here.]
        </LegalP>
      </LegalSection>

      <LegalSection id="security" number={12} title="Security">
        <LegalP>
          We use administrative, technical and organisational measures to
          protect personal data, including:
        </LegalP>
        <LegalUl>
          <li>Encryption of data in transit using TLS</li>
          <li>
            Encryption at rest for sensitive fields such as credentials and
            integration tokens
          </li>
          <li>Role-based access control with least-privilege principles</li>
          <li>Logging of administrative actions</li>
          <li>A documented incident-response process</li>
        </LegalUl>
        <LegalP>
          No system can be completely secure. If we become aware of a personal
          data breach that is likely to result in a risk to your rights, we will
          notify the relevant authority and affected users as required by
          applicable law.
        </LegalP>
      </LegalSection>

      <LegalSection id="changes" number={13} title="Changes to This Policy">
        <LegalP>
          We may update this policy from time to time. For material changes we
          will give reasonable advance notice by email or in-app notice before
          the changes take effect. For non-material changes we will post the
          updated policy here with a revised &ldquo;Last updated&rdquo; date.
        </LegalP>
      </LegalSection>

      <LegalSection id="contact" number={14} title="Contact">
        <LegalP>
          For privacy questions or to exercise your rights, contact us. Please
          include enough information for us to verify your identity and act on
          your request.
        </LegalP>
        <LegalUl>
          <li>{brand.legalEntity}</li>
          <li>{brand.legalJurisdiction}</li>
          <li>Email: {brand.supportEmail}</li>
        </LegalUl>
        <LegalP>
          [Add your full registered address and any company-registration or
          data-protection-officer details required in {brand.legalJurisdiction}.
          If you process the personal data of individuals in other regions, add
          any representative or contact required there.]
        </LegalP>
      </LegalSection>
    </>
  );
}
