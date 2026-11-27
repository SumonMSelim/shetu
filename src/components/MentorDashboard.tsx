"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Mentor dashboard (client): profile editor plus the mentorship inbox.
 * Talks to /api/mentor/profile and /api/mentor/requests(+/[id]).
 */

interface MentorProfileForm {
  displayName: string;
  email: string;
  bio: string;
  countries: string;
  levels: string[];
  fields: string;
  languages: string;
  capacityPerWeek: number;
  available: boolean;
}

interface MentorRequestView {
  requestId: string;
  topic: string;
  message: string;
  status: string;
  createdAt: string;
  studentName?: string;
  studentEmail?: string;
  targetCountry?: string;
  level?: string;
  meetingUrl?: string;
  outcomeNote?: string;
}

const EMPTY_PROFILE: MentorProfileForm = {
  displayName: "",
  email: "",
  bio: "",
  countries: "",
  levels: ["master"],
  fields: "",
  languages: "English, Bangla",
  capacityPerWeek: 2,
  available: true,
};

const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const joinList = (list?: string[]): string => (list ?? []).join(", ");

export function MentorDashboard({ userId, fallbackName }: { userId: string; fallbackName: string }) {
  const [profile, setProfile] = useState<MentorProfileForm>(EMPTY_PROFILE);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [requests, setRequests] = useState<MentorRequestView[]>([]);
  const [busy, setBusy] = useState(false);
  const [meetingUrls, setMeetingUrls] = useState<Record<string, string>>({});
  const [outcomeNotes, setOutcomeNotes] = useState<Record<string, string>>({});

  const loadRequests = useCallback(async () => {
    const res = await fetch("/api/mentor/requests");
    if (res.ok) {
      const data = (await res.json()) as { requests: MentorRequestView[] };
      setRequests(data.requests);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/mentor/profile");
      if (res.ok) {
        const data = (await res.json()) as { profile: MentorProfileForm | null };
        if (data.profile) {
          setProfile({
            displayName: data.profile.displayName ?? fallbackName,
            email: data.profile.email ?? "",
            bio: data.profile.bio ?? "",
            countries: joinList((data.profile as unknown as { countries?: string[] }).countries),
            levels: (data.profile as unknown as { levels?: string[] }).levels ?? ["master"],
            fields: joinList((data.profile as unknown as { fields?: string[] }).fields),
            languages: joinList((data.profile as unknown as { languages?: string[] }).languages) || "English, Bangla",
            capacityPerWeek: (data.profile as unknown as { capacityPerWeek?: number }).capacityPerWeek ?? 2,
            available: (data.profile as unknown as { available?: boolean }).available ?? true,
          });
        } else {
          setProfile((p) => ({ ...p, displayName: fallbackName }));
        }
      }
      setProfileLoaded(true);
      void loadRequests();
    })();
  }, [fallbackName, loadRequests]);

  const saveProfile = async () => {
    setBusy(true);
    setProfileMessage("");
    const res = await fetch("/api/mentor/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: profile.displayName,
        email: profile.email,
        bio: profile.bio,
        countries: splitList(profile.countries),
        levels: profile.levels,
        fields: splitList(profile.fields),
        languages: splitList(profile.languages),
        capacityPerWeek: Number(profile.capacityPerWeek) || 0,
        available: profile.available,
      }),
    });
    setBusy(false);
    setProfileMessage(res.ok ? "Profile saved. New matching requests will land in your inbox." : "Could not save the profile: check the fields and try again.");
  };

  const act = async (requestId: string, action: "accept" | "decline" | "complete") => {
    setBusy(true);
    const res = await fetch(`/api/mentor/requests/${encodeURIComponent(requestId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        ...(action === "accept" && meetingUrls[requestId] ? { meetingUrl: meetingUrls[requestId] } : {}),
        ...(action === "complete" && outcomeNotes[requestId] ? { outcomeNote: outcomeNotes[requestId] } : {}),
      }),
    });
    setBusy(false);
    if (res.ok) void loadRequests();
  };

  const toggleLevel = (level: string) => {
    setProfile((p) => ({
      ...p,
      levels: p.levels.includes(level) ? p.levels.filter((l) => l !== level) : [...p.levels, level],
    }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="card" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 19, margin: "0 0 12px" }}>Your mentor profile</h2>
        {!profileLoaded ? (
          <p className="muted" style={{ margin: 0 }}>Loading…</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <label style={{ fontSize: 14 }}>
                Display name
                <input
                  className="input"
                  style={{ width: "100%", marginTop: 4 }}
                  value={profile.displayName}
                  onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                />
              </label>
              <label style={{ fontSize: 14 }}>
                Contact email
                <input
                  className="input"
                  type="email"
                  style={{ width: "100%", marginTop: 4 }}
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                />
              </label>
            </div>
            <label style={{ fontSize: 14 }}>
              Short bio (your background and how you help)
              <textarea
                className="input"
                style={{ width: "100%", marginTop: 4, minHeight: 80 }}
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <label style={{ fontSize: 14 }}>
                Countries you know well (comma-separated ISO codes, e.g. NL, DE)
                <input
                  className="input"
                  style={{ width: "100%", marginTop: 4 }}
                  value={profile.countries}
                  onChange={(e) => setProfile({ ...profile, countries: e.target.value })}
                />
              </label>
              <label style={{ fontSize: 14 }}>
                Fields (comma-separated, e.g. Computer Science, Engineering)
                <input
                  className="input"
                  style={{ width: "100%", marginTop: 4 }}
                  value={profile.fields}
                  onChange={(e) => setProfile({ ...profile, fields: e.target.value })}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
              <span>Languages (comma-separated)</span>
              <input
                className="input"
                style={{ width: 220 }}
                value={profile.languages}
                onChange={(e) => setProfile({ ...profile, languages: e.target.value })}
              />
              <span>Capacity / week</span>
              <input
                className="input"
                type="number"
                min={0}
                max={50}
                style={{ width: 70 }}
                value={profile.capacityPerWeek}
                onChange={(e) => setProfile({ ...profile, capacityPerWeek: Number(e.target.value) })}
              />
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={profile.available}
                  onChange={(e) => setProfile({ ...profile, available: e.target.checked })}
                />
                Accepting new mentees
              </label>
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 14 }}>
              {["bachelor", "master", "phd"].map((level) => (
                <label key={level} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={profile.levels.includes(level)}
                    onChange={() => toggleLevel(level)}
                  />
                  {level}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <button className="btn btn-primary" onClick={() => void saveProfile()} disabled={busy}>
                {busy ? "Saving…" : "Save profile"}
              </button>
              {profileMessage && <span className="muted" style={{ fontSize: 14 }}>{profileMessage}</span>}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 19, margin: "0 0 12px" }}>Inbox</h2>
        {requests.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No requests assigned yet. Students&#39; requests arrive here automatically when your
            profile matches their country, level and field.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {requests.map((r) => (
              <div key={r.requestId} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <strong style={{ flex: 1 }}>{r.topic}</strong>
                  <StatusPill status={r.status} />
                </div>
                <p className="muted" style={{ margin: "8px 0", fontSize: 14.5, lineHeight: 1.6 }}>
                  {r.message}
                </p>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                  {r.studentName ? <>Student: {r.studentName}. </> : null}
                  {r.studentEmail ? <>Contact: {r.studentEmail}. </> : null}
                  {r.targetCountry ? <>Target: {r.targetCountry}. </> : null}
                  {r.level ? <>Level: {r.level}. </> : null}
                  Requested {new Date(r.createdAt).toLocaleString()}
                </div>
                {r.status === "matched" && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      className="input"
                      placeholder="Meeting link (optional)"
                      style={{ flex: 1, minWidth: 220 }}
                      value={meetingUrls[r.requestId] ?? ""}
                      onChange={(e) => setMeetingUrls({ ...meetingUrls, [r.requestId]: e.target.value })}
                    />
                    <button className="btn btn-primary" disabled={busy} onClick={() => void act(r.requestId, "accept")}>
                      Accept
                    </button>
                    <button className="btn btn-ghost" disabled={busy} onClick={() => void act(r.requestId, "decline")}>
                      Decline
                    </button>
                  </div>
                )}
                {r.status === "accepted" && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {r.meetingUrl && (
                      <a href={r.meetingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>
                        Meeting link
                      </a>
                    )}
                    <input
                      className="input"
                      placeholder="Outcome note (optional)"
                      style={{ flex: 1, minWidth: 220 }}
                      value={outcomeNotes[r.requestId] ?? ""}
                      onChange={(e) => setOutcomeNotes({ ...outcomeNotes, [r.requestId]: e.target.value })}
                    />
                    <button className="btn btn-primary" disabled={busy} onClick={() => void act(r.requestId, "complete")}>
                      Mark completed
                    </button>
                  </div>
                )}
                {r.status === "completed" && r.outcomeNote && (
                  <div className="muted" style={{ fontSize: 13 }}>Outcome: {r.outcomeNote}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    matched: { bg: "var(--accent-soft)", color: "var(--warn)", label: "Needs your answer" },
    accepted: { bg: "#e6f4f1", color: "var(--primary-dark)", label: "Accepted" },
    completed: { bg: "#eef1f1", color: "var(--muted)", label: "Completed" },
  };
  const s = map[status] ?? { bg: "#eef1f1", color: "var(--muted)", label: status };
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 12.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999 }}>
      {s.label}
    </span>
  );
}
