"use client";

import { useEffect, useState, useCallback, useRef } from "react";

type Doc = {
  docId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  docType: string | null;
  uploadedAt: string;
  downloadUrl: string;
};

const DOC_TYPES = [
  { value: "sop", label: "Statement of Purpose" },
  { value: "cv", label: "CV / Resume" },
  { value: "transcript", label: "Transcript" },
  { value: "motivation", label: "Motivation Letter" },
  { value: "other", label: "Other" },
];

export function Vault() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("sop");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vault");
      if (!res.ok) throw new Error("Could not load your Vault.");
      const data = await res.json();
      setDocs(data.documents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error loading Vault.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      try {
        // 1) Ask the server for a presigned PUT URL.
        const presignRes = await fetch("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "presign",
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            docType,
          }),
        });
        if (!presignRes.ok) throw new Error("Could not start the upload.");
        const { docId, uploadUrl } = await presignRes.json();

        // 2) Upload the bytes straight to S3.
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) throw new Error("Upload to storage failed.");

        // 3) Commit the metadata.
        const commitRes = await fetch("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "commit",
            docId,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            docType,
          }),
        });
        if (!commitRes.ok) throw new Error("Could not save the document record.");

        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [docType, refresh],
  );

  return (
    <div className="container" style={{ maxWidth: 820, paddingTop: 28, paddingBottom: 40 }}>
      <h1 style={{ fontSize: 26, margin: "0 0 6px" }}>Your document Vault</h1>
      <p className="muted" style={{ margin: "0 0 22px", fontSize: 15.5, lineHeight: 1.6 }}>
        Store your documents privately. Text documents (.txt, .md) can be reviewed directly by the
        Document Coach in chat. You always keep your own originals - never hand them to an agency.
      </p>

      <div className="card" style={{ padding: 18, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 15 }}
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            ref={fileRef}
            type="file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
            disabled={uploading}
            style={{ fontSize: 14 }}
          />
          {uploading && <span className="muted">Uploading…</span>}
        </div>
      </div>

      {error && (
        <div
          className="card"
          style={{ padding: 14, marginBottom: 18, borderColor: "#f0c9b4", background: "var(--accent-soft)", color: "var(--warn)" }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="muted">No documents yet. Upload your first one above.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {docs.map((d) => (
            <div
              key={d.docId}
              className="card"
              style={{ padding: 14, display: "flex", alignItems: "center", gap: 14 }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{d.fileName}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {labelFor(d.docType)} · {(d.sizeBytes / 1024).toFixed(0)} KB ·{" "}
                  {new Date(d.uploadedAt).toLocaleDateString()}
                </div>
              </div>
              <a className="btn btn-ghost" href={d.downloadUrl} target="_blank" rel="noreferrer" style={{ padding: "7px 14px", fontSize: 14 }}>
                Download
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function labelFor(value: string | null): string {
  return DOC_TYPES.find((t) => t.value === value)?.label ?? "Document";
}
