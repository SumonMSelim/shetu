import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import Image from "next/image";

/**
 * Landing page.
 *
 * If already signed in, go straight to the chat. Otherwise show the pitch and a
 * Google sign-in button (an Auth.js server action). Copy is written in short,
 * simple sentences so students who are not native English speakers can follow.
 */
export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect("/chat");
  }

  return (
    <main>
      <TopBar />
      <Hero />
      <TrustStrip />
      <Features />
      <HowItWorks />
      <WhyTrust />
      <FinalCta />
      <Footer />
    </main>
  );
}

/* ------------------------------------------------------------------ */

function SignInButton({ size = 16 }: { size?: number }) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/chat" });
      }}
      style={{ display: "inline-block" }}
    >
      <button className="btn btn-primary" type="submit" style={{ fontSize: size }}>
        <GoogleGlyph />
        Continue with Google
      </button>
    </form>
  );
}

function TopBar() {
  return (
    <div style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
      <div
        className="container"
        style={{ display: "flex", alignItems: "center", height: 64, gap: 12 }}
      >
        <Image src="/logo.svg" alt="Shetu" width={34} height={34} priority />
        <strong style={{ fontSize: 20 }}>Shetu</strong>
        <div style={{ marginLeft: "auto" }}>
          <SignInButton size={14} />
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section style={{ background: "linear-gradient(180deg, #f1f6ff 0%, var(--bg) 100%)" }}>
      <div className="container" style={{ paddingTop: 72, paddingBottom: 72, textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            background: "#e4eeff",
            color: "var(--primary-dark)",
            fontWeight: 600,
            fontSize: 13.5,
            padding: "6px 14px",
            borderRadius: 999,
            marginBottom: 22,
          }}
        >
          Your guide to studying abroad
        </span>
        <h1 style={{ fontSize: 46, lineHeight: 1.12, margin: "0 auto 20px", maxWidth: 760 }}>
          Plan your studies abroad with help you can{" "}
          <span style={{ color: "var(--primary)" }}>trust</span>.
        </h1>
        <p
          className="muted"
          style={{ fontSize: 19, lineHeight: 1.6, margin: "0 auto 32px", maxWidth: 620 }}
        >
          Shetu is a friendly chat assistant. Ask any question about studying in another country.
          Get clear, reliable answers, with the real facts and the real costs. No tricks. No
          hidden fees.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <SignInButton size={16} />
          <a className="btn btn-ghost" href="#how" style={{ fontSize: 16 }}>
            See how it works
          </a>
        </div>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 16 }}>
          Free to start. Sign in with Google. Your information stays private.
        </p>
      </div>
    </section>
  );
}

