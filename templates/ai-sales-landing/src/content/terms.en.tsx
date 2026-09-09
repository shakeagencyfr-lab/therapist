// Conditions générales — version ANGLAISE (corps du document).
// La version française vit dans src/content/terms.fr.tsx.

import {
  LegalSection,
  LegalSub,
  LegalP,
  LegalUl,
  LegalCallout,
} from "../lib/LegalPageShell";
import brand from "../brand.config";

export const TOC_EN = [
  { id: "acceptance", label: "Acceptance of Terms" },
  { id: "service", label: "The Service" },
  { id: "accounts", label: "Accounts & Eligibility" },
  { id: "acceptable-use", label: "Acceptable Use" },
  { id: "billing", label: "Plans, Trial & Payment" },
  { id: "customer-data", label: "Your Data & Ownership" },
  { id: "ip", label: "Intellectual Property" },
  { id: "third-parties", label: "Third-Party Services" },
  { id: "ai", label: "AI Outputs" },
  { id: "warranty", label: "Disclaimer of Warranties" },
  { id: "liability", label: "Limitation of Liability" },
  { id: "indemnity", label: "Indemnification" },
  { id: "termination", label: "Term & Termination" },
  { id: "changes", label: "Changes to These Terms" },
  { id: "governing-law", label: "Governing Law" },
  { id: "general", label: "General" },
  { id: "contact", label: "Contact" },
];

export function TermsIntroEn() {
  return (
    <>
          <div
            role="note"
            className="not-prose rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-900"
          >
            <span className="font-semibold">⚠️ TEMPLATE —</span> this is a
            starting point, not legal advice. Have a qualified lawyer review and
            adapt it for your business before publishing. Replace every value in{" "}
            <span className="font-mono">[square brackets]</span> and confirm
            each clause reflects how {brand.brandName} actually operates.
          </div>
          <p>
            These Terms of Service (the &ldquo;Terms&rdquo;) govern your access
            to and use of {brand.brandName}, an AI sales agent platform operated
            by {brand.legalEntity} (&ldquo;we&rdquo;, &ldquo;us&rdquo;,
            &ldquo;our&rdquo;), available at {brand.domain}.
          </p>
          <p>
            By creating an account, starting a free trial, purchasing a
            subscription, or otherwise using the service, you agree to be bound
            by these Terms. If you do not agree, do not use the service.
          </p>
    </>
  );
}

