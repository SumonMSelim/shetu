import { auth } from "@/auth";
import { hasRole } from "@/lib/auth/roles";
import { loadTriage } from "@/lib/mentorship/admin";

/**
 * Admin triage API (role: admin).
 *   GET -> every mentorship request grouped into open/active/completed,
 *          plus the mentor roster with per-mentor load.
 */
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!(await hasRole(userId, "admin"))) {
    return new Response("Forbidden", { status: 403 });
  }
  const triage = await loadTriage();
  return Response.json(triage);
}
