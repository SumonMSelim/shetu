import { auth } from "@/auth";
import { z } from "zod";
import { hasRole } from "@/lib/auth/roles";
import { getRequestForMentor } from "@/lib/aws/repository";
import { mentorRespond } from "@/lib/mentorship/service";

/**
 * Mentor action API (role: mentor).
 *   POST -> accept / decline / complete one assigned request.
 * Only the mentor the request was assigned to may act on it.
 */
export const runtime = "nodejs";

const ActionSchema = z.object({
  action: z.enum(["accept", "decline", "complete"]),
  meetingUrl: z.string().url().max(400).optional(),
  outcomeNote: z.string().max(1000).optional(),
});

async function userIdOrNull(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await userIdOrNull();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!(await hasRole(userId, "mentor", "admin"))) {
    return new Response("Forbidden", { status: 403 });
  }
  const { id } = await params;

  let parsed: z.infer<typeof ActionSchema>;
  try {
    parsed = ActionSchema.parse(await req.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const request = await getRequestForMentor(userId, id);
  if (!request) return new Response("Not found", { status: 404 });

  const result = await mentorRespond(request, parsed.action, {
    meetingUrl: parsed.meetingUrl,
    outcomeNote: parsed.outcomeNote,
  });
  return Response.json({ ok: result.ok, status: result.status, reassigned: result.reassigned });
}