export function TermsBodyEn() {
  return (
    <>
      <LegalSection id="acceptance" number={1} title="Acceptance of Terms">
        <LegalP>
          These Terms form a binding agreement between you
          (&ldquo;Customer&rdquo;, &ldquo;you&rdquo;, &ldquo;your&rdquo;) and{" "}
          {brand.legalEntity}. If you accept these Terms on behalf of a company
          or other legal entity, you represent that you have authority to bind
          that entity, and &ldquo;Customer&rdquo; refers to that entity.
        </LegalP>
        <LegalP>
          The &ldquo;Effective Date&rdquo; of these Terms is{" "}
          {brand.legalEffectiveDate}, or the date you first accepted them,
          whichever is later.
        </LegalP>
      </LegalSection>

      <LegalSection id="service" number={2} title="The Service">
        <LegalP>
          {brand.brandName} is an AI sales agent that responds to messages,
          answers questions, qualifies leads, books appointments and follows up
          on your behalf across the messaging channels you connect.
        </LegalP>
        <LegalP>
          The service evolves over time. We may add, change or remove features,
          and we may update these Terms accordingly as described in the
          &ldquo;Changes to These Terms&rdquo; section.
        </LegalP>
      </LegalSection>

      <LegalSection id="accounts" number={3} title="Accounts & Eligibility">
        <LegalP>
          The service is intended for business use. By using it you confirm that
          you are at least 18 years old and are using the service in connection
          with a business, profession or trade.
        </LegalP>
        <LegalP>
          You must provide accurate, current and complete information when you
          register and keep it up to date. You are responsible for safeguarding
          your account credentials and for all activity under your account.
          Notify us immediately at {brand.supportEmail} if you believe your
          credentials have been compromised.
        </LegalP>
      </LegalSection>

      <LegalSection id="acceptable-use" number={4} title="Acceptable Use">
        <LegalP>You agree not to use the service to:</LegalP>
        <LegalUl>
          <li>
            Send unsolicited bulk messages or spam, or message recipients who
            have not opted in where opt-in is required
          </li>
          <li>Harass, threaten, defame, abuse or stalk any person</li>
          <li>
            Distribute illegal content, content that infringes third-party
            rights, or content that incites violence or hatred
          </li>
          <li>Distribute malware, phishing links or other malicious code</li>
          <li>
            Violate any law or regulation that applies to your business or your
            message recipients
          </li>
          <li>
            Reverse engineer, decompile or attempt to derive the source code of
            the service, except to the extent permitted by mandatory law
          </li>
          <li>
            Violate the terms of any platform the service connects to, or any
            applicable marketing-communications law (for example anti-spam and
            messaging-consent rules in your jurisdiction)
          </li>
          <li>
            Misrepresent the identity of a message sender, including by
            impersonating us or any third party
          </li>
        </LegalUl>
        <LegalP>
          We may investigate suspected violations and may suspend or terminate
          access for serious or repeated breaches. Where reasonable, we will
          give you notice and an opportunity to cure.
        </LegalP>
      </LegalSection>

      <LegalSection id="billing" number={5} title="Plans, Trial & Payment">
        <LegalP>
          Plans, prices and any free-trial terms are described on our pricing
          page and at sign-up. Prices are exclusive of VAT and equivalent
          indirect taxes unless stated otherwise.
        </LegalP>
        <LegalSub>Trial and renewal</LegalSub>
        <LegalP>
          If a free trial is offered and you do not cancel before it ends, your
          account will convert to the paid plan you selected at sign-up and your
          payment method will be charged on a recurring basis. Subscriptions
          renew automatically at the end of each billing period until cancelled.
          You can cancel at any time from your dashboard; cancellation takes
          effect at the end of the current billing period.
        </LegalP>
        <LegalSub>Payment and refunds</LegalSub>
        <LegalP>
          Payments are handled by our payment processor. Recurring subscriptions
          are billed in advance for each billing period. Refunds are governed by
          applicable consumer-protection law and our published refund policy. If
          a charge fails, we may retry and may suspend the service after a
          reasonable grace period if payment remains outstanding.
        </LegalP>
        <LegalSub>Price changes</LegalSub>
        <LegalP>
          We may change our prices. We will give you reasonable advance notice
          (by email or in-app) before a price change applies to your
          subscription. You may cancel before the change takes effect to avoid
          the new price.
        </LegalP>
      </LegalSection>

      <LegalSection id="customer-data" number={6} title="Your Data & Ownership">
        <LegalP>
          You retain all rights to the content you, your team or your end users
          upload to or generate within the service, including contacts,
          conversation transcripts, knowledge-base content and configuration
          (&ldquo;Customer Data&rdquo;). We process Customer Data solely to
          provide and improve the service in accordance with these Terms and our
          Privacy Policy.
        </LegalP>
        <LegalP>
          You can export your Customer Data while your subscription is active
          and for a reasonable period after termination, after which we will
          delete it from active systems in the normal course. See our Privacy
          Policy for retention details.
        </LegalP>
      </LegalSection>

      <LegalSection id="ip" number={7} title="Intellectual Property">
        <LegalP>
          We retain all rights, title and interest in and to the service,
          including all software, branding and documentation. Subject to your
          compliance with these Terms and payment of applicable fees, we grant
          you a limited, non-exclusive, non-transferable, revocable licence to
          use the service for your business operations during your subscription
          term.
        </LegalP>
        <LegalSub>Feedback</LegalSub>
        <LegalP>
          If you provide feedback or suggestions about the service, you grant us
          a perpetual, worldwide, royalty-free licence to use that feedback to
          improve our products and services.
        </LegalP>
      </LegalSection>

      <LegalSection id="third-parties" number={8} title="Third-Party Services">
        <LegalP>
          To deliver the service we rely on third-party providers for messaging,
          payments, AI processing, hosting and related functions. Your use of
          channels and integrations is also subject to those providers&rsquo;
          own terms and policies. A current list of the sub-processors we use to
          handle personal data is set out in, or available on request via, our
          Privacy Policy.
        </LegalP>
        <LegalSub>Hosting &amp; data location</LegalSub>
        <LegalP>{brand.infrastructure.hostingSummary}</LegalP>
      </LegalSection>

      <LegalSection id="ai" number={9} title="AI Outputs">
        <LegalCallout>
          AI-generated content is not guaranteed to be accurate, complete or
          appropriate. You are responsible for reviewing AI outputs before
          relying on them.
        </LegalCallout>
        <LegalP>
          The AI agent does not provide legal, medical, financial, tax or other
          regulated professional advice, and its outputs should not be relied
          upon as such. For high-value transactions or decisions that materially
          affect a person&rsquo;s rights or significant interests, you should
          keep a human in the loop. You accept the risk of allowing the AI agent
          to handle conversations without human supervision.
        </LegalP>
      </LegalSection>

      <LegalSection id="warranty" number={10} title="Disclaimer of Warranties">
        <LegalP>
          The service is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS
          AVAILABLE&rdquo; basis. To the maximum extent permitted by law, we
          disclaim all warranties of any kind, whether express, implied or
          statutory, including warranties of merchantability, fitness for a
          particular purpose, title and non-infringement. We do not warrant that
          the service will be uninterrupted, error-free or secure.
        </LegalP>
      </LegalSection>

      <LegalSection id="liability" number={11} title="Limitation of Liability">
        <LegalP>
          To the maximum extent permitted by law, our aggregate liability
          arising out of or related to these Terms or the service will not
          exceed the greater of (a) the fees you paid to us in the 12 months
          before the event giving rise to the claim, or (b) [a small fixed
          amount, e.g. USD 100].
        </LegalP>
        <LegalP>
          To the maximum extent permitted by law, we will not be liable for any
          indirect, incidental, consequential, special or punitive damages, or
          for any loss of profits, revenue, goodwill, data or business
          opportunity, even if advised of the possibility of such damages.
        </LegalP>
        <LegalP>
          Nothing in these Terms excludes or limits liability that cannot be
          excluded or limited under applicable law.
        </LegalP>
      </LegalSection>

      <LegalSection id="indemnity" number={12} title="Indemnification">
        <LegalP>
          You will defend, indemnify and hold us harmless from and against any
          claims, damages, liabilities, costs and expenses (including reasonable
          legal fees) arising out of or related to: (a) your use of the service;
          (b) your breach of these Terms, including the acceptable-use rules;
          (c) your end users&rsquo; interactions with the service; (d)
          AI-generated content you approve and send; and (e) any claim that your
          Customer Data infringes the rights of a third party.
        </LegalP>
      </LegalSection>

      <LegalSection id="termination" number={13} title="Term & Termination">
        <LegalP>
          Unless otherwise agreed, subscriptions run for the billing period you
          select and renew automatically. You may cancel at any time from your
          dashboard, with effect at the end of the current billing period.
        </LegalP>
        <LegalP>
          We may suspend or terminate the service for cause if you fail to pay
          amounts due after notice and a grace period, materially breach these
          Terms and fail to cure within a reasonable time, or use the service in
          a way that exposes us to legal or regulatory risk. On termination,
          your right to access the service ends; clauses that by their nature
          should survive (including intellectual property, indemnification,
          limitation of liability and governing law) survive termination.
        </LegalP>
      </LegalSection>

      <LegalSection id="changes" number={14} title="Changes to These Terms">
        <LegalP>
          We may update these Terms from time to time. For material changes we
          will give reasonable advance notice by email or in-app notice before
          the changes take effect. For non-material changes we will post the
          updated Terms on this page with a revised &ldquo;Last updated&rdquo;
          date. Your continued use of the service after an update takes effect
          constitutes acceptance of the updated Terms.
        </LegalP>
      </LegalSection>

      <LegalSection id="governing-law" number={15} title="Governing Law">
        <LegalP>
          These Terms are governed by the laws of {brand.legalJurisdiction},
          excluding its conflict-of-laws rules. The courts located in{" "}
          {brand.legalJurisdiction}
          will have exclusive jurisdiction over any dispute arising out of or
          relating to these Terms, except where mandatory law gives you the
          right to bring proceedings elsewhere. [If you prefer arbitration or
          mediation, replace this clause with your chosen dispute-resolution
          process.]
        </LegalP>
      </LegalSection>

      <LegalSection id="general" number={16} title="General">
        <LegalSub>Entire agreement</LegalSub>
        <LegalP>
          These Terms, together with any documents expressly incorporated by
          reference (such as our Privacy Policy), constitute the entire
          agreement between the parties and supersede all prior agreements on
          the same subject.
        </LegalP>
        <LegalSub>Severability & waiver</LegalSub>
        <LegalP>
          If any provision is held unenforceable, the remaining provisions
          remain in full force. A failure to exercise a right is not a waiver of
          that right.
        </LegalP>
        <LegalSub>Assignment & force majeure</LegalSub>
        <LegalP>
          You may not assign these Terms without our prior written consent; we
          may assign them in connection with a merger, acquisition or sale of
          assets. Neither party is liable for any failure or delay caused by
          events outside its reasonable control.
        </LegalP>
      </LegalSection>

      <LegalSection id="contact" number={17} title="Contact">
        <LegalP>Questions about these Terms? Contact us:</LegalP>
        <LegalUl>
          <li>{brand.legalEntity}</li>
          <li>{brand.legalJurisdiction}</li>
          <li>Email: {brand.supportEmail}</li>
        </LegalUl>
        <LegalP>
          [Add your full registered address, company registration number and any
          tax identifiers required in {brand.legalJurisdiction}.]
        </LegalP>
      </LegalSection>
    </>
  );
}
