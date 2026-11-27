import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/auth";
import { MobileNav } from "@/components/MobileNav";

/**
 * Top navigation shared across the authenticated app pages. `showMentor`
 * reveals the mentor dashboard link for accounts with the mentor role.
 * Responsive: inline links from 900px up (`.shetu-desktop-nav`), a hamburger
 * panel below (MobileNav, `.shetu-mobile-nav`).
 */
export function AppHeader({
  active,
  showMentor = false,
  showAdmin = false,
}: {
  active: "chat" | "vault" | "mentorship" | "mentor" | "admin";
  showMentor?: boolean;
  showAdmin?: boolean;
}) {
  const items = [
    { href: "/chat", key: "chat", label: "Chat" },
    { href: "/vault", key: "vault", label: "Vault" },
    { href: "/mentorship", key: "mentorship", label: "Mentorship" },
    ...(showMentor ? [{ href: "/mentor", key: "mentor", label: "Mentor" }] : []),
    ...(showAdmin ? [{ href: "/admin", key: "admin", label: "Admin" }] : []),
  ];

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
          gap: 16,
          height: 60,
        }}
      >
        <MobileNav active={active} items={items} />

        <Link
          href="/chat"
          style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--text)" }}
        >
          <Image src="/logo.svg" alt="Shetu" width={28} height={28} />
          <strong style={{ fontSize: 17 }}>Shetu</strong>
        </Link>

        <nav className="shetu-desktop-nav" style={{ gap: 20, marginLeft: 8 }}>
          {items.map((item) => link(item.href, item.key, item.label))}
        </nav>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
          style={{ marginLeft: "auto" }}
        >
          <button className="btn btn-ghost" type="submit" style={{ padding: "7px 12px", fontSize: 14 }}>
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
