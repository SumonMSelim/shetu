import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service - Shetu",
  description: "The terms for using Shetu.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="4 November 2026">
      <p>
        These terms govern your use of Shetu (&ldquo;the service&rdquo;). By signing in and using the
        service, you agree to them. Please read them, they are short and written plainly.
      </p>

      <h2>What Shetu is</h2>
      <p>
        Shetu is a conversational advisor that helps students plan higher education abroad. It
        provides reliable, source-cited information about programmes, scholarships, costs, visas,
        documents, and test preparation, and it can warn you about common agency tricks. It can also
        arrange a request for a human mentor.
      </p>

      <h2>Not professional advice</h2>
      <p>
        Shetu provides general guidance for your information only. It is <strong>not</strong> legal,
        immigration, financial, or professional advice, and it is not a substitute for the official
        university admissions and immigration sources. Figures and rules change; always verify
        important details with the official source before you act or pay anything. You are
        responsible for decisions you make.
      </p>

      <h2>Eligibility</h2>
      <p>You must be at least 18 years old to use the service.</p>

      <h2>Your account</h2>
      <p>
        You sign in with Google. You are responsible for activity under your account. Do not share
        your access with others or impersonate anyone.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not upload content you do not have the right to share.</li>
        <li>Do not upload unlawful, harmful, or others&rsquo; private documents without permission.</li>
        <li>Do not attempt to misuse, disrupt, or reverse-engineer the service or its infrastructure.</li>
        <li>Do not use the service to deceive or defraud others.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You keep ownership of the documents and information you provide. You grant us permission to
        store and process that content only to provide the service to you (including AI processing to
        generate responses, and review of a document when you request it). We do not sell your
        content. See the <a href="/privacy">Privacy Policy</a> for details.
      </p>

      <h2>Availability</h2>
      <p>
        The service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We may
        change, suspend, or discontinue features at any time, and we do not guarantee that the service
        will be uninterrupted or error-free.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, we are not liable for any indirect, incidental, or
        consequential damages, or for decisions you make based on information from the service. Your
        use of the service is at your own discretion and risk.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms. When we do, we will change the &ldquo;last updated&rdquo; date
        above. Continued use after a change means you accept the updated terms.
      </p>

      <h2>Contact</h2>
      <p>
        For questions about these terms, contact the project maintainer at the email address listed on
        the project&rsquo;s public repository.
      </p>
    </LegalPage>
  );
}
