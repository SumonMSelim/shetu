import { auth } from "@/auth";
import { z } from "zod";
import { listMentorshipRequests } from "@/lib/aws/repository";
import { createMentorshipRequest } from "@/lib/mentorship/service";
import { consumeBurst } from "@/lib/aws/rate-limit";
import { config } from "@/lib/config";

/**
 * Mentorship API.
 *
 *  GET  -> list the current user's mentorship requests and their status
 *  POST -> create a new mentorship request (also creatable by the agent tool)
 */
export const runtime = "nodejs";

const CreateSchema = z.object({
  topic: z.string().min(1).max(120),
  message: z.string().min(1).max(4000),
});

async function userIdOrNull(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET(): Promise<Response> {
  const userId = await userIdOrNull();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const requests = await listMentorshipRequests(userId);
  return Response.json({ requests });
}

export async function POST(req: Request): Promise<Response> {
  const userId = await userIdOrNull();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let c: z.infer<typeof CreateSchema>;
  try {
    c = CreateSchema.parse(await req.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (!(await consumeBurst(userId, "mentorship", config.limits.burst.mentorship))) {
    return new Response("Too many requests: please wait a moment.", { status: 429 });
  }

  const session = await auth();
  const email = (session?.user as { email?: string } | undefined)?.email;
  const name = (session?.user as { name?: string } | undefined)?.name;
  const result = await createMentorshipRequest({
    userId,
    studentEmail: email,
    studentName: name,
    topic: c.topic,
    message: c.message,
  });
  return Response.json({ ok: true, requestId: result.requestId, matched: result.matched, mentorName: result.mentorName });
}
