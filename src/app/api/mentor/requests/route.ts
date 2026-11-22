import { auth } from "@/auth";
import { hasRole } from "@/lib/auth/roles";
import { listRequestsForMentor } from "@/lib/aws/repository";

/**
 * Mentor inbox API (role: mentor).
 *   GET -> the requests assigned to this mentor (matched, accepted, completed)
 */
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!(await hasRole(userId, "mentor", "admin"))) {
    return new Response("Forbidden", { status: 403 });
  }
  const requests = await listRequestsForMentor(userId);
  return Response.json({ requests });
}
