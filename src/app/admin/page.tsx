import { AppHeader } from "@/components/AppHeader";
import { auth } from "@/auth";
import { hasRole } from "@/lib/auth/roles";
import { AdminTriage } from "@/components/AdminTriage";

/**
 * Admin triage (role: admin).
 *
 * Every mentorship request grouped into open/active/completed, per-mentor
 * load, and assignment controls (specific mentor or the automatic match).
 */
export default async function AdminPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const isAdmin = userId ? await hasRole(userId, "admin") : false;

  return (
    <>
      <AppHeader active="mentorship" showAdmin={isAdmin} />
      <div className="container" style={{ maxWidth: 860, paddingTop: 28, paddingBottom: 40 }}>
        <h1 style={{ fontSize: 26, margin: "0 0 6px" }}>Admin triage</h1>
        <p className="muted" style={{ margin: "0 0 22px", fontSize: 15.5, lineHeight: 1.6 }}>
          Every mentorship request, per-mentor load, and manual assignment when the
          automatic match needs a human override.
        </p>

        {!isAdmin ? (
          <div className="card" style={{ padding: 18 }}>
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
              Admins only. Accounts are given the admin role by the Shetu team
              (<code>npm run set-role -- &lt;email&gt; admin</code>), then reload this page.
            </p>
          </div>
        ) : (
          <AdminTriage />
        )}
      </div>
    </>
  );
}
