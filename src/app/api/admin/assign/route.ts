import { auth } from "@/auth";
import { z } from "zod";
import { hasRole } from "@/lib/auth/roles";
import { adminAssign } from "@/lib/mentorship/admin";

/**
 * Admin assignment API (role: admin).
 *   POST -> assign an open request to a mentor, or run the automatic match.
 *   Body: { requestUserId, requestId, mentorId } ("auto" runs the matcher).
 */
export const runtime = "nodejs";

const AssignSchema = z.object({
  requestUserId: z.string().min(1),
  requestId: z.string().min(1),
  mentorId: z.string().min(1),
});

async function userIdOrNull(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function POST(req: Request): Promise<Response> {
  const userId = await userIdOrNull();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!(await hasRole(userId, "admin"))) {
    return new Response("Forbidden", { status: 403 });
  }

  let parsed: z.infer<typeof AssignSchema>;
  try {
    parsed = AssignSchema.parse(await req.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Re-read the request from the assignment API on the repository side.
  const { listAllMentorshipRequests } = await import("@/lib/aws/repository");
  const all = await listAllMentorshipRequests();
  const request = all.find((r) => r.requestId === parsed.requestId && r.userId === parsed.requestUserId);
  if (!request) return new Response("Not found", { status: 404 });
  if (request.status !== "open") {
    return Response.json({ ok: false, detail: "only open requests can be assigned" }, { status: 409 });
  }

  const result = await adminAssign(request, parsed.mentorId);
  return Response.json({ ok: result.ok, mentorName: result.mentorName });
}
