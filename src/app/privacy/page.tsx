import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy - Shetu",
  description: "How Shetu collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="4 November 2026">
      <p>
        Shetu (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a conversational advisor that helps students
        plan higher education abroad with reliable, source-cited guidance. This policy explains what
        data we collect, why, and how we protect it. We have tried to keep it plain and clear,
        because being trustworthy with your information is the whole point of this project.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account basics from Google.</strong> When you sign in with Google, we receive your
          name, email address, and Google account identifier. We use this only to create and
          identify your account. We do not receive your Google password.
        </li>
        <li>
          <strong>Your profile details.</strong> Information you choose to share in conversation
          (such as your target country, study level, field, English test score, and budget) so the
          advice can be personalised.
        </li>
        <li>
          <strong>Documents you upload to the Vault.</strong> Files you add (for example, a statement
          of purpose, CV, or transcript) so they can be stored and, if you ask, reviewed.
        </li>
        <li>
          <strong>Your conversations.</strong> The messages you send and the responses you receive,
          to provide the service during your session.
        </li>
        <li>
          <strong>Mentorship requests.</strong> If you ask for a human mentor, the topic and summary
          you provide so a mentor can follow up.
        </li>
      </ul>

      <h2>How we use your data</h2>
      <ul>
        <li>To provide the advice and features you ask for.</li>
        <li>To personalise guidance to your situation.</li>
        <li>To store your documents securely so you can access and reuse them.</li>
        <li>To arrange human mentorship when you request it.</li>
      </ul>
      <p>
        We do <strong>not</strong> sell your data, and we do not use it for advertising.
      </p>

      <h2>AI processing</h2>
      <p>
        Your messages and any document you choose to have reviewed are processed by a large language
        model hosted on Amazon Bedrock (within Amazon Web Services) to generate responses. This
        processing happens to answer you; it is not used to train the underlying model.
      </p>

      <h2>Where your data is stored</h2>
      <ul>
        <li>
          <strong>Documents</strong> are stored in Amazon S3 with encryption at rest, in a private
          bucket with public access blocked. Each user&rsquo;s files are isolated, and uploads and
          downloads use short-lived, signed links.
        </li>
        <li>
          <strong>Profile, conversation metadata, and mentorship requests</strong> are stored in
          Amazon DynamoDB.
        </li>
        <li>Data is hosted in Amazon Web Services (United States region).</li>
      </ul>

      <h2>Sharing</h2>
      <p>
        We share your data only with the infrastructure providers that run the service (Google for
        sign-in; Amazon Web Services for hosting, storage, and AI processing), and with a human
        mentor only when you explicitly request mentorship. We may disclose information if required
        by law.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>You can delete documents from your Vault at any time.</li>
        <li>
          You can request deletion of your account and associated data by contacting us (see below).
        </li>
        <li>You can stop using the service and revoke Google access from your Google account.</li>
      </ul>

      <h2>Retention</h2>
      <p>
        We keep your data while your account is active. If you ask us to delete your account, we
        remove your profile, conversations, mentorship requests, and Vault documents, except where
        we are required to retain something by law.
      </p>

      <h2>Children</h2>
      <p>
        Shetu is intended for users who are 18 or older. It is not directed at children.
      </p>

      <h2>A note on accuracy</h2>
      <p>
        Shetu provides source-cited guidance to help you get started, but it is not a substitute for
        the official university and immigration pages, nor for professional legal or immigration
        advice. Always verify important details with the official source.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy. When we do, we will change the &ldquo;last updated&rdquo; date
        above.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions or deletion requests, contact the project maintainer at the email
        address listed on the project&rsquo;s public repository.
      </p>
    </LegalPage>
  );
}
