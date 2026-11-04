import Link from "next/link";
import Image from "next/image";

/**
 * Shared shell for the static legal pages (privacy, terms).
 * Public: these must be reachable without signing in, which the proxy matcher
 * allows because they live at top-level routes the auth guard does not protect.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="container" style={{ maxWidth: 760, paddingTop: 40, paddingBottom: 64 }}>
      <Link
        href="/"
        style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--text)" }}
      >
        <Image src="/logo.svg" alt="Shetu" width={30} height={30} />
        <strong style={{ fontSize: 18 }}>Shetu</strong>
      </Link>

      <h1 style={{ fontSize: 30, margin: "28px 0 6px" }}>{title}</h1>
      <p className="muted" style={{ margin: "0 0 28px", fontSize: 13.5 }}>Last updated: {updated}</p>

      <div className="legal-body">{children}</div>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "40px 0 20px" }} />
      <p className="muted" style={{ fontSize: 13.5 }}>
        <Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link> ·{" "}
        <Link href="/">Home</Link>
      </p>

      <style>{`
        .legal-body { font-size: 15.5px; line-height: 1.7; color: var(--text); }
        .legal-body h2 { font-size: 19px; margin: 28px 0 10px; }
        .legal-body p { margin: 0 0 14px; }
        .legal-body ul { margin: 0 0 14px; padding-left: 20px; }
        .legal-body li { margin: 0 0 7px; }
        .legal-body a { color: var(--primary); }
      `}</style>
    </main>
  );
}
