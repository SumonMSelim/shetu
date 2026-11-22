import { AppHeader } from "@/components/AppHeader";
import { auth } from "@/auth";
import { hasRole } from "@/lib/auth/roles";
import { listMentorshipRequests } from "@/lib/aws/repository";

/**
 * Mentorship status page.
 *
 * Shows the human-mentorship requests the student has made (via the chat agent
 * or directly), with the live status of each: open, matched, accepted or
 * completed, plus the mentor's name and meeting link once assigned.
 */
export default async function MentorshipPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const isMentor = userId ? await hasRole(userId, "mentor", "admin") : false;

  const requests = userId ? await listMentorshipRequests(userId) : [];
  requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <AppHeader active="mentorship" showMentor={isMentor} />
      <div className="container" style={{ maxWidth: 820, paddingTop: 28, paddingBottom: 40 }}>
        <h1 style={{ fontSize: 26, margin: "0 0 6px" }}>Human mentorship</h1>
        <p className="muted" style={{ margin: "0 0 22px", fontSize: 15.5, lineHeight: 1.6 }}>
          Shetu can arrange a real human mentor for high-stakes or personal decisions. Ask for one
          in the chat whenever you want, and your requests will appear here with their status.
        </p>

        {requests.length === 0 ? (
          <div className="card" style={{ padding: 18 }}>
            <p className="muted" style={{ margin: 0 }}>
              You have no mentorship requests yet. In the chat, say something like{" "}
              <em>&ldquo;I&rsquo;d like to talk to a human mentor&rdquo;</em> and Shetu will set it up.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {requests.map((r) => (
              <div key={r.requestId} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <strong style={{ flex: 1 }}>{r.topic}</strong>
                  <StatusBadge status={r.status} />
                </div>
                <p className="muted" style={{ margin: "8px 0 6px", fontSize: 14.5, lineHeight: 1.6 }}>
                  {r.message}
                </p>
                {r.mentorName && (
                  <div style={{ fontSize: 14.5, marginBottom: 6 }}>
                    Mentor: <strong>{r.mentorName}</strong>
                  </div>
                )}
                {r.status === "accepted" && r.meetingUrl && (
                  <div style={{ marginBottom: 6 }}>
                    <a href={r.meetingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 14.5 }}>
                      Join your session
                    </a>
                  </div>
                )}
                {r.status === "completed" && r.outcomeNote && (
                  <div className="muted" style={{ fontSize: 13.5, marginBottom: 6 }}>
                    Mentor&#39;s note: {r.outcomeNote}
                  </div>
                )}
                <div className="muted" style={{ fontSize: 12.5 }}>
                  Requested {new Date(r.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    open: { bg: "var(--accent-soft)", color: "var(--warn)", label: "Finding a mentor" },
    matched: { bg: "var(--accent-soft)", color: "var(--warn)", label: "Mentor assigned" },
    accepted: { bg: "#e6f4f1", color: "var(--primary-dark)", label: "Accepted" },
    declined: { bg: "var(--accent-soft)", color: "var(--warn)", label: "Looking for another mentor" },
    completed: { bg: "#eef1f1", color: "var(--muted)", label: "Completed" },
  };
  const s = map[status] ?? { bg: "#eef1f1", color: "var(--muted)", label: status };
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 12.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999 }}>
      {s.label}
    </span>
  );
}
