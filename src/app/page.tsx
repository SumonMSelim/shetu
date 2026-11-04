import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import Image from "next/image";

/**
 * Landing page.
 *
 * If already signed in, go straight to the chat. Otherwise show the pitch and a
 * Google sign-in button (an Auth.js server action).
 */
export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect("/chat");
  }

  return (
    <main className="container" style={{ paddingTop: 72, paddingBottom: 72 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 40 }}>
        <Image src="/logo.svg" alt="Shetu" width={44} height={44} priority />
        <strong style={{ fontSize: 22 }}>Shetu</strong>
      </div>

      <section style={{ maxWidth: 680 }}>
        <h1 style={{ fontSize: 42, lineHeight: 1.1, margin: "0 0 18px" }}>
          Plan your studies abroad with{" "}
          <span style={{ color: "var(--primary)" }}>honest</span> guidance.
        </h1>
        <p className="muted" style={{ fontSize: 18, lineHeight: 1.6, margin: "0 0 28px" }}>
          Too many students are misled by agencies that hide real costs, overpromise
          scholarships, and charge for free services. Shetu is different: a conversational
          advisor that gives you clear, source-cited answers on programmes, scholarships,
          real costs, visas, documents, and IELTS, and flags the agency tactics to watch
          out for. When you need a real person, you can ask for human mentorship.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/chat" });
          }}
        >
          <button className="btn btn-primary" type="submit" style={{ fontSize: 16 }}>
            <GoogleGlyph />
            Continue with Google
          </button>
        </form>

        <ul
          className="muted"
          style={{ marginTop: 34, lineHeight: 1.9, fontSize: 15, paddingLeft: 18 }}
        >
          <li>Ask anything in a chat, in plain language.</li>
          <li>Every figure is cited to an official source.</li>
          <li>Store your documents in a private Vault and get them reviewed.</li>
          <li>Request a human mentor whenever you want one.</li>
        </ul>
      </section>

      <footer
        className="muted"
        style={{ marginTop: 56, paddingTop: 20, borderTop: "1px solid var(--border)", fontSize: 13.5 }}
      >
        <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a>
      </footer>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.3 0-11.5-5.2-11.5-11.5S17.7 12.5 24 12.5c2.9 0 5.5 1.1 7.5 2.9l5.7-5.7C33.6 6.5 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.9 0 19.5-7.9 19.5-19.5 0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.6 19 12.5 24 12.5c2.9 0 5.5 1.1 7.5 2.9l5.7-5.7C33.6 6.5 29.1 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 43.5c5.2 0 9.6-2 12.9-5.2l-6-5c-1.8 1.3-4.1 2.2-6.9 2.2-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.2 43.5 24 43.5z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.1-2.2 3.9-4 5.3l6 5C40.9 36 43.5 30.6 43.5 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
