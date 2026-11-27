"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Mobile navigation for the app header: a hamburger button that opens a
 * panel with the section links below 900px. The desktop inline nav stays in
 * AppHeader (server-rendered); this component only renders the phone layout.
 */
export function MobileNav({
  active,
  items,
}: {
  active: string;
  items: { href: string; key: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);

  // Close the panel when the route changes so it does not follow the user.
  useEffect(() => {
    setOpen(false);
  }, [active]);

  return (
    <div className="shetu-mobile-nav" style={{ position: "relative" }}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {open && (
        <nav
          style={{
            position: "absolute",
            top: 48,
            left: 0,
            minWidth: 210,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow)",
            padding: 8,
            display: "flex",
            flexDirection: "column",
            zIndex: 20,
          }}
        >
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              onClick={() => setOpen(false)}
              style={{
                textDecoration: "none",
                color: active === item.key ? "var(--primary)" : "var(--text)",
                fontWeight: active === item.key ? 700 : 500,
                fontSize: 15.5,
                padding: "11px 12px",
                borderRadius: 8,
                background: active === item.key ? "var(--accent-soft)" : "transparent",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
