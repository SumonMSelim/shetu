"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Admin triage view (client): open/active/completed request groups, mentor
 * load, and manual assignment. Talks to /api/admin/triage and /api/admin/assign.
 */

interface RequestView {
  requestId: string;
  userId: string;
  topic: string;
  message: string;
  status: string;
  createdAt: string;
  studentName?: string;
  studentEmail?: string;
  targetCountry?: string;
  mentorName?: string;
}

interface MentorView {
  userId: string;
  displayName: string;
  email: string;
  countries: string[];
  capacityPerWeek: number;
  available: boolean;
  activeCount: number;
}

interface Triage {
  open: RequestView[];
  active: RequestView[];
  completed: RequestView[];
  mentors: MentorView[];
}

const empty: Triage = { open: [], active: [], completed: [], mentors: [] };

export function AdminTriage() {
  const [triage, setTriage] = useState<Triage>(empty);
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/triage");
    if (res.ok) setTriage((await res.json()) as Triage);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const assign = async (r: RequestView, mentorId: string) => {
    setBusy(true);
    const res = await fetch("/api/admin/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestUserId: r.userId, requestId: r.requestId, mentorId }),
    });
    setBusy(false);
    if (res.ok) {
      const data = (await res.json()) as { mentorName?: string };
      setAssignment((a) => ({ ...a, [r.requestId]: data.mentorName ? `Assigned to ${data.mentorName}` : "Assigned" }));
      void load();
    } else {
      setAssignment((a) => ({ ...a, [r.requestId]: "Assignment failed" }));
    }
  };

  const card = (r: RequestView, children?: React.ReactNode) => (
    <div key={r.requestId} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <strong style={{ flex: 1 }}>{r.topic}</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>{r.status}</span>
      </div>
      <p className="muted" style={{ margin: "8px 0", fontSize: 14.5, lineHeight: 1.6 }}>
        {r.message}
      </p>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
        {r.studentName ? <>Student: {r.studentName}. </> : null}
        {r.studentEmail ? <>Contact: {r.studentEmail}. </> : null}
        {r.targetCountry ? <>Target: {r.targetCountry}. </> : null}
        {r.mentorName ? <>Mentor: {r.mentorName}. </> : null}
        Requested {new Date(r.createdAt).toLocaleString()}
      </div>
      {children}
    </div>
  );

  if (loading) {
    return <p className="muted" style={{ margin: 0 }}>Loading…</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="card" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 19, margin: "0 0 12px" }}>
          Open requests ({triage.open.length})
        </h2>
        {triage.open.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing waiting: every request has a mentor.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {triage.open.map((r) =>
              card(
                r,
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    className="input"
                    style={{ flex: 1, minWidth: 240 }}
                    value={assignment[r.requestId] ?? ""}
                    onChange={(e) => setAssignment({ ...assignment, [r.requestId]: e.target.value })}
                  >
                    <option value="auto">Automatic match</option>
                    {triage.mentors
                      .filter((m) => m.available)
                      .map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.displayName} ({m.activeCount}/{m.capacityPerWeek})
                        </option>
                      ))}
                  </select>
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => void assign(r, assignment[r.requestId] ?? "auto")}
                  >
                    Assign
                  </button>
                </div>,
              ),
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 19, margin: "0 0 12px" }}>
          Active ({triage.active.length})
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {triage.active.map((r) => card(r))}
          {triage.active.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>No active assignments.</p>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 19, margin: "0 0 12px" }}>
          Mentor load ({triage.mentors.length})
        </h2>
        {triage.mentors.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No mentor profiles yet. Mentors register at /mentor after getting the role.
          </p>
        ) : (
          <div className="muted" style={{ fontSize: 14, lineHeight: 1.8 }}>
            {triage.mentors.map((m) => (
              <div key={m.userId}>
                <strong>{m.displayName}</strong> — {m.email} — active {m.activeCount}/{m.capacityPerWeek} —{" "}
                {m.available ? "accepting" : "paused"} — countries: {m.countries.join(", ") || "none"}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 19, margin: "0 0 12px" }}>
          Completed ({triage.completed.length})
        </h2>
        {triage.completed.slice(0, 10).map((r) => card(r))}
        {triage.completed.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>No completed sessions yet.</p>
        )}
      </div>
    </div>
  );
}
