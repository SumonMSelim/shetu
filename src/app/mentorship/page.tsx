import { AppHeader } from "@/components/AppHeader";
import { auth } from "@/auth";
import { listMentorshipRequests } from "@/lib/aws/repository";

/**
 * Mentorship status page.
 *
 * Shows the human-mentorship requests the student has made (via the chat agent
 * or directly). Requests are created elsewhere; this is the tracking view.
 */
export default async function MentorshipPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const requests = userId ? await listMentorshipRequests(userId) : [];
  requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <AppHeader active="mentorship" />
      <div className="container" style={{ maxWidth: 820, paddingTop: 28, paddingBottom: 40 }}>
        <h1 style={{ fontSize: 26, margin: "0 0 6px" }}>Human mentorship</h1>
        <p className="muted" style={{ margin: "0 0 22px", fontSize: 15.5, lineHeight: 1.6 }}>
          Shetu can arrange a real human mentor for high-stakes or personal decisions. Ask for one
          in the chat whenever you want, and your requests will appear here.
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

function StatusBadge({ status }: { status: "open" | "assigned" | "closed" }) {
  const map = {
    open: { bg: "var(--accent-soft)", color: "var(--warn)", label: "Open" },
    assigned: { bg: "#e6f4f1", color: "var(--primary-dark)", label: "Mentor assigned" },
    closed: { bg: "#eef1f1", color: "var(--muted)", label: "Closed" },
  } as const;
  const s = map[status];
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 12.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999 }}>
      {s.label}
    </span>
  );
}