function TrustStrip() {
  const items = [
    { k: "Reliable", d: "Answers come from official sources." },
    { k: "Trusted", d: "Every fact shows where it came from." },
    { k: "Authentic", d: "Real costs and real chances, always." },
  ];
  return (
    <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
      <div
        className="container"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, padding: "26px 20px" }}
      >
        {items.map((it) => (
          <div key={it.k} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <CheckBadge />
            <div>
              <div style={{ fontWeight: 700 }}>{it.k}</div>
              <div className="muted" style={{ fontSize: 14 }}>{it.d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Features() {
  const features = [
    { icon: "🎯", title: "Check if you are ready", body: "Share your grades and English score. Shetu tells you where you stand and what to improve." },
    { icon: "🎓", title: "Find programmes and scholarships", body: "See courses and funding that fit you. Shetu explains which ones are full and which are partial." },
    { icon: "💶", title: "Know the real cost", body: "Tuition, living, insurance, visa money. A clear, full list, so there are no surprises later." },
    { icon: "🛡️", title: "Spot agency tricks", body: "Tell Shetu about an offer. It warns you about false promises and hidden fees before you pay." },
    { icon: "📝", title: "Improve your documents", body: "Upload your statement or CV. Shetu gives simple, clear feedback to make it stronger." },
    { icon: "📚", title: "Prepare for IELTS", body: "Practice tasks at your level, with fair scores and tips to reach your target band." },
  ];
  return (
    <section className="container" style={{ paddingTop: 64, paddingBottom: 24 }}>
      <h2 style={{ fontSize: 30, textAlign: "center", margin: "0 0 10px" }}>
        Everything in one simple chat
      </h2>
      <p className="muted" style={{ textAlign: "center", fontSize: 16, margin: "0 auto 36px", maxWidth: 560 }}>
        No forms to fill. No confusing steps. Just ask, and get help at every stage.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 16 }}>
        {features.map((f) => (
          <div key={f.title} className="card" style={{ padding: 22 }}>
            <div style={{ fontSize: 26, marginBottom: 10 }}>{f.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>{f.title}</div>
            <div className="muted" style={{ fontSize: 14.5, lineHeight: 1.6 }}>{f.body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "1", title: "Sign in", body: "Use your Google account. It takes one click." },
    { n: "2", title: "Ask your question", body: "Type in your own words. Pick a starter if you are not sure where to begin." },
    { n: "3", title: "Get clear answers", body: "Reliable facts with sources. Save your documents. Ask for a real mentor anytime." },
  ];
  return (
    <section id="how" style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
      <div className="container" style={{ paddingTop: 56, paddingBottom: 56 }}>
        <h2 style={{ fontSize: 30, textAlign: "center", margin: "0 0 36px" }}>How it works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
          {steps.map((s) => (
            <div key={s.n} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 44, height: 44, borderRadius: "50%", background: "var(--primary)",
                  color: "#fff", fontWeight: 700, fontSize: 18, display: "flex",
                  alignItems: "center", justifyContent: "center", margin: "0 auto 14px",
                }}
              >
                {s.n}
              </div>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>{s.title}</div>
              <div className="muted" style={{ fontSize: 14.5, lineHeight: 1.6, maxWidth: 280, margin: "0 auto" }}>
                {s.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyTrust() {
  return (
    <section className="container" style={{ paddingTop: 64, paddingBottom: 56 }}>
      <div
        className="card"
        style={{
          padding: "36px 32px",
          background: "linear-gradient(180deg, #ffffff 0%, #f6faff 100%)",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: 26, margin: "0 0 12px" }}>Why students trust Shetu</h2>
        <p className="muted" style={{ fontSize: 16.5, lineHeight: 1.7, maxWidth: 640, margin: "0 auto" }}>
          Many agencies make money by hiding the truth. They promise too much and charge for things
          that are free. Shetu is built to be different. It only tells you facts that come from
          official sources, and it shows you where each fact came from. If something is not sure, it
          says so. Your interest comes first, always.
        </p>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section style={{ background: "var(--primary)", color: "#fff" }}>
      <div className="container" style={{ paddingTop: 56, paddingBottom: 56, textAlign: "center" }}>
        <h2 style={{ fontSize: 30, margin: "0 0 12px", color: "#fff" }}>
          Start planning today
        </h2>
        <p style={{ fontSize: 17, lineHeight: 1.6, margin: "0 auto 28px", maxWidth: 520, color: "#eaf1ff" }}>
          Ask your first question in under a minute. It is free to begin.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/chat" });
          }}
          style={{ display: "inline-block" }}
        >
          <button
            className="btn"
            type="submit"
            style={{ fontSize: 16, background: "#fff", color: "var(--primary-dark)" }}
          >
            <GoogleGlyph />
            Continue with Google
          </button>
        </form>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
      <div
        className="container"
        style={{ padding: "26px 20px", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}
      >
        <Image src="/logo.svg" alt="Shetu" width={26} height={26} />
        <strong>Shetu</strong>
        <span className="muted" style={{ fontSize: 13.5, marginLeft: "auto" }}>
          <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a>
        </span>
      </div>
    </footer>
  );
}

function CheckBadge() {
  return (
    <span
      style={{
        flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: "#e4eeff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
      aria-hidden="true"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M5 13l4 4 10-11" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.3 0-11.5-5.2-11.5-11.5S17.7 12.5 24 12.5c2.9 0 5.5 1.1 7.5 2.9l5.7-5.7C33.6 6.5 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.9 0 19.5-7.9 19.5-19.5 0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.6 19 12.5 24 12.5c2.9 0 5.5 1.1 7.5 2.9l5.7-5.7C33.6 6.5 29.1 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 43.5c5.2 0 9.6-2 12.9-5.2l-6-5c-1.8 1.3-4.1 2.2-6.9 2.2-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.2 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.1-2.2 3.9-4 5.3l6 5C40.9 36 43.5 30.6 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}
