import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/auth";

/**
 * Top navigation shared across the authenticated app pages.
 */
export function AppHeader({ active }: { active: "chat" | "vault" | "mentorship" }) {
  const link = (href: string, key: string, label: string) => (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        color: active === key ? "var(--primary)" : "var(--muted)",
        fontWeight: active === key ? 700 : 500,
        fontSize: 15,
      }}
    >
      {label}
    </Link>
  );

  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          height: 60,
        }}
      >
        <Link
          href="/chat"
          style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--text)" }}
        >
          <Image src="/logo.svg" alt="Shetu" width={28} height={28} />
          <strong style={{ fontSize: 17 }}>Shetu</strong>
        </Link>

        <nav style={{ display: "flex", gap: 20, marginLeft: 8 }}>
          {link("/chat", "chat", "Chat")}
          {link("/vault", "vault", "Vault")}
          {link("/mentorship", "mentorship", "Mentorship")}
        </nav>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
          style={{ marginLeft: "auto" }}
        >
          <button className="btn btn-ghost" type="submit" style={{ padding: "7px 14px", fontSize: 14 }}>
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
