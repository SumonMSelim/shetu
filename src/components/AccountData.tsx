"use client";

import { useState } from "react";

/**
 * Self-service GDPR controls (client): export the account's data as a JSON
 * download, and delete the account with an explicit confirmation step.
 * After deletion the session is signed out via the redirect below.
 */
export function AccountData() {
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");

  const exportData = async () => {
    setBusy("export");
    setMessage("");
    try {
      const res = await fetch("/api/gdpr/export");
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shetu-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Export downloaded.");
    } catch {
      setMessage("Export failed. Please try again.");
    }
    setBusy(null);
  };

  const deleteAccount = async () => {
    setBusy("delete");
    try {
      const res = await fetch("/api/gdpr/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) throw new Error("delete failed");
      // Signed-out client-side: the tombstone prevents old data from reappearing.
      window.location.href = "/?deleted=1";
    } catch {
      setMessage("Deletion failed. Please try again or contact support.");
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="card" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 19, margin: "0 0 8px" }}>Export your data</h2>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 14.5, lineHeight: 1.6 }}>
          Downloads a JSON file with everything stored about your account: your
          profile, every conversation and reply, mentorship requests, Vault
          document metadata, and audit traces. Vault files themselves are not in
          the file — download them from the Vault page.
        </p>
        <button className="btn btn-primary" disabled={busy !== null} onClick={() => void exportData()}>
          {busy === "export" ? "Preparing…" : "Download my data"}
        </button>
      </div>

      <div className="card" style={{ padding: 18, borderColor: "var(--warn)" }}>
        <h2 style={{ fontSize: 19, margin: "0 0 8px" }}>Delete your account</h2>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 14.5, lineHeight: 1.6 }}>
          Permanently deletes your profile, every conversation, mentorship
          requests, audit traces, and all Vault documents. This cannot be undone
          and you will be signed out. Your Google account itself is not touched.
        </p>
        {!confirming ? (
          <button className="btn btn-ghost" onClick={() => setConfirming(true)}>
            Delete my account…
          </button>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14.5, color: "var(--warn)", fontWeight: 700 }}>
              Are you sure? This is permanent.
            </span>
            <button className="btn" disabled={busy !== null} onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" disabled={busy !== null} onClick={() => void deleteAccount()}>
              {busy === "delete" ? "Deleting…" : "Yes, delete everything"}
            </button>
          </div>
        )}
        {message && <p className="muted" style={{ margin: "8px 0 0", fontSize: 14 }}>{message}</p>}
      </div>
    </div>
  );
}
