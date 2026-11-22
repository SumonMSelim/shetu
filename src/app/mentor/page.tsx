import { AppHeader } from "@/components/AppHeader";
import { auth } from "@/auth";
import { hasRole } from "@/lib/auth/roles";
import { MentorDashboard } from "@/components/MentorDashboard";

/**
 * Mentor dashboard (role: mentor).
 *
 * Profile editor plus the mentorship inbox. Role is checked here on the Node
 * runtime (middleware stays role-free); the API routes enforce it as well.
 */
export default async function MentorPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const name = (session?.user as { name?: string } | undefined)?.name;
  const isMentor = userId ? await hasRole(userId, "mentor", "admin") : false;

  return (
    <>
      <AppHeader active="mentor" showMentor={isMentor} />
      <div className="container" style={{ maxWidth: 820, paddingTop: 28, paddingBottom: 40 }}>
        <h1 style={{ fontSize: 26, margin: "0 0 6px" }}>Mentor dashboard</h1>
        <p className="muted" style={{ margin: "0 0 22px", fontSize: 15.5, lineHeight: 1.6 }}>
          Your profile and the students waiting for your guidance.
        </p>

        {!isMentor ? (
          <div className="card" style={{ padding: 18 }}>
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
              The mentor programme is invite-based: accounts are given the mentor role by the
              Shetu team. If you have been invited, ask the team to run
              <code style={{ marginLeft: 6 }}>npm run set-role</code> with your account email, then
              reload this page.
            </p>
          </div>
        ) : (
          <MentorDashboard userId={userId!} fallbackName={name ?? ""} />
        )}
      </div>
    </>
  );
}
